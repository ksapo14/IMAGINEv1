import base64
import json
import unittest
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from backend.services.gemini_pipeline import (
    GeminiConfigurationError,
    GeminiPipeline,
)


def text_response(
    *,
    strategy: str = "none",
    diagram_html: str = "",
    image_prompt: str = "",
    visual_alt: str = "",
) -> dict[str, Any]:
    structured = {
        "title": "How cells make energy",
        "bullets": [
            "Mitochondria convert stored chemical energy into ATP.",
            "ATP supplies usable energy for cellular work.",
        ],
        "visualStrategy": strategy,
        "diagramHtml": diagram_html,
        "imagePrompt": image_prompt,
        "visualAlt": visual_alt,
    }
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps(structured)}],
                }
            }
        ]
    }


def image_response() -> dict[str, Any]:
    encoded = base64.b64encode(b"test-image").decode("ascii")
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": encoded,
                            }
                        }
                    ]
                }
            }
        ]
    }


class StubTransport:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.responses = responses
        self.requests: list[tuple[urllib.request.Request, float]] = []

    def __call__(
        self,
        request: urllib.request.Request,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        self.requests.append((request, timeout_seconds))
        return self.responses.pop(0)


class GeminiPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_text_only_uses_one_lite_request(self) -> None:
        transport = StubTransport([text_response()])
        pipeline = GeminiPipeline(
            api_key="server-secret",
            text_model="gemini-2.5-flash-lite",
            image_model="gemini-2.5-flash-image",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 1)
        request, _ = transport.requests[0]
        self.assertIn("gemini-2.5-flash-lite", request.full_url)
        self.assertNotIn("server-secret", request.full_url)
        self.assertEqual(
            dict(request.header_items())["X-goog-api-key"],
            "server-secret",
        )
        request_body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(
            request_body["generationConfig"]["maxOutputTokens"],
            768,
        )
        self.assertIsNone(result["visual"])

    async def test_diagram_strategy_returns_sanitized_html_without_image_request(
        self,
    ) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="diagram",
                    diagram_html=(
                        '<div class="diagram fake" onclick="bad()">'
                        '<div class="node node-primary">Glucose</div>'
                        '<script>alert(1)</script>'
                        '<span class="arrow">-></span>'
                        '<div class="node node-secondary">ATP</div>'
                        "</div>"
                    ),
                    visual_alt="Flowchart showing glucose becoming ATP.",
                )
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Make a flowchart of ATP production.")

        self.assertEqual(len(transport.requests), 1)
        self.assertEqual(result["visual"]["kind"], "diagram")
        self.assertIn('class="diagram"', result["visual"]["html"])
        self.assertIn('class="node node-primary"', result["visual"]["html"])
        self.assertNotIn("onclick", result["visual"]["html"])
        self.assertNotIn("script", result["visual"]["html"])

    async def test_image_strategy_uses_no_text_prompt_prefix(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="image",
                    image_prompt="A clean illustration of ATP production.",
                    visual_alt="Illustration showing ATP production.",
                ),
                image_response(),
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Draw how a cell makes ATP.")

        self.assertEqual(len(transport.requests), 2)
        image_request, _ = transport.requests[1]
        self.assertIn("gemini-2.5-flash-image", image_request.full_url)
        image_body = json.loads(image_request.data.decode("utf-8"))
        prompt = image_body["contents"][0]["parts"][0]["text"]
        self.assertIn("absolutely no text", prompt)
        self.assertEqual(result["visual"]["kind"], "generated")
        self.assertNotIn("source", result["visual"])

    async def test_repeated_similar_input_uses_persistent_cache(self) -> None:
        cache_dir = Path.cwd() / ".cache" / f"test-visual-cache-{uuid.uuid4().hex}"
        transport = StubTransport(
            [
                text_response(
                    strategy="diagram",
                    diagram_html=(
                        '<div class="diagram">'
                        '<div class="node node-primary">Evaporation</div>'
                        '<span class="arrow">-></span>'
                        '<div class="node node-secondary">Condensation</div>'
                        "</div>"
                    ),
                    visual_alt="Water cycle flowchart.",
                )
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_dir=cache_dir,
        )

        first = await pipeline.generate(
            "Create a flowchart diagram of water cycle evaporation condensation precipitation."
        )

        cached_transport = StubTransport([])
        cached_pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=cached_transport,
            cache_dir=cache_dir,
        )
        second = await cached_pipeline.generate(
            "Make a flowchart diagram of water cycle evaporation condensation precipitation."
        )

        self.assertEqual(first, second)
        self.assertEqual(cached_transport.requests, [])

    async def test_image_failure_returns_notes_without_retry(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="image",
                    image_prompt="A diagram of ATP production.",
                    visual_alt="ATP production diagram.",
                ),
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "No image available"}]}}
                    ]
                },
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Draw ATP production.")

        self.assertEqual(len(transport.requests), 2)
        self.assertIsNone(result["visual"])
        self.assertIsNotNone(result["warning"])

    async def test_missing_key_fails_before_any_request(self) -> None:
        transport = StubTransport([])
        pipeline = GeminiPipeline(
            api_key="",
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaises(GeminiConfigurationError):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(transport.requests, [])

    async def test_malformed_notes_do_not_trigger_visual_calls(self) -> None:
        transport = StubTransport(
            [
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "not-json"}]}}
                    ]
                }
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaisesRegex(RuntimeError, "malformed notes"):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 1)


if __name__ == "__main__":
    unittest.main()
