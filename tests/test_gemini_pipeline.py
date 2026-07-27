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
    CACHE_SCHEMA_VERSION,
    DIAGRAM_THINKING_BUDGET,
    GeminiConfigurationError,
    GeminiPipeline,
    GeminiProviderError,
    _default_json_transport,
    _infer_diagram_type,
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
    blocks = [
        {
            "type": "block",
            "id": f"b{index + 1}",
            "heading": f"Car stage {index + 1}",
            "description": f"What happens during stage {index + 1}.",
        }
        for index in range(node_count)
    ]
    diagram = {
        "version": 3,
        "type": diagram_type,
        "title": "How a car creates motion",
        "description": "Energy moves through connected vehicle systems.",
    }
    if diagram_type == "flowchart":
        diagram["lines"] = [
            {"type": "blockLine", "id": "main-line", "blocks": blocks}
        ]
    elif diagram_type == "tree":
        diagram["root"] = {
            "id": "root",
            "heading": "Vehicle",
            "description": "The complete system.",
            "children": [
                {
                    "id": "power",
                    "heading": "Power",
                    "description": "Creates motion.",
                    "children": [],
                },
                {
                    "id": "control",
                    "heading": "Control",
                    "description": "Directs motion.",
                    "children": [],
                },
            ],
        }
    elif diagram_type == "vennDiagram":
        diagram.update(
            {
                "left": {"heading": "Electric", "items": ["Battery"]},
                "right": {"heading": "Gas", "items": ["Fuel tank"]},
                "similar": {"heading": "Both", "items": ["Wheels"]},
            }
        )
    elif diagram_type == "pieChart":
        diagram["portions"] = [
            {"heading": "Motion", "proportion": 70},
            {"heading": "Heat", "proportion": 30},
        ]
    else:
        diagram.update(
            {
                "center": {
                    "type": "round",
                    "id": "vehicle",
                    "heading": "Vehicle",
                    "description": "The central system.",
                },
                "surrounding": [
                    {
                        "type": "round",
                        "id": "power",
                        "heading": "Power",
                        "description": "Creates motion.",
                    },
                    {
                        "type": "round",
                        "id": "control",
                        "heading": "Control",
                        "description": "Directs motion.",
                    },
                ],
            }
        )
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                diagram
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
        self.assertEqual(notes_body["generationConfig"]["maxOutputTokens"], 512)
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
        self.assertEqual(
            request_body["generationConfig"]["thinkingConfig"]["thinkingBudget"],
            DIAGRAM_THINKING_BUDGET,
        )
        self.assertGreater(DIAGRAM_THINKING_BUDGET, 0)
        self.assertEqual(
            request_body["generationConfig"]["responseMimeType"],
            "application/json",
        )
        response_schema = request_body["generationConfig"]["responseSchema"]
        self.assertEqual(response_schema["properties"]["type"]["enum"], ["flowchart"])
        self.assertIn("lines", response_schema["required"])
        self.assertNotIn("root", response_schema["properties"])
        self.assertEqual(visual["kind"], "diagram")
        self.assertEqual(visual["diagram"]["version"], 3)
        self.assertEqual(visual["diagram"]["type"], "flowchart")
        self.assertEqual(len(visual["diagram"]["lines"]), 1)
        self.assertEqual(len(visual["diagram"]["lines"][0]["blocks"]), 8)
        self.assertEqual(
            visual["diagram"]["lines"][0]["blocks"][0]["type"], "block"
        )
        self.assertNotIn("html", visual)

    async def test_explicit_user_diagram_type_overrides_visual_prompt_heuristics(
        self,
    ) -> None:
        cases = (
            (
                "Create a pie chart comparing product categories.",
                "Show categories as a sequential flowchart.",
                "pieChart",
            ),
            (
                "Create a tree diagram of revenue percentages.",
                "Show revenue percentages as proportional pie slices.",
                "tree",
            ),
        )

        for user_input, misleading_visual_prompt, expected_type in cases:
            with self.subTest(expected_type=expected_type):
                transport = StubTransport(
                    [
                        text_response(
                            strategy="diagram",
                            visual_prompt=misleading_visual_prompt,
                            visual_alt="Requested diagram.",
                        ),
                        planner_response(
                            layout_mode="visualDominant",
                            blocks=[
                                {
                                    **diagram_block(),
                                    "visualPrompt": misleading_visual_prompt,
                                    "visualAlt": "Requested diagram.",
                                }
                            ],
                        ),
                        diagram_response(diagram_type=expected_type),
                    ]
                )
                pipeline = GeminiPipeline(
                    text_api_key=TEST_DEV_KEY,
                    diagram_model=TEST_DIAGRAM_MODEL,
                    text_model=TEST_TEXT_MODEL,
                    transport=transport,
                    cache_enabled=False,
                )

                composition = await pipeline.generate(user_input)
                visual_request = composition["_visualRequests"][0]
                self.assertEqual(visual_request["diagramType"], expected_type)
                self.assertTrue(
                    visual_request["visualPrompt"].startswith(
                        f"REQUIRED_DIAGRAM_TYPE={expected_type}\n"
                    )
                )

                visual = await pipeline.generate_visual(
                    visual_request["visualStrategy"],
                    visual_request["visualPrompt"],
                    visual_request["visualAlt"],
                )
                self.assertEqual(visual["diagram"]["type"], expected_type)
                diagram_request = json.loads(
                    transport.requests[2][0].data.decode("utf-8")
                )
                self.assertEqual(
                    diagram_request["generationConfig"]["responseSchema"]
                    ["properties"]["type"]["enum"],
                    [expected_type],
                )

    def test_explicit_visual_prompt_type_overrides_topic_words(self) -> None:
        cases = (
            ("Flowchart for baking an apple pie", "flowchart"),
            ("Flow chart comparing both tree branches", "flowchart"),
            ("Tree diagram of percentages and market shares", "tree"),
            ("Tree chart comparing pie distributions", "tree"),
            ("Use a tree diagram to organize pie chart categories", "tree"),
            ("Venn diagram comparing pie charts", "vennDiagram"),
            ("VennDiagram for tree branch percentages", "vennDiagram"),
            ("Pie chart showing a sequential process", "pieChart"),
            ("Use pieChart for tree species", "pieChart"),
            ("Mind map about tree branches and percentages", "mindMap"),
            ("MindMap for a comparison of both categories", "mindMap"),
        )

        for visual_prompt, expected_type in cases:
            with self.subTest(visual_prompt=visual_prompt):
                self.assertEqual(
                    _infer_diagram_type(visual_prompt),
                    expected_type,
                )

    def test_cache_schema_invalidates_old_diagram_type_choices(self) -> None:
        self.assertEqual(CACHE_SCHEMA_VERSION, 4)

    async def test_diagram_retries_invalid_argument_with_compatibility_payload(
        self,
    ) -> None:
        requests: list[tuple[urllib.request.Request, float]] = []
        responses: list[object] = [
            GeminiProviderError(
                "The AI provider could not complete the request. "
                "HTTP 400 INVALID_ARGUMENT: Request contains an invalid argument."
            ),
            diagram_response(),
        ]

        def transport(
            request: urllib.request.Request,
            timeout_seconds: float,
        ) -> dict[str, Any]:
            requests.append((request, timeout_seconds))
            response = responses.pop(0)
            if isinstance(response, Exception):
                raise response
            assert isinstance(response, dict)
            return response

        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            diagram_model=TEST_DIAGRAM_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "diagram",
            "Explain a process from start to finish.",
            "Process flowchart",
        )

        self.assertEqual(visual["diagram"]["type"], "flowchart")
        self.assertEqual(len(requests), 2)
        first_body = json.loads(requests[0][0].data.decode("utf-8"))
        retry_body = json.loads(requests[1][0].data.decode("utf-8"))
        self.assertIn("responseSchema", first_body["generationConfig"])
        self.assertNotIn("responseSchema", retry_body["generationConfig"])
        self.assertNotIn("responseMimeType", retry_body["generationConfig"])
        self.assertNotIn("thinkingConfig", retry_body["generationConfig"])

    async def test_diagram_compatibility_retry_accepts_json_fence(self) -> None:
        fenced_response = diagram_response()
        raw_json = fenced_response["candidates"][0]["content"]["parts"][0]["text"]
        fenced_response["candidates"][0]["content"]["parts"][0]["text"] = (
            f"```json\n{raw_json}\n```"
        )
        responses: list[object] = [
            GeminiProviderError("HTTP 400 INVALID_ARGUMENT"),
            fenced_response,
        ]

        def transport(
            request: urllib.request.Request,
            timeout_seconds: float,
        ) -> dict[str, Any]:
            response = responses.pop(0)
            if isinstance(response, Exception):
                raise response
            assert isinstance(response, dict)
            return response

        pipeline = GeminiPipeline(
            text_api_key=TEST_DEV_KEY,
            diagram_model=TEST_DIAGRAM_MODEL,
            transport=transport,
            cache_enabled=False,
        )

        visual = await pipeline.generate_visual(
            "diagram",
            "Explain a process.",
            "Process flowchart",
        )

        self.assertEqual(visual["diagram"]["type"], "flowchart")

    async def test_diagram_repairs_duplicate_component_ids(self) -> None:
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
                                                "version": 3,
                                                "type": "flowchart",
                                                "title": "Car power flow",
                                                "description": "Fuel becomes motion.",
                                                "lines": [
                                                    {
                                                        "type": "blockLine",
                                                        "id": "line",
                                                        "blocks": [
                                                            {
                                                                "type": "block",
                                                                "id": "same",
                                                                "heading": "Fuel ignites",
                                                                "description": "Combustion releases energy.",
                                                            },
                                                            {
                                                                "type": "block",
                                                                "id": "same-2",
                                                                "heading": "Wheels turn",
                                                                "description": "The drivetrain transfers torque.",
                                                            },
                                                            {
                                                                "type": "block",
                                                                "id": "same",
                                                                "heading": "Car moves",
                                                                "description": "The repaired ID must keep advancing.",
                                                            },
                                                        ],
                                                    }
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

        blocks = visual["diagram"]["lines"][0]["blocks"]
        self.assertEqual(blocks[0]["id"], "same")
        self.assertEqual(blocks[1]["id"], "same-2")
        self.assertEqual(blocks[2]["id"], "same-3")

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
            "tree",
            "vennDiagram",
            "pieChart",
            "mindMap",
        }

        for diagram_type in diagram_types:
            with self.subTest(diagram_type=diagram_type):
                response = diagram_response(diagram_type=diagram_type)
                raw = json.loads(response["candidates"][0]["content"]["parts"][0]["text"])
                normalized = _normalize_diagram(
                    raw,
                    "Vehicle system diagram",
                )
                self.assertEqual(normalized["type"], diagram_type)
                self.assertEqual(normalized["version"], 3)

    def test_diagram_schema_does_not_use_numeric_enum_values(self) -> None:
        from backend.services.gemini_pipeline import DIAGRAM_RESPONSE_SCHEMA

        self.assertNotIn("anyOf", DIAGRAM_RESPONSE_SCHEMA)
        version_schema = DIAGRAM_RESPONSE_SCHEMA["properties"]["version"]
        self.assertEqual(version_schema["type"], "INTEGER")
        self.assertNotIn("enum", version_schema)
        self.assertEqual(version_schema["minimum"], 3)
        self.assertEqual(version_schema["maximum"], 3)
        self.assertEqual(
            set(DIAGRAM_RESPONSE_SCHEMA["properties"]["type"]["enum"]),
            {"flowchart", "tree", "vennDiagram", "pieChart", "mindMap"},
        )

    def test_normalizer_scales_pie_portions_to_one_hundred(self) -> None:
        normalized = _normalize_diagram(
            {
                "version": 3,
                "type": "pieChart",
                "title": "Energy output",
                "description": "Provider proportions need repair.",
                "portions": [
                    {"heading": "Motion", "proportion": 2},
                    {"heading": "Heat", "proportion": 1},
                ],
            },
            "Energy output",
        )

        self.assertEqual(
            sum(portion["proportion"] for portion in normalized["portions"]),
            100,
        )

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

    async def test_only_repeated_exact_input_uses_persistent_cache(self) -> None:
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
                diagram_response(diagram_type="flowchart", node_count=4),
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
            "Create a flowchart diagram of water cycle evaporation condensation precipitation."
        )

        self.assertEqual(first_result, second)
        self.assertEqual(cached_transport.requests, [])
        self.assertIsNone(
            cached_pipeline._get_cached_result(
                "Make a flowchart diagram of water cycle evaporation condensation precipitation."
            )
        )

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
