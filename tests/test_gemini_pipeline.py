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
    visual_prompt: str = "",
    visual_alt: str = "",
) -> dict[str, Any]:
    structured = {
        "title": "How cells make energy",
        "bullets": [
            "Mitochondria convert stored chemical energy into ATP.",
            "ATP supplies usable energy for cellular work.",
        ],
        "visualStrategy": strategy,
        "visualPrompt": visual_prompt,
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


def diagram_response(html: str) -> dict[str, Any]:
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps({"html": html})}],
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
            256,
        )
        self.assertIsNone(result["visual"])

    async def test_diagram_strategy_returns_visual_job_spec_without_image_request(
        self,
    ) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="diagram",
                    visual_prompt="Show glucose becoming ATP through cellular respiration.",
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
        self.assertIsNone(result["visual"])
        self.assertEqual(result["_visualStrategy"], "diagram")
        self.assertIn("glucose", result["_visualPrompt"].lower())

    async def test_generate_visual_returns_sanitized_rich_diagram(self) -> None:
        transport = StubTransport(
            [
                diagram_response(
                    '<section class="diagram fake" onclick="bad()">'
                    '<div class="step input"><span class="step-number">1</span>'
                    '<h3 class="title">Glucose enters</h3>'
                    '<p class="detail">Chemical energy is available.</p></div>'
                    '<script>alert(1)</script>'
                    '<span class="arrow">-></span>'
                    '<div class="step output"><strong>ATP</strong>'
                    '<p class="note">Usable cell energy.</p></div>'
                    "</section>"
                )
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "diagram",
            "Show glucose becoming ATP through cellular respiration.",
            "Flowchart showing glucose becoming ATP.",
        )

        self.assertEqual(len(transport.requests), 1)
        request_body = json.loads(transport.requests[0][0].data.decode("utf-8"))
        self.assertEqual(request_body["generationConfig"]["maxOutputTokens"], 1800)
        self.assertEqual(visual["kind"], "diagram")
        self.assertIn('class="diagram"', visual["html"])
        self.assertIn('class="step input"', visual["html"])
        self.assertIn("<h3", visual["html"])
        self.assertNotIn("onclick", visual["html"])
        self.assertNotIn("script", visual["html"])

    async def test_image_strategy_uses_no_text_prompt_prefix(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="image",
                    visual_prompt="A clean illustration of ATP production.",
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
        visual = await pipeline.generate_visual(
            result["_visualStrategy"],
            result["_visualPrompt"],
            result["_visualAlt"],
        )

        self.assertEqual(len(transport.requests), 2)
        image_request, _ = transport.requests[1]
        self.assertIn("gemini-2.5-flash-image", image_request.full_url)
        image_body = json.loads(image_request.data.decode("utf-8"))
        prompt = image_body["contents"][0]["parts"][0]["text"]
        self.assertIn("absolutely no text", prompt)
        self.assertEqual(visual["kind"], "generated")
        self.assertNotIn("source", visual)

    async def test_repeated_similar_input_uses_persistent_cache(self) -> None:
        cache_dir = Path.cwd() / ".cache" / f"test-visual-cache-{uuid.uuid4().hex}"
        transport = StubTransport(
            [
                text_response(
                    strategy="diagram",
                    visual_prompt="Show evaporation, condensation, and precipitation in the water cycle.",
                    visual_alt="Water cycle flowchart.",
                ),
                diagram_response(
                    '<section class="diagram">'
                    '<div class="step input">Evaporation</div>'
                    '<span class="arrow">-></span>'
                    '<div class="step output">Condensation</div>'
                    "</section>"
                ),
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
        visual = await pipeline.generate_visual(
            first["_visualStrategy"],
            first["_visualPrompt"],
            first["_visualAlt"],
        )
        first_result = {
            "title": first["title"],
            "bullets": first["bullets"],
            "visual": visual,
            "warning": None,
        }
        pipeline.cache_result(
            "Create a flowchart diagram of water cycle evaporation condensation precipitation.",
            first_result,
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

        self.assertEqual(first_result, second)
        self.assertEqual(cached_transport.requests, [])

    async def test_image_failure_returns_notes_without_retry(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="image",
                    visual_prompt="A diagram of ATP production.",
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
        visual = await pipeline.generate_visual(
            result["_visualStrategy"],
            result["_visualPrompt"],
            result["_visualAlt"],
        )

        self.assertEqual(len(transport.requests), 2)
        self.assertIsNone(visual)

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
