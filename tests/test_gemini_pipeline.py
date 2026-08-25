import base64
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from backend.services.gemini_pipeline import (
    DEFAULT_IMAGE_MODEL,
    DEFAULT_TEXT_MODEL,
    GeminiConfigurationError,
    GeminiPipeline,
    GeminiProviderError,
    _default_json_transport,
)
from backend.services.whiteboard_intent import classify_whiteboard_intent
from backend.services.visual_director_prompt import (
    VISUAL_DIRECTOR_RESPONSE_SCHEMA,
    VISUAL_DIRECTOR_SYSTEM_INSTRUCTION,
)


TEST_KEY = "server-secret"
TEST_MODEL = "gemini-test"


def director_decision(action: str = "create") -> dict[str, object]:
    return {
        "boardStrategy": "integrate",
        "action": action,
        "conceptKey": "water-cycle",
        "title": "Water cycle",
        "headingMode": "show",
        "summaryBullets": ["Water evaporates.", "Vapor returns as rain."],
        "summary": "Water rises as vapor and returns as rain.",
        "contentModes": ["visual", "notes", "diagram"],
        "confidence": 0.91,
        "targetSceneId": "",
        "requestedFootprint": "full",
        "sceneLayout": "cycle",
        "renderMode": "generatedAsset",
        "imagePrompt": "A water cycle outline with water and a cloud.",
        "scene": {
            "entities": [
                {
                    "id": "water", "type": "circle", "x": 0, "y": 0,
                    "width": 2, "height": 2, "label": "Water",
                    "pose": "neutral", "facing": "front",
                },
                {
                    "id": "cloud", "type": "rectangle", "x": 4, "y": 0,
                    "width": 3, "height": 2, "label": "Cloud",
                    "pose": "neutral", "facing": "front",
                },
            ],
            "connections": [
                {
                    "id": "rise", "fromId": "water", "toId": "cloud",
                    "label": "evaporates", "direction": "forward",
                }
            ],
        },
    }


def gemini_text(value: dict[str, object] | str) -> dict[str, object]:
    text = value if isinstance(value, str) else json.dumps(value)
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


class StubTransport:
    def __init__(self, responses: list[dict[str, object]]) -> None:
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout_seconds):
        self.requests.append((request, timeout_seconds))
        return self.responses.pop(0)


class GeminiPipelineTests(unittest.IsolatedAsyncioTestCase):
    def pipeline(self, transport: StubTransport, *, image_key: str = TEST_KEY) -> GeminiPipeline:
        return GeminiPipeline(
            text_api_key=TEST_KEY,
            image_api_key=image_key,
            text_model=TEST_MODEL,
            image_model="image-test",
            transport=transport,
        )

    async def test_live_turn_uses_one_structured_director_request(self) -> None:
        transport = StubTransport([gemini_text(director_decision())])
        result = await self.pipeline(transport).generate(
            "Explain evaporation.",
            context={"turnSequence": 4, "board": {"version": 7, "currentPage": 1}},
        )

        self.assertEqual(len(transport.requests), 1)
        request = transport.requests[0][0]
        body = json.loads(request.data)
        self.assertIn("Live Assistant", body["systemInstruction"]["parts"][0]["text"])
        self.assertEqual(body["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(
            body["generationConfig"]["thinkingConfig"],
            {"thinkingLevel": "medium"},
        )
        self.assertLessEqual(body["generationConfig"]["temperature"], 0.2)
        self.assertLessEqual(body["generationConfig"]["maxOutputTokens"], 2400)
        self.assertNotIn(TEST_KEY, request.full_url)
        self.assertNotIn(TEST_KEY, request.data.decode())
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["boardVersion"], 8)
        self.assertEqual(result["turnSequence"], 4)
        self.assertEqual(result["stickScene"]["version"], 1)

    async def test_notes_only_promotes_to_small_without_diagram_or_image_job(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["notes"],
            "requestedFootprint": "small",
            "renderMode": "structured",
            "imagePrompt": "",
            "scene": {"entities": [], "connections": []},
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate("Define evaporation.")
        self.assertEqual(result["contentModes"], ["notes"])
        self.assertEqual(result["requestedFootprint"], "small")
        self.assertEqual((result["placement"]["width"], result["placement"]["height"]), (8, 5))
        self.assertIsNone(result["stickScene"])
        self.assertIsNone(result["_imageRequest"])

    async def test_diagram_only_is_promoted_to_medium(self) -> None:
        raw = director_decision()
        raw.update({"contentModes": ["diagram"], "summaryBullets": [], "requestedFootprint": "small", "renderMode": "structured", "imagePrompt": ""})
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate("Show evaporation.")
        self.assertEqual(result["requestedFootprint"], "medium")
        self.assertEqual((result["placement"]["width"], result["placement"]["height"]), (12, 6))

    async def test_structured_visual_uses_the_concept_scene_without_connections(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["visual"],
            "summaryBullets": [],
            "requestedFootprint": "small",
            "renderMode": "structured",
            "imagePrompt": "",
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Show the water cycle as a simple outline."
        )
        self.assertEqual(result["requestedFootprint"], "medium")
        self.assertIsNotNone(result["stickScene"])
        self.assertIsNone(result["_imageRequest"])

    async def test_generated_visual_discards_unused_scene_and_keeps_image_request(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["visual"],
            "summaryBullets": [],
            "requestedFootprint": "medium",
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain evaporation."
        )
        self.assertIsNone(result["stickScene"])
        self.assertEqual(result["renderMode"], "generatedAsset")
        self.assertEqual(result["_imageRequest"], {
            "imagePrompt": raw["imagePrompt"],
            "visualAlt": raw["summary"],
        })

    async def test_required_stick_scenes_still_reject_empty_entities(self) -> None:
        cases = (
            {
                "contentModes": ["diagram"], "summaryBullets": [],
                "requestedFootprint": "medium", "renderMode": "structured",
                "imagePrompt": "",
            },
            {
                "contentModes": ["visual"], "summaryBullets": [],
                "requestedFootprint": "medium", "renderMode": "structured",
                "imagePrompt": "",
            },
        )
        for overrides in cases:
            with self.subTest(content_modes=overrides["contentModes"]):
                raw = director_decision()
                raw.update({
                    **overrides,
                    "scene": {"entities": [], "connections": []},
                })
                with self.assertRaisesRegex(GeminiProviderError, "empty StickScene"):
                    await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                        "Explain evaporation."
                    )

    async def test_visual_and_diagram_cannot_duplicate_one_structured_scene(self) -> None:
        raw = director_decision()
        raw.update({"renderMode": "structured", "imagePrompt": ""})
        with self.assertRaisesRegex(GeminiProviderError, "generated visual asset"):
            await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                "Explain the water cycle."
            )

    async def test_heading_mode_shows_primary_and_is_preserved_on_update(self) -> None:
        first = director_decision()
        first["headingMode"] = "inheritPrimary"
        first_result = await self.pipeline(StubTransport([gemini_text(first)])).generate(
            "Explain the water cycle."
        )
        self.assertEqual(first_result["headingMode"], "show")

        update = director_decision("update")
        update["targetSceneId"] = "existing"
        update["headingMode"] = "show"
        updated = await self.pipeline(StubTransport([gemini_text(update)])).generate(
            "Clarify evaporation.",
            context={
                "turnSequence": 2,
                "board": {
                    "version": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "title": "Water cycle",
                        "headingMode": "inheritPrimary",
                        "contentModes": ["diagram"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 12, "height": 6},
                    }],
                },
            },
        )
        self.assertEqual(updated["headingMode"], "inheritPrimary")

    async def test_explicit_modes_are_exact_and_keep_cue_order(self) -> None:
        cases = {
            "I want a diagram of how a car functions.": ["diagram"],
            "Let's look at a summary of how a car works.": ["notes"],
            "Give me a summary, then a diagram of the car.": ["notes", "diagram"],
            "Show a diagram and then a summary.": ["diagram", "notes"],
            "Show a diagram, not a summary.": ["diagram"],
        }
        for prompt, expected in cases.items():
            with self.subTest(prompt=prompt):
                result = await self.pipeline(
                    StubTransport([gemini_text(director_decision())])
                ).generate(prompt)
                self.assertEqual(result["contentModes"], expected)
                self.assertEqual(bool(result["summaryBullets"]), "notes" in expected)
                self.assertEqual(bool(result["stickScene"]), "diagram" in expected)
                self.assertEqual(result["renderMode"], "structured")

    async def test_ordinary_prompt_keeps_the_models_smallest_subset(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["visual"],
            "summaryBullets": [],
            "requestedFootprint": "small",
            "scene": {"entities": [], "connections": []},
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain evaporation."
        )
        self.assertEqual(result["contentModes"], ["visual"])

    async def test_negation_never_leaks_a_forbidden_model_mode(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["diagram"],
            "summaryBullets": [],
            "requestedFootprint": "medium",
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain evaporation without a diagram."
        )
        self.assertEqual(result["contentModes"], ["visual"])
        self.assertIsNone(result["stickScene"])

    def test_explicit_intent_uses_boundaries_negation_and_action_precedence(self) -> None:
        combined = classify_whiteboard_intent(
            "Add a diagram and summary, but do not include an image."
        )
        self.assertEqual(combined.required_modes, ("diagram", "notes"))
        self.assertEqual(combined.forbidden_modes, ("visual",))
        self.assertEqual(combined.action, "create")
        self.assertEqual(
            classify_whiteboard_intent("Add and then correct that diagram.").action,
            "update",
        )
        self.assertEqual(
            classify_whiteboard_intent("Those are notable changes.").required_modes,
            (),
        )
        self.assertEqual(
            classify_whiteboard_intent("Do not create a diagram.").forbidden_modes,
            ("diagram",),
        )
        self.assertIsNone(classify_whiteboard_intent("Explain climate change.").action)
        for prompt in ("Also explain another part of the car.",):
            with self.subTest(prompt=prompt):
                self.assertEqual(classify_whiteboard_intent(prompt).action, "create")
        for prompt in (
            "Next, teach the braking system.",
            "And now cover the transmission.",
        ):
            with self.subTest(prompt=prompt):
                self.assertIsNone(classify_whiteboard_intent(prompt).action)
        for prompt in (
            "Actually, make that a summary.",
            "I meant the rear brakes.",
            "Make that a diagram.",
        ):
            with self.subTest(prompt=prompt):
                self.assertEqual(classify_whiteboard_intent(prompt).action, "update")

    def test_explicit_intent_bounds_long_negation_to_its_clause(self) -> None:
        diagram = classify_whiteboard_intent("Do not show me any sort of diagram.")
        self.assertEqual(diagram.required_modes, ())
        self.assertEqual(diagram.forbidden_modes, ("diagram",))

        visual_diagram = classify_whiteboard_intent(
            "Do not include any kind of visual diagram."
        )
        self.assertEqual(visual_diagram.required_modes, ())
        self.assertEqual(visual_diagram.forbidden_modes, ("visual", "diagram"))

        contrasted = classify_whiteboard_intent(
            "Do not show a diagram but give me a summary."
        )
        self.assertEqual(contrasted.required_modes, ("notes",))
        self.assertEqual(contrasted.forbidden_modes, ("diagram",))
        self.assertEqual(
            classify_whiteboard_intent("Not just a visual diagram.").required_modes,
            ("visual", "diagram"),
        )
        instead = classify_whiteboard_intent(
            "Do not show a diagram and instead use a visual."
        )
        self.assertEqual(instead.required_modes, ("visual",))
        self.assertEqual(instead.forbidden_modes, ("diagram",))

    def test_actually_only_marks_clause_level_corrections(self) -> None:
        self.assertIsNone(
            classify_whiteboard_intent(
                "Explain how photosynthesis actually works."
            ).action
        )
        self.assertEqual(
            classify_whiteboard_intent(
                "Explain evaporation. Actually, use a summary."
            ).action,
            "update",
        )
        self.assertEqual(
            classify_whiteboard_intent("I meant the rear brakes.").action,
            "update",
        )
        self.assertEqual(
            classify_whiteboard_intent("Make that a diagram.").action,
            "update",
        )

    def test_nonexclusive_negation_only_exempts_its_own_token(self) -> None:
        for prompt in (
            "Use not only a diagram and no summary.",
            "Not only a diagram without a summary.",
        ):
            with self.subTest(prompt=prompt):
                intent = classify_whiteboard_intent(prompt)
                self.assertEqual(intent.required_modes, ("diagram",))
                self.assertEqual(intent.forbidden_modes, ("notes",))

    async def test_unselected_visual_cannot_request_an_image(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["notes"],
            "requestedFootprint": "small",
            "renderMode": "generatedAsset",
            "imagePrompt": "A cloud.",
            "scene": {"entities": [], "connections": []},
        })
        with self.assertRaisesRegex(GeminiProviderError, "unselected visual"):
            await self.pipeline(StubTransport([gemini_text(raw)])).generate("Define a cloud.")

    async def test_duplicate_content_modes_are_rejected(self) -> None:
        raw = director_decision()
        raw["contentModes"] = ["notes", "notes"]
        with self.assertRaisesRegex(GeminiProviderError, "invalid content modes"):
            await self.pipeline(StubTransport([gemini_text(raw)])).generate("Explain evaporation.")

    async def test_provider_schema_allows_only_complete_create_or_update_actions(self) -> None:
        modes_schema = VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"]["contentModes"]
        action_schema = VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"]["action"]
        bullets_schema = VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"]["summaryBullets"]
        strategy_schema = VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"]["boardStrategy"]
        self.assertEqual(strategy_schema["enum"], ["integrate", "reset"])
        self.assertEqual(action_schema["enum"], ["create", "update"])
        self.assertEqual(modes_schema["minItems"], 1)
        self.assertEqual(bullets_schema["maxItems"], 4)
        self.assertNotIn("keywords", VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"])
        self.assertIn("summaryBullets", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])
        self.assertIn("contentModes", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])
        self.assertIn("boardStrategy", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])

        with self.assertRaisesRegex(GeminiProviderError, "invalid action"):
            await self.pipeline(StubTransport([gemini_text(director_decision("hold"))])).generate("Moving on.")

        accepted = director_decision()
        accepted["contentModes"] = []
        with self.assertRaisesRegex(GeminiProviderError, "invalid content modes"):
            await self.pipeline(StubTransport([gemini_text(accepted)])).generate("Explain evaporation.")

        invalid_strategy = director_decision()
        invalid_strategy["boardStrategy"] = "archive"
        with self.assertRaisesRegex(GeminiProviderError, "invalid board strategy"):
            await self.pipeline(StubTransport([gemini_text(invalid_strategy)])).generate(
                "Explain evaporation."
            )

    async def test_independent_subject_reset_uses_an_empty_page_one_board_at_capacity(self) -> None:
        raw = director_decision("update")
        raw.update({
            "boardStrategy": "reset",
            "targetSceneId": "scene-0",
            "conceptKey": "car-functions",
            "title": "How a car functions",
            "summary": "A car converts stored energy into controlled motion.",
        })
        scenes = [{
            "sceneId": f"scene-{index}",
            "conceptKey": "skeletal-system" if index == 0 else f"concept-{index}",
            "contentModes": ["notes"],
            "placement": {
                "page": index + 1, "column": 0, "row": 0, "width": 8, "height": 5,
            },
        } for index in range(48)]

        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Now teach how a car functions.",
            context={
                "turnSequence": 49,
                "recentTurns": [{
                    "turnSequence": 48,
                    "userInput": "Explain the skeletal system.",
                    "action": "create",
                    "conceptKey": "skeletal-system",
                    "summary": "Bones support the body.",
                }],
                "board": {"version": 48, "currentPage": 48, "scenes": scenes},
            },
        )

        self.assertEqual(result["boardStrategy"], "reset")
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])
        self.assertEqual(result["sceneId"], "scene-49-car-functions")
        self.assertEqual(result["placement"]["page"], 1)
        self.assertEqual(result["boardVersion"], 49)
        self.assertEqual(result["turnSequence"], 49)

    async def test_explicit_addition_forces_integration_even_when_model_requests_reset(self) -> None:
        raw = director_decision()
        raw["boardStrategy"] = "reset"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Also explain another water-cycle example.",
            context={
                "turnSequence": 2,
                "board": {
                    "version": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["notes"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                    }],
                },
            },
        )
        self.assertEqual(result["boardStrategy"], "integrate")
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["placement"]["page"], 2)

    async def test_sequencing_language_keeps_an_unrelated_model_reset(self) -> None:
        for prompt in (
            "Next, explain how a car works.",
            "And now teach how a car works.",
        ):
            with self.subTest(prompt=prompt):
                raw = director_decision("update")
                raw.update({
                    "boardStrategy": "reset",
                    "targetSceneId": "skeleton",
                    "conceptKey": "car-functions",
                    "title": "How a car functions",
                    "summary": "A car converts stored energy into controlled motion.",
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt,
                    context={
                        "turnSequence": 2,
                        "board": {
                            "version": 1,
                            "scenes": [{
                                "sceneId": "skeleton",
                                "conceptKey": "skeletal-system",
                                "contentModes": ["notes"],
                                "placement": {
                                    "page": 1, "column": 0, "row": 0,
                                    "width": 8, "height": 5,
                                },
                            }],
                        },
                    },
                )
                self.assertEqual(result["boardStrategy"], "reset")
                self.assertEqual(result["action"], "create")
                self.assertIsNone(result["targetSceneId"])
                self.assertEqual(result["conceptKey"], "car-functions")
                self.assertEqual(result["placement"]["page"], 1)

    async def test_duplicate_create_becomes_stable_update(self) -> None:
        transport = StubTransport([gemini_text(director_decision())])
        result = await self.pipeline(transport).generate(
            "The water also condenses.",
            context={
                "turnSequence": 5,
                "board": {
                    "version": 3,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "existing", "conceptKey": "water-cycle",
                        "contentModes": ["diagram"],
                        "placement": {"page": 1, "column": 12, "row": 2, "width": 12, "height": 6},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["sceneId"], "existing")
        self.assertEqual(result["placement"]["column"], 0)

    async def test_explicit_addition_creates_a_unique_compartment_for_same_topic(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "existing"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Also explain another part of the water cycle.",
            context={
                "turnSequence": 6,
                "board": {
                    "version": 1,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["notes"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])
        self.assertEqual(result["contentModes"], ["visual", "notes", "diagram"])
        self.assertEqual(result["conceptKey"], "water-cycle-addition-6")
        self.assertNotEqual(result["sceneId"], "existing")

    async def test_natural_correction_updates_a_safely_resolved_scene(self) -> None:
        raw = director_decision("create")
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Actually, make that a summary.",
            context={
                "turnSequence": 7,
                "board": {
                    "version": 1,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["diagram"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 12, "height": 6},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["targetSceneId"], "existing")
        self.assertEqual(result["contentModes"], ["notes"])

    async def test_mid_sentence_actually_does_not_overwrite_recent_scene(self) -> None:
        raw = director_decision("create")
        raw.update({
            "conceptKey": "photosynthesis",
            "title": "Photosynthesis",
            "summary": "Plants turn light energy into stored chemical energy.",
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain how photosynthesis actually works.",
            context={
                "turnSequence": 8,
                "recentTurns": [{
                    "turnSequence": 7,
                    "userInput": "Explain the water cycle.",
                    "action": "create",
                    "conceptKey": "water-cycle",
                    "summary": "Water circulates through the environment.",
                }],
                "board": {
                    "version": 1,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["diagram"],
                        "placement": {
                            "page": 1, "column": 0, "row": 0,
                            "width": 12, "height": 6,
                        },
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])
        self.assertEqual(result["conceptKey"], "photosynthesis")
        self.assertNotEqual(result["sceneId"], "existing")

    async def test_correction_without_a_safe_target_creates_instead_of_overwriting(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "missing"
        raw["conceptKey"] = "unresolved-topic"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Correct the unresolved topic.",
            context={
                "turnSequence": 3,
                "board": {
                    "version": 2,
                    "currentPage": 1,
                    "scenes": [
                        {
                            "sceneId": "first", "conceptKey": "gravity",
                            "contentModes": ["notes"],
                            "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                        },
                        {
                            "sceneId": "second", "conceptKey": "friction",
                            "contentModes": ["notes"],
                            "placement": {"page": 1, "column": 9, "row": 0, "width": 8, "height": 5},
                        },
                    ],
                },
            },
        )
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])

    async def test_full_model_request_remains_page_exclusive(self) -> None:
        raw = director_decision()
        raw["requestedFootprint"] = "full"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain the complete water cycle."
        )
        self.assertEqual(result["requestedFootprint"], "full")
        self.assertEqual((result["placement"]["width"], result["placement"]["height"]), (24, 10))

    async def test_update_preserves_the_target_scenes_concept_key(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "existing"
        raw["conceptKey"] = "model-renamed-concept"
        transport = StubTransport([gemini_text(raw)])

        result = await self.pipeline(transport).generate(
            "Correct the existing water-cycle scene.",
            context={
                "turnSequence": 6,
                "board": {
                    "version": 3,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["diagram"],
                        "placement": {
                            "page": 1,
                            "column": 8,
                            "row": 2,
                            "width": 16,
                            "height": 7,
                        },
                    }],
                },
            },
        )

        self.assertEqual(result["action"], "update")
        self.assertEqual(result["sceneId"], "existing")
        self.assertEqual(result["conceptKey"], "water-cycle")

    async def test_exact_concept_scene_wins_over_a_conflicting_valid_target(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "wrong-target"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Update the water cycle.",
            context={
                "turnSequence": 7,
                "board": {
                    "version": 2,
                    "scenes": [
                        {
                            "sceneId": "wrong-target",
                            "conceptKey": "photosynthesis",
                            "contentModes": ["notes"],
                            "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                        },
                        {
                            "sceneId": "water-target",
                            "conceptKey": "water-cycle",
                            "contentModes": ["notes"],
                            "placement": {"page": 2, "column": 0, "row": 0, "width": 8, "height": 5},
                        },
                    ],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["sceneId"], "water-target")
        self.assertEqual(result["targetSceneId"], "water-target")
        self.assertEqual(result["conceptKey"], "water-cycle")

    async def test_create_raises_when_board_has_48_scenes(self) -> None:
        scenes = [
            {
                "sceneId": f"scene-{index}",
                "conceptKey": f"concept-{index}",
                "placement": {
                    "page": index + 1,
                    "column": 0,
                    "row": 0,
                    "width": 8,
                    "height": 5,
                },
            }
            for index in range(48)
        ]
        transport = StubTransport([gemini_text(director_decision())])

        with self.assertRaisesRegex(GeminiProviderError, "48-scene limit"):
            await self.pipeline(transport).generate(
                "Add the water cycle.",
                context={
                    "turnSequence": 49,
                    "board": {"version": 48, "currentPage": 1, "scenes": scenes},
                },
            )

    async def test_full_board_still_allows_an_existing_scene_update(self) -> None:
        scenes = [
            {
                "sceneId": f"scene-{index}",
                "conceptKey": "water-cycle" if index == 0 else f"concept-{index}",
                "placement": {
                    "page": index + 1,
                    "column": 0,
                    "row": 0,
                    "width": 8,
                    "height": 5,
                },
            }
            for index in range(48)
        ]
        raw = director_decision("update")
        raw["targetSceneId"] = "scene-0"
        transport = StubTransport([gemini_text(raw)])

        result = await self.pipeline(transport).generate(
            "Update the water cycle.",
            context={
                "turnSequence": 49,
                "board": {"version": 48, "currentPage": 1, "scenes": scenes},
            },
        )

        self.assertEqual(result["action"], "update")
        self.assertEqual(result["boardVersion"], 49)
        self.assertEqual(result["sceneId"], "scene-0")
        self.assertEqual(result["placement"]["page"], 1)

    async def test_stale_update_becomes_a_fresh_create(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "missing"
        transport = StubTransport([gemini_text(raw)])
        result = await self.pipeline(transport).generate("Correct that detail.")
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])
        self.assertEqual(result["sceneId"], "scene-0-water-cycle")
        self.assertIsNotNone(result["placement"])

    async def test_stale_update_recovers_by_exact_concept_before_creating(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "missing"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Correct the water cycle.",
            context={
                "turnSequence": 4,
                "board": {
                    "version": 1,
                    "scenes": [{
                        "sceneId": "water-scene",
                        "conceptKey": "water-cycle",
                        "contentModes": ["notes"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["targetSceneId"], "water-scene")
        self.assertEqual(result["sceneId"], "water-scene")

    async def test_stale_update_can_recover_through_current_concept_memory(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "missing"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Correct condensation in that cycle.",
            context={
                "turnSequence": 5,
                "concepts": [{"conceptKey": "water-cycle", "sceneId": "memory-scene"}],
                "board": {
                    "version": 2,
                    "scenes": [{
                        "sceneId": "memory-scene",
                        "conceptKey": "",
                        "contentModes": ["notes"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["sceneId"], "memory-scene")

    async def test_stale_update_does_not_fuzzy_match_a_nearby_concept(self) -> None:
        raw = director_decision("update")
        raw["targetSceneId"] = "missing"
        raw["conceptKey"] = "water-cycles"
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Teach a separate cycle.",
            context={
                "turnSequence": 6,
                "board": {
                    "version": 1,
                    "scenes": [{
                        "sceneId": "water-scene",
                        "conceptKey": "water-cycle",
                        "contentModes": ["notes"],
                        "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "create")
        self.assertIsNone(result["targetSceneId"])

    async def test_context_is_bounded_for_direct_pipeline_callers(self) -> None:
        transport = StubTransport([gemini_text(director_decision())])
        await self.pipeline(transport).generate(
            "Continue.",
            context={
                "lessonContext": {"source": "s" * 5000},
                "recentTurns": [{"turnSequence": i, "userInput": "x" * 500} for i in range(10)],
                "concepts": [{"conceptKey": f"c-{i}", "title": "Title"} for i in range(30)],
            },
        )
        body = json.loads(transport.requests[0][0].data)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(len(context["lessonContext"]["source"]), 3600)
        self.assertLessEqual(len(context["recentTurns"]), 6)
        self.assertLessEqual(sum(len(turn["userInput"]) for turn in context["recentTurns"]), 2400)
        self.assertEqual(len(context["concepts"]), 24)

    async def test_director_receives_context_needed_to_choose_update_or_create(self) -> None:
        transport = StubTransport([gemini_text(director_decision())])
        await self.pipeline(transport).generate(
            "Show another example of that.",
            context={
                "turnSequence": 8,
                "recentTurns": [
                    {
                        "turnSequence": 6,
                        "userInput": "We finished the warmup.",
                        "action": "hold",
                        "conceptKey": "",
                        "summary": "",
                    },
                    {
                        "turnSequence": 7,
                        "userInput": "Explain evaporation.",
                        "action": "create",
                        "conceptKey": "water-cycle",
                        "summary": "Liquid water becomes vapor.",
                    },
                ],
                "concepts": [{
                    "conceptKey": "water-cycle",
                    "title": "Water cycle",
                    "summary": "Liquid water becomes vapor.",
                    "sceneId": "scene-water",
                }],
                "board": {
                    "version": 1,
                    "currentPage": 1,
                    "scenes": [{
                        "sceneId": "scene-water",
                        "conceptKey": "water-cycle",
                        "title": "Water cycle",
                        "contentModes": ["diagram"],
                        "placement": {
                            "page": 1,
                            "column": 0,
                            "row": 0,
                            "width": 12,
                            "height": 6,
                        },
                    }],
                },
            },
        )

        body = json.loads(transport.requests[0][0].data)
        context = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(context["userInput"], "Show another example of that.")
        self.assertEqual(context["recentTurns"][-1]["action"], "create")
        self.assertEqual(context["recentTurns"][-1]["conceptKey"], "water-cycle")
        self.assertEqual(context["concepts"][0]["sceneId"], "scene-water")
        self.assertNotIn("keywords", context["concepts"][0])
        self.assertEqual(context["board"]["scenes"][0]["sceneId"], "scene-water")
        self.assertEqual(context["explicitIntent"]["requiredContentModes"], [])

    async def test_malformed_provider_decision_fails_after_one_call(self) -> None:
        transport = StubTransport([gemini_text("not-json")])
        with self.assertRaisesRegex(GeminiProviderError, "malformed Live Assistant"):
            await self.pipeline(transport).generate("Explain ATP.")
        self.assertEqual(len(transport.requests), 1)

    async def test_image_prompt_and_response_remain_server_side(self) -> None:
        encoded = base64.b64encode(b"image").decode()
        transport = StubTransport([{"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": encoded}}]}}]}])
        visual = await self.pipeline(transport).generate_visual(
            "image", "Two people exchange a ball.", "Exchange"
        )
        body = json.loads(transport.requests[0][0].data)
        self.assertNotIn("thinkingConfig", json.dumps(body))
        prompt_text = body["contents"][0]["parts"][0]["text"].lower()
        self.assertIn("sparse monochrome black or neutral outline drawing", prompt_text)
        self.assertIn("grounded only in the supplied facts", prompt_text)
        self.assertIn("white or transparent background", prompt_text)
        self.assertIn("stick figures", prompt_text)
        self.assertIn("no color fills", prompt_text)
        self.assertIn("numbers", prompt_text)
        self.assertIn("watermarks", prompt_text)
        self.assertIn("photorealism", prompt_text)
        self.assertEqual(visual["mimeType"], "image/png")

    async def test_image_failure_returns_none_and_does_not_retry(self) -> None:
        transport = StubTransport([gemini_text("No image")])
        visual = await self.pipeline(transport).generate_visual("image", "Prompt", "Alt")
        self.assertIsNone(visual)
        self.assertEqual(len(transport.requests), 1)

    async def test_missing_text_key_fails_without_transport(self) -> None:
        transport = StubTransport([])
        pipeline = GeminiPipeline(text_api_key="", text_model=TEST_MODEL, transport=transport)
        with self.assertRaises(GeminiConfigurationError):
            await pipeline.generate("Explain ATP.")
        self.assertEqual(transport.requests, [])

    def test_prod_key_and_stable_models_are_the_runtime_defaults(self) -> None:
        obsolete_key = "DEV_" + "GEMINI_API_KEY"
        with patch.dict(
            "os.environ",
            {
                obsolete_key: "development-secret",
                "PROD_GEMINI_API_KEY": " production-secret ",
                "GEMINI_TEXT_MODEL": "   ",
                "GEMINI_IMAGE_MODEL": "",
            },
            clear=True,
        ):
            pipeline = GeminiPipeline(transport=StubTransport([]))

        self.assertEqual(pipeline.text_api_key, "production-secret")
        self.assertEqual(pipeline.image_api_key, "production-secret")
        self.assertEqual(pipeline.text_model, DEFAULT_TEXT_MODEL)
        self.assertEqual(pipeline.image_model, DEFAULT_IMAGE_MODEL)

    def test_nonblank_env_models_override_defaults(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "PROD_GEMINI_API_KEY": TEST_KEY,
                "GEMINI_TEXT_MODEL": " text-override ",
                "GEMINI_IMAGE_MODEL": " image-override ",
            },
            clear=True,
        ):
            pipeline = GeminiPipeline(transport=StubTransport([]))

        self.assertEqual(pipeline.text_model, "text-override")
        self.assertEqual(pipeline.image_model, "image-override")

    def test_explicit_constructor_values_keep_precedence_and_empty_semantics(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "PROD_GEMINI_API_KEY": "environment-secret",
                "GEMINI_TEXT_MODEL": "environment-text",
                "GEMINI_IMAGE_MODEL": "environment-image",
            },
            clear=True,
        ):
            pipeline = GeminiPipeline(
                text_api_key=" explicit-text-key ",
                image_api_key=" explicit-image-key ",
                text_model="",
                image_model="",
                transport=StubTransport([]),
            )

        self.assertEqual(pipeline.text_api_key, "explicit-text-key")
        self.assertEqual(pipeline.image_api_key, "explicit-image-key")
        self.assertEqual(pipeline.text_model, "")
        self.assertEqual(pipeline.image_model, "")

    def test_prompt_covers_required_private_direction(self) -> None:
        prompt_text = VISUAL_DIRECTOR_SYSTEM_INSTRUCTION.lower()
        for phrase in (
            "evidence in this order", "one atomic concept", "update",
            "left-to-right", "12 by 8", "image gate", "never expose reasoning", "json only",
            "sparse monochrome black or neutral outline",
            "grounded only in the supplied facts", "embedded text", "watermarks",
            "smallest useful ordered contentmodes subset", "visual, notes, and diagram",
            "concept-specific scene entities", "never a partial patch",
            "never emit html, css, svg", "do not provide coordinates or sizes",
        ):
            self.assertIn(phrase, prompt_text)
        self.assertNotIn("hold", prompt_text)

    def test_prompt_decides_topic_continuation_before_content_modes(self) -> None:
        prompt_text = VISUAL_DIRECTOR_SYSTEM_INSTRUCTION.lower()
        strategy_policy = prompt_text.index("board strategy decision")
        action_policy = prompt_text.index("action decision order")
        content_direction = prompt_text.index("content direction")
        self.assertLess(strategy_policy, action_policy)
        self.assertLess(action_policy, content_direction)
        for phrase in (
            "use integrate by default",
            "transition is ambiguous",
            "same subject, a related continuation, clarification, correction, example, comparison, or explicit addition",
            "independent instructional subject or domain",
            "skeletal system to how a car functions resets the board",
            "forces integrate",
            "explicitly names, points to, or corrects an existing topic or scene",
            "single strongest semantic match",
            "including synonyms and rephrasings",
            "most recent topic that still exists on the board",
            "correction, clarification, deepening, rephrasing, example, counterexample",
            "independently teachable atomic concept with no clear existing-topic anchor",
            "two or more existing targets are comparably plausible",
            "create one focused scene rather than merging unrelated scenes",
            "set targetsceneid to the anchored board scene",
            "copy its stored conceptkey exactly",
        ):
            self.assertIn(phrase, prompt_text)


class GeminiTransportTests(unittest.TestCase):
    def test_quota_error_preserves_bounded_context_for_server_logs(self) -> None:
        error = urllib.error.HTTPError(
            "https://provider.invalid", 429, "Too Many Requests", {},
            io.BytesIO(json.dumps({"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}}).encode()),
        )
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(GeminiProviderError, "RESOURCE_EXHAUSTED"):
                _default_json_transport(urllib.request.Request("https://provider.invalid"), 1)


if __name__ == "__main__":
    unittest.main()
