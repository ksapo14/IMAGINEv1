import base64
import io
import json
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import patch

from backend.services.gemini_pipeline import (
    GeminiConfigurationError,
    GeminiPipeline,
    GeminiProviderError,
    _default_json_transport,
    _normalize_diagram,
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


def diagram_response(
    *,
    diagram_type: str = "flowchart",
    node_count: int = 5,
) -> dict[str, Any]:
    nodes = [
        {
            "id": f"n{index + 1}",
            "label": f"Car stage {index + 1}",
            "description": f"What happens during stage {index + 1}.",
            "role": (
                "start"
                if index == 0
                else "end"
                if index == node_count - 1
                else "process"
            ),
            "lane": "powertrain" if diagram_type == "swimlane" else "",
            "group": "Power" if index < node_count / 2 else "Motion",
        }
        for index in range(node_count)
    ]
    edges = [
        {
            "source": f"n{index + 1}",
            "target": f"n{index + 2}",
            "label": "then",
            "kind": "direct",
        }
        for index in range(node_count - 1)
    ]
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "diagramType": diagram_type,
                                    "title": "How a car creates motion",
                                    "summary": "Energy moves through connected vehicle systems.",
                                    "nodes": nodes,
                                    "edges": edges,
                                    "lanes": (
                                        [{"id": "powertrain", "label": "Powertrain"}]
                                        if diagram_type == "swimlane"
                                        else []
                                    ),
                                }
                            )
                        }
                    ],
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


TEST_DEV_KEY = "dev-secret"
TEST_PROD_KEY = "prod-secret"
TEST_TEXT_MODEL = "text-test-model"
TEST_DIAGRAM_MODEL = "diagram-test-model"
TEST_IMAGE_MODEL = "image-test-model"


class GeminiTransportTests(unittest.TestCase):
    def test_http_error_includes_sanitized_provider_context(self) -> None:
        body = json.dumps(
            {
                "error": {
                    "code": 400,
                    "message": "Publisher model is not found.",
                    "status": "INVALID_ARGUMENT",
                }
            }
        ).encode("utf-8")
        error = urllib.error.HTTPError(
            "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
            400,
            "Bad Request",
            {},
            io.BytesIO(body),
        )
        request = urllib.request.Request("https://example.test")

        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(
                GeminiProviderError,
                "HTTP 400 INVALID_ARGUMENT: Publisher model is not found",
            ):
                _default_json_transport(request, 1)

    def test_quota_error_reports_429_context(self) -> None:
        body = json.dumps(
            {
                "error": {
                    "code": 429,
                    "message": "Quota exceeded.",
                    "status": "RESOURCE_EXHAUSTED",
                }
            }
        ).encode("utf-8")
        error = urllib.error.HTTPError(
            "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
            429,
            "Too Many Requests",
            {},
            io.BytesIO(body),
        )
        request = urllib.request.Request("https://example.test")

        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(
                GeminiProviderError,
                "temporarily quota-limited. HTTP 429 RESOURCE_EXHAUSTED",
            ):
                _default_json_transport(request, 1)


class GeminiPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_text_only_uses_notes_and_planner_requests(self) -> None:
        transport = StubTransport([text_response(), planner_response()])
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        result = await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 2)
        notes_request, _ = transport.requests[0]
        planner_request, _ = transport.requests[1]
        self.assertIn(TEST_TEXT_MODEL, notes_request.full_url)
        self.assertIn(TEST_TEXT_MODEL, planner_request.full_url)
        self.assertNotIn(TEST_DEV_KEY, notes_request.full_url)
        self.assertEqual(
            dict(notes_request.header_items())["X-goog-api-key"],
            TEST_DEV_KEY,
        )
        self.assertEqual(
            dict(planner_request.header_items())["X-goog-api-key"],
            TEST_DEV_KEY,
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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
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

    async def test_generate_visual_returns_structured_adaptive_diagram(self) -> None:
        transport = StubTransport([diagram_response(node_count=9)])
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            diagram_model=TEST_DIAGRAM_MODEL,
            image_model=TEST_IMAGE_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "diagram",
            "Show glucose becoming ATP through cellular respiration.",
            "Flowchart showing glucose becoming ATP.",
        )

        self.assertEqual(len(transport.requests), 1)
        self.assertIn(TEST_DIAGRAM_MODEL, transport.requests[0][0].full_url)
        self.assertEqual(
            dict(transport.requests[0][0].header_items())["X-goog-api-key"],
            TEST_DEV_KEY,
        )
        request_body = json.loads(transport.requests[0][0].data.decode("utf-8"))
        self.assertEqual(request_body["generationConfig"]["maxOutputTokens"], 4200)
        self.assertEqual(visual["kind"], "diagram")
        self.assertEqual(visual["diagram"]["version"], 2)
        self.assertEqual(visual["diagram"]["type"], "flowchart")
        self.assertEqual(len(visual["diagram"]["nodes"]), 9)
        self.assertEqual(len(visual["diagram"]["edges"]), 8)
        self.assertEqual(visual["diagram"]["nodes"][0]["role"], "start")
        self.assertEqual(visual["diagram"]["nodes"][-1]["role"], "end")
        self.assertNotIn("html", visual)

    async def test_diagram_accepts_omitted_optional_structure_fields(self) -> None:
        transport = StubTransport(
            [
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps(
                                            {
                                                "diagramType": "flowchart",
                                                "title": "Car power flow",
                                                "nodes": [
                                                    {
                                                        "id": "n1",
                                                        "label": "Fuel ignites",
                                                        "description": "Combustion releases energy.",
                                                        "role": "start",
                                                    },
                                                    {
                                                        "id": "n2",
                                                        "label": "Wheels turn",
                                                        "description": "The drivetrain transfers torque.",
                                                        "role": "end",
                                                    },
                                                ],
                                                "edges": [
                                                    {"source": "n1", "target": "n2"}
                                                ],
                                            }
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        )
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            diagram_model=TEST_DIAGRAM_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "diagram",
            "Explain how a car turns fuel into motion.",
            "Car power flow",
        )

        self.assertEqual(visual["diagram"]["nodes"][0]["lane"], "")
        self.assertEqual(visual["diagram"]["nodes"][0]["group"], "")
        self.assertEqual(visual["diagram"]["edges"][0]["kind"], "direct")

    async def test_diagram_provider_error_is_not_silently_discarded(self) -> None:
        transport = StubTransport(
            [{"candidates": [{"content": {"parts": [{"text": "not-json"}]}}]}]
        )
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            diagram_model=TEST_DIAGRAM_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaisesRegex(GeminiProviderError, "malformed diagram data"):
            await pipeline.generate_visual(
                "diagram",
                "Explain a process.",
                "Process diagram",
            )

    def test_normalizer_supports_every_hardcoded_diagram_type(self) -> None:
        diagram_types = {
            "flowchart",
            "swimlane",
            "decisionTree",
            "cycle",
            "timeline",
            "comparisonMatrix",
            "systemMap",
            "causeEffect",
        }
        base_nodes = [
            {
                "id": f"n{index}",
                "label": f"Node {index}",
                "description": "Specific explanation",
                "role": "process",
                "lane": "driver",
                "group": "Vehicle",
            }
            for index in range(1, 6)
        ]
        base_edges = [
            {
                "source": f"n{index}",
                "target": f"n{index + 1}",
                "label": "next",
                "kind": "direct",
            }
            for index in range(1, 5)
        ]

        for diagram_type in diagram_types:
            with self.subTest(diagram_type=diagram_type):
                normalized = _normalize_diagram(
                    {
                        "diagramType": diagram_type,
                        "title": "Vehicle system",
                        "summary": "A structured explanation.",
                        "nodes": base_nodes,
                        "edges": base_edges,
                        "lanes": [{"id": "driver", "label": "Driver"}],
                    },
                    "Vehicle system diagram",
                )
                self.assertEqual(normalized["type"], diagram_type)
                self.assertEqual(len(normalized["nodes"]), 5)
                self.assertTrue(normalized["edges"])

        cycle = _normalize_diagram(
            {
                "diagramType": "cycle",
                "title": "Engine cycle",
                "summary": "",
                "nodes": base_nodes,
                "edges": base_edges,
                "lanes": [],
            },
            "Engine cycle",
        )
        self.assertTrue(any(edge["kind"] == "feedback" for edge in cycle["edges"]))

    def test_normalizer_repairs_partial_sequential_connections(self) -> None:
        nodes = [
            {
                "id": f"n{index}",
                "label": f"Stage {index}",
                "description": "Specific explanation",
                "role": "process",
                "lane": "",
                "group": "",
            }
            for index in range(1, 5)
        ]
        normalized = _normalize_diagram(
            {
                "diagramType": "flowchart",
                "title": "Four-stage process",
                "summary": "",
                "nodes": nodes,
                "edges": [
                    {
                        "source": "n1",
                        "target": "n2",
                        "label": "begins",
                        "kind": "direct",
                    },
                    {
                        "source": "missing",
                        "target": "n4",
                        "label": "invalid",
                        "kind": "direct",
                    },
                ],
                "lanes": [],
            },
            "Four-stage process",
        )

        pairs = {(edge["source"], edge["target"]) for edge in normalized["edges"]}
        self.assertTrue({("n1", "n2"), ("n2", "n3"), ("n3", "n4")} <= pairs)
        self.assertFalse(any(edge["source"] == "missing" for edge in normalized["edges"]))

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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
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
        self.assertIn(TEST_IMAGE_MODEL, image_request.full_url)
        self.assertEqual(
            dict(transport.requests[0][0].header_items())["X-goog-api-key"],
            TEST_DEV_KEY,
        )
        self.assertEqual(
            dict(transport.requests[1][0].header_items())["X-goog-api-key"],
            TEST_DEV_KEY,
        )
        self.assertEqual(
            dict(image_request.header_items())["X-goog-api-key"],
            TEST_PROD_KEY,
        )
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
                diagram_response(diagram_type="cycle", node_count=4),
            ]
        )
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            diagram_model=TEST_DIAGRAM_MODEL,
            image_model=TEST_IMAGE_MODEL,
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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            diagram_model=TEST_DIAGRAM_MODEL,
            image_model=TEST_IMAGE_MODEL,
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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
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

    async def test_missing_text_key_fails_before_any_request(self) -> None:
        transport = StubTransport([])
        pipeline = GeminiPipeline(
            text_api_key="",
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaises(GeminiConfigurationError):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(transport.requests, [])

    async def test_missing_image_key_returns_none_without_request(self) -> None:
        transport = StubTransport([image_response()])
        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            image_api_key="",
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "image",
            "A diagram of ATP production.",
            "ATP production diagram.",
        )

        self.assertIsNone(visual)
        self.assertEqual(transport.requests, [])

    async def test_legacy_gemini_key_env_is_ignored(self) -> None:
        transport = StubTransport([])
        with patch.dict(
            "os.environ",
            {
                "GEMINI_API_KEY": "legacy-secret",
                "GEMINI_TEXT_MODEL": TEST_TEXT_MODEL,
                "GEMINI_IMAGE_MODEL": TEST_IMAGE_MODEL,
            },
            clear=True,
        ):
            pipeline = GeminiPipeline(
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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
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
            text_api_key=TEST_DEV_KEY,
            image_api_key=TEST_PROD_KEY,
            text_model=TEST_TEXT_MODEL,
            image_model=TEST_IMAGE_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        with self.assertRaisesRegex(RuntimeError, "malformed composition"):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 2)


if __name__ == "__main__":
    unittest.main()
