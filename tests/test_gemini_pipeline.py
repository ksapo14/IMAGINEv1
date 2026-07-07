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


def planner_response(
    *,
    layout_mode: str = "textDominant",
    palette: str = "sage",
    blocks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    structured = {
        "title": "Cell energy map",
        "layoutMode": layout_mode,
        "theme": {
            "palette": palette,
            "density": "comfortable",
            "motion": "subtle",
        },
        "blocks": blocks
        if blocks is not None
        else [
            {
                "kind": "notes",
                "title": "Core idea",
                "body": "",
                "items": [
                    "Mitochondria convert stored chemical energy into ATP.",
                    "ATP supplies usable energy for cellular work.",
                ],
                "size": "medium",
                "visualKind": "none",
                "visualPrompt": "",
                "visualAlt": "",
            }
        ],
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


def diagram_block() -> dict[str, Any]:
    return {
        "kind": "diagram",
        "title": "ATP production flow",
        "body": "",
        "items": [],
        "size": "large",
        "visualKind": "diagram",
        "visualPrompt": "Show glucose becoming ATP through cellular respiration.",
        "visualAlt": "Flowchart showing glucose becoming ATP.",
    }


def image_block() -> dict[str, Any]:
    return {
        "kind": "image",
        "title": "ATP illustration",
        "body": "",
        "items": [],
        "size": "large",
        "visualKind": "image",
        "visualPrompt": "A clean illustration of ATP production.",
        "visualAlt": "Illustration showing ATP production.",
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
    async def test_text_only_uses_notes_and_planner_requests(self) -> None:
        transport = StubTransport([text_response(), planner_response()])
        pipeline = GeminiPipeline(
            api_key="server-secret",
            text_model="gemini-2.5-flash-lite",
            image_model="gemini-2.5-flash-image",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 2)
        notes_request, _ = transport.requests[0]
        planner_request, _ = transport.requests[1]
        self.assertIn("gemini-2.5-flash-lite", notes_request.full_url)
        self.assertNotIn("server-secret", notes_request.full_url)
        self.assertEqual(
            dict(notes_request.header_items())["X-goog-api-key"],
            "server-secret",
        )
        notes_body = json.loads(notes_request.data.decode("utf-8"))
        planner_body = json.loads(planner_request.data.decode("utf-8"))
        self.assertEqual(notes_body["generationConfig"]["maxOutputTokens"], 256)
        self.assertEqual(planner_body["generationConfig"]["maxOutputTokens"], 900)
        self.assertEqual(result["layoutMode"], "textDominant")
        self.assertEqual(result["blocks"][0]["kind"], "notes")
        self.assertEqual(result["_visualRequests"], [])

    async def test_diagram_preference_returns_visual_request_for_block(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="diagram",
                    visual_prompt="Show glucose becoming ATP through cellular respiration.",
                    visual_alt="Flowchart showing glucose becoming ATP.",
                ),
                planner_response(
                    layout_mode="visualDominant",
                    blocks=[
                        {
                            "kind": "notes",
                            "title": "Energy transfer",
                            "body": "",
                            "items": ["Glucose stores energy before ATP captures it."],
                            "size": "medium",
                            "visualKind": "none",
                            "visualPrompt": "",
                            "visualAlt": "",
                        },
                        diagram_block(),
                    ],
                ),
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Make a flowchart of ATP production.")

        self.assertEqual(len(transport.requests), 2)
        self.assertEqual(result["layoutMode"], "visualDominant")
        self.assertEqual(result["blocks"][1]["blockId"], "diagram-2")
        self.assertEqual(result["blocks"][1]["size"], "wide")
        self.assertEqual(result["_visualRequests"][0]["blockId"], "diagram-2")
        self.assertIn("glucose", result["_visualRequests"][0]["visualPrompt"].lower())

    async def test_generate_visual_returns_sanitized_rich_diagram(self) -> None:
        transport = StubTransport(
            [
                diagram_response(
                    '<section class="diagram hero-diagram workflow wide fake" onclick="bad()">'
                    '<div class="step start input reveal"><span class="step-number">1</span>'
                    '<h3 class="title">Glucose enters</h3>'
                    '<p class="detail">Chemical energy is available.</p></div>'
                    '<script>alert(1)</script>'
                    '<span class="arrow draw">-></span>'
                    '<span class="edge-label yes">pass</span>'
                    '<div class="step end output pulse"><strong>ATP</strong>'
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
        self.assertIn("gemini-2.5-flash", transport.requests[0][0].full_url)
        request_body = json.loads(transport.requests[0][0].data.decode("utf-8"))
        self.assertEqual(request_body["generationConfig"]["maxOutputTokens"], 4200)
        self.assertEqual(visual["kind"], "diagram")
        self.assertIn('class="diagram hero-diagram workflow wide"', visual["html"])
        self.assertIn('class="step start input reveal"', visual["html"])
        self.assertIn('class="edge-label yes"', visual["html"])
        self.assertIn('class="arrow draw"', visual["html"])
        self.assertIn('class="step end output pulse"', visual["html"])
        self.assertNotIn("onclick", visual["html"])
        self.assertNotIn("script", visual["html"])

    async def test_image_strategy_uses_no_text_prompt_prefix(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="image",
                    visual_prompt="A clean illustration of ATP production.",
                    visual_alt="ATP production illustration.",
                ),
                planner_response(
                    layout_mode="visualDominant",
                    blocks=[image_block()],
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
        visual_request = result["_visualRequests"][0]
        visual = await pipeline.generate_visual(
            visual_request["visualStrategy"],
            visual_request["visualPrompt"],
            visual_request["visualAlt"],
        )

        self.assertEqual(len(transport.requests), 3)
        image_request, _ = transport.requests[2]
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
                planner_response(
                    layout_mode="sequence",
                    blocks=[
                        {
                            **diagram_block(),
                            "visualPrompt": "Show evaporation, condensation, and precipitation in the water cycle.",
                            "visualAlt": "Water cycle flowchart.",
                        }
                    ],
                ),
                diagram_response(
                    '<section class="diagram hero-diagram">'
                    '<div class="step input">Evaporation</div>'
                    '<span class="arrow draw">-></span>'
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
        visual_request = first["_visualRequests"][0]
        visual = await pipeline.generate_visual(
            visual_request["visualStrategy"],
            visual_request["visualPrompt"],
            visual_request["visualAlt"],
        )
        first_result = {key: value for key, value in first.items() if key != "_visualRequests"}
        first_result["blocks"][0]["visual"] = visual
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

    async def test_image_failure_returns_none_without_retry(self) -> None:
        transport = StubTransport(
            [
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

        visual = await pipeline.generate_visual(
            "image",
            "A diagram of ATP production.",
            "ATP production diagram.",
        )

        self.assertEqual(len(transport.requests), 1)
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

    async def test_malformed_notes_do_not_trigger_planner_call(self) -> None:
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

    async def test_malformed_planner_fails_after_notes_call(self) -> None:
        transport = StubTransport(
            [
                text_response(),
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "not-json"}]}}
                    ]
                },
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaisesRegex(RuntimeError, "malformed composition"):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 2)


if __name__ == "__main__":
    unittest.main()
