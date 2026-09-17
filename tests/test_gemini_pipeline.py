import base64
import io
import json
import logging
import threading
import unittest
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from backend.services.gemini_pipeline import (
    DEFAULT_IMAGE_FALLBACK_MODEL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_TEXT_FALLBACK_MODEL,
    DEFAULT_TEXT_MODEL,
    DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
    GeminiConfigurationError,
    GeminiPipeline,
    GeminiProviderError,
    GeminiTransientError,
    IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
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
        "mergeBehavior": "replace",
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


def continuity_context() -> dict[str, object]:
    """A current body diagram with a neighboring scene that must not move."""
    return {
        "turnSequence": 3,
        "recentTurns": [{
            "turnSequence": 2, "action": "create", "conceptKey": "human-body",
            "userInput": "Give me a diagram of a human body.", "summary": "Body parts.",
        }],
        "board": {
            "version": 2, "currentPage": 2,
            "scenes": [
                {
                    "sceneId": "body", "conceptKey": "human-body", "title": "Human body",
                    "headingMode": "inheritPrimary", "contentModes": ["diagram"],
                    "renderMode": "generatedAsset",
                    "placement": {"page": 2, "column": 0, "row": 0, "width": 12, "height": 6},
                },
                {
                    "sceneId": "neighbor", "conceptKey": "water-cycle", "title": "Water cycle",
                    "contentModes": ["notes"],
                    "placement": {"page": 2, "column": 13, "row": 0, "width": 8, "height": 5},
                },
            ],
        },
    }


class StubTransport:
    def __init__(self, responses: list[dict[str, object] | BaseException]) -> None:
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout_seconds):
        self.requests.append((request, timeout_seconds))
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def requested_models(transport: StubTransport) -> list[str]:
    """Return decoded model names in transport call order."""
    models = []
    for request, _ in transport.requests:
        encoded_model = request.full_url.rsplit("/", 1)[-1].split(":", 1)[0]
        models.append(urllib.parse.unquote(encoded_model))
    return models


class FakeClock:
    """Advance monotonic time only when retry code sleeps or a test asks."""

    def __init__(self, start: float = 100.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, delay: float) -> None:
        self.sleeps.append(delay)
        self.now += delay


class ClockedTransport(StubTransport):
    """Advance a fake clock by fixed seconds, or by the requested timeout."""

    def __init__(
        self,
        responses: list[dict[str, object] | BaseException],
        clock: FakeClock,
        elapsed: list[float | None],
    ) -> None:
        super().__init__(responses)
        self.clock = clock
        self.elapsed = list(elapsed)

    def __call__(self, request, timeout_seconds):
        elapsed = self.elapsed.pop(0)
        self.clock.now += timeout_seconds if elapsed is None else elapsed
        return super().__call__(request, timeout_seconds)


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
        self.assertEqual(result["renderMode"], "generatedAsset")
        self.assertEqual(result["_imageRequest"], {
            "imagePrompt": director_decision()["imagePrompt"],
            "visualAlt": director_decision()["summary"],
        })

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

    async def test_related_summary_expands_despite_model_reset_create_and_renamed_key(self) -> None:
        for prompt in (
            "Give me a summary of the major parts of the human body.",
            "Now summarize the human body's main parts.",
            "Human body summary, please.",
        ):
            for strategy in ("integrate", "reset"):
                with self.subTest(prompt=prompt, strategy=strategy):
                    raw = director_decision()
                    raw.update({
                        "boardStrategy": strategy, "conceptKey": "major-anatomical-parts",
                        "title": "Major body parts", "contentModes": ["notes"],
                        "summaryBullets": ["The head houses the brain.", "Limbs support movement."],
                        "renderMode": "structured", "imagePrompt": "",
                    })
                    context = continuity_context()
                    transport = StubTransport([gemini_text(raw)])
                    result = await self.pipeline(transport).generate(prompt, context=context)
                    self.assertEqual(len(transport.requests), 1)
                    self.assertEqual(result["boardStrategy"], "integrate")
                    self.assertEqual(result["action"], "update")
                    self.assertEqual(result["mergeBehavior"], "expand")
                    self.assertEqual(result["sceneId"], "body")
                    self.assertEqual(result["targetSceneId"], "body")
                    self.assertEqual(result["conceptKey"], "human-body")
                    self.assertEqual(result["headingMode"], "inheritPrimary")
                    self.assertEqual(result["contentModes"], ["diagram", "notes"])
                    self.assertEqual(result["summaryBullets"], raw["summaryBullets"])
                    self.assertEqual(result["requestedFootprint"], "medium")
                    self.assertEqual(result["placement"], context["board"]["scenes"][0]["placement"])
                    self.assertIsNone(result["_imageRequest"])
                    self.assertIsNone(result["visualJobId"])
                    self.assertIsNone(result["generatedAsset"])

    async def test_semantic_summary_target_expands_even_when_model_says_replace(self) -> None:
        for prompt in (
            "Give me a summary of human anatomy.",
            "Give me a summary of its major organs.",
        ):
            for concept_key in ("human-body", "human-anatomy"):
                with self.subTest(prompt=prompt, concept_key=concept_key):
                    context = continuity_context()
                    raw = director_decision("update")
                    raw.update({
                        "targetSceneId": "body", "conceptKey": concept_key,
                        "contentModes": ["notes"], "renderMode": "structured", "imagePrompt": "",
                    })
                    transport = StubTransport([gemini_text(raw)])
                    result = await self.pipeline(transport).generate(prompt, context=context)
                    self.assertEqual(len(transport.requests), 1)
                    self.assertEqual(result["action"], "update")
                    self.assertEqual(result["mergeBehavior"], "expand")
                    self.assertEqual(result["contentModes"], ["diagram", "notes"])
                    self.assertEqual(result["sceneId"], "body")
                    self.assertEqual(result["conceptKey"], "human-body")
                    self.assertEqual(result["placement"], context["board"]["scenes"][0]["placement"])
                    self.assertIsNone(result["_imageRequest"])
                    self.assertIsNone(result["visualJobId"])
                    self.assertIsNone(result["generatedAsset"])

    async def test_semantic_summary_requires_a_resolved_target(self) -> None:
        for action, target_id in (("update", ""), ("update", "missing"), ("create", "body")):
            with self.subTest(action=action, target_id=target_id):
                raw = director_decision(action)
                raw.update({
                    "targetSceneId": target_id, "conceptKey": "unresolved-anatomy",
                    "contentModes": ["notes"], "renderMode": "structured", "imagePrompt": "",
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    "Give me a summary of human anatomy.", context=continuity_context(),
                )
                self.assertEqual(result["action"], "create")
                self.assertEqual(result["mergeBehavior"], "replace")
                self.assertEqual(result["contentModes"], ["notes"])
                self.assertIsNone(result["targetSceneId"])

    async def test_semantic_summary_respects_explicit_replacement_and_separation(self) -> None:
        for prompt in (
            "Give me only a summary of human anatomy.",
            "Replace it with a summary of human anatomy.",
            "Give me a summary of human anatomy without a diagram.",
            "Give me a separate summary of human anatomy.",
            "Give me a summary of human anatomy on a new page.",
        ):
            with self.subTest(prompt=prompt):
                raw = director_decision("update")
                raw.update({
                    "targetSceneId": "body", "conceptKey": "human-body",
                    "contentModes": ["notes"], "renderMode": "structured", "imagePrompt": "",
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt, context=continuity_context(),
                )
                self.assertEqual(result["mergeBehavior"], "replace")
                self.assertEqual(result["contentModes"], ["notes"])

    async def test_shared_subject_can_use_title_key_concept_or_prior_prompt(self) -> None:
        for evidence in ("title", "conceptKey", "concepts", "recentTurns"):
            with self.subTest(evidence=evidence):
                context = continuity_context()
                body = context["board"]["scenes"][0]
                body.update({"title": "Anatomy", "conceptKey": "anatomy"})
                context["recentTurns"] = []
                if evidence in {"title", "conceptKey"}:
                    body[evidence] = "human-body"
                elif evidence == "concepts":
                    context["concepts"] = [{"sceneId": "body", "conceptKey": "anatomy", "title": "Human body"}]
                else:
                    context["recentTurns"] = [{
                        "conceptKey": "anatomy", "userInput": "Give me a diagram of a human body.",
                    }]
                raw = director_decision()
                raw.update({"conceptKey": "body-summary", "contentModes": ["notes"],
                            "renderMode": "structured", "imagePrompt": ""})
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    "Give me a summary of the major parts of the human body.", context=context,
                )
                self.assertEqual(result["sceneId"], "body")
                self.assertEqual(result["mergeBehavior"], "expand")

    async def test_pronoun_summary_uses_latest_still_current_topic_not_scene_order(self) -> None:
        for prompt in ("Summarize its major parts.", "Give me a summary of that.", "Give me a summary."):
            with self.subTest(prompt=prompt):
                context = continuity_context()
                context["recentTurns"] = [
                    {"conceptKey": "water-cycle", "userInput": "Water cycle"},
                    *context["recentTurns"],
                    {"conceptKey": "removed-topic", "userInput": "An old removed topic"},
                    {"conceptKey": "", "userInput": "Thank you"},
                ]
                raw = director_decision()
                raw.update({"boardStrategy": "reset", "conceptKey": "new-summary",
                            "contentModes": ["notes"], "renderMode": "structured", "imagePrompt": ""})
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(prompt, context=context)
                self.assertEqual(result["sceneId"], "body")
                self.assertEqual(result["mergeBehavior"], "expand")

    async def test_unrelated_generic_and_ambiguous_summaries_do_not_auto_merge(self) -> None:
        for prompt in (
            "Give me a summary of a cell body.",
            "Give me a summary of human development.",
            "Give me a summary of the solar system and its major parts.",
            "Give me a summary of the system.",
        ):
            with self.subTest(prompt=prompt):
                raw = director_decision()
                raw.update({"conceptKey": "new-subject", "contentModes": ["notes"],
                            "renderMode": "structured", "imagePrompt": ""})
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt, context=continuity_context(),
                )
                self.assertEqual(result["action"], "create")
                self.assertEqual(result["mergeBehavior"], "replace")
                self.assertIsNone(result["targetSceneId"])

        for ambiguous in (False, True):
            with self.subTest(ambiguous=ambiguous):
                context = continuity_context()
                context["recentTurns"] = []
                if ambiguous:
                    context["board"]["scenes"][1]["title"] = "Human body"
                raw = director_decision()
                raw.update({"conceptKey": "new-summary", "contentModes": ["notes"],
                            "renderMode": "structured", "imagePrompt": ""})
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    "Summary of the human body." if ambiguous else "Summarize it.", context=context,
                )
                self.assertEqual(result["action"], "create")

    async def test_fresh_and_explicit_replacements_never_expand_a_related_diagram(self) -> None:
        for prompt in (
            "Start over. Give me a summary of the human body.",
            "Start fresh with a summary of the human body.",
            "On a new page, give me a summary of the human body.",
            "Give me a separate summary of the human body.",
            "Only a summary of the human body.",
            "Replace it with a summary of the human body.",
            "Replace the diagram with a summary of the human body.",
            "Remove the diagram and give me a summary of the human body.",
        ):
            with self.subTest(prompt=prompt):
                raw = director_decision("update")
                raw.update({"boardStrategy": "reset", "conceptKey": "human-body",
                            "targetSceneId": "body", "mergeBehavior": "expand",
                            "contentModes": ["notes"], "renderMode": "structured", "imagePrompt": ""})
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt, context=continuity_context(),
                )
                self.assertEqual(result["mergeBehavior"], "replace")
                self.assertEqual(result["contentModes"], list(classify_whiteboard_intent(prompt).required_modes))
                if not classify_whiteboard_intent(prompt).force_integrate:
                    self.assertEqual(result["boardStrategy"], "reset")

    async def test_shared_subject_same_mode_remains_replacement(self) -> None:
        raw = director_decision()
        raw.update({"conceptKey": "body-outline", "contentModes": ["diagram"],
                    "summaryBullets": []})
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Give me a diagram of the human body.", context=continuity_context(),
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["mergeBehavior"], "replace")
        self.assertEqual(result["contentModes"], ["diagram"])
        self.assertIsNotNone(result["_imageRequest"])

    async def test_diagram_only_is_promoted_to_medium(self) -> None:
        raw = director_decision()
        raw.update({"contentModes": ["diagram"], "summaryBullets": [], "requestedFootprint": "small", "renderMode": "structured", "imagePrompt": ""})
        with patch("backend.services.gemini_pipeline.repair_stick_scene") as repair:
            result = await self.pipeline(StubTransport([gemini_text(raw)])).generate("Show evaporation.")
        self.assertEqual(result["requestedFootprint"], "medium")
        self.assertEqual((result["placement"]["width"], result["placement"]["height"]), (12, 6))
        self.assertEqual(result["renderMode"], "generatedAsset")
        self.assertIsNone(result["stickScene"])
        repair.assert_not_called()
        self.assertEqual(result["_imageRequest"], {
            "imagePrompt": raw["summary"],
            "visualAlt": raw["summary"],
        })

    async def test_diagram_summary_default_is_bounded(self) -> None:
        raw = director_decision()
        raw.update({
            "contentModes": ["notes", "diagram"],
            "summary": "x" * 500,
            "renderMode": "structured",
            "imagePrompt": "   ",
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Give me notes and a diagram."
        )
        self.assertEqual(result["contentModes"], ["notes", "diagram"])
        self.assertIsNone(result["stickScene"])
        self.assertEqual(result["_imageRequest"]["imagePrompt"], "x" * 320)
        self.assertEqual(result["_imageRequest"]["visualAlt"], "x" * 320)

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
                "contentModes": ["visual", "diagram"], "summaryBullets": [],
                "requestedFootprint": "full", "renderMode": "structured",
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

    async def test_combined_diagram_retains_stick_scene_for_visual_pane(self) -> None:
        raw = director_decision()
        raw.update({"renderMode": "structured", "imagePrompt": ""})
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Explain the water cycle."
        )
        self.assertEqual(result["renderMode"], "generatedAsset")
        self.assertTrue(result["stickScene"]["entities"])
        self.assertEqual(result["_imageRequest"]["imagePrompt"], raw["summary"])

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
                self.assertEqual(
                    bool(result["stickScene"]),
                    "visual" in expected and "diagram" in expected,
                )
                expected_render_mode = (
                    "generatedAsset" if "diagram" in expected else "structured"
                )
                self.assertEqual(result["renderMode"], expected_render_mode)
                self.assertEqual(
                    result["_imageRequest"] is not None,
                    "diagram" in expected,
                )

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
        self.assertIsNone(combined.action)
        self.assertTrue(combined.force_integrate)
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
                intent = classify_whiteboard_intent(prompt)
                self.assertIsNone(intent.action)
                self.assertTrue(intent.force_integrate)
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

        for prompt in (
            "Not only a diagram; add notes too.",
            "Not just a diagram; add notes too.",
        ):
            with self.subTest(prompt=prompt):
                intent = classify_whiteboard_intent(prompt)
                self.assertEqual(intent.required_modes, ("diagram", "notes"))
                self.assertFalse(intent.force_replace)

        for prompt in ("Only a diagram.", "Just notes."):
            with self.subTest(prompt=prompt):
                self.assertTrue(classify_whiteboard_intent(prompt).force_replace)

    def test_clear_is_removal_only_when_used_as_a_mode_verb(self) -> None:
        for prompt, expected_mode in (
            ("Make a clear diagram.", "diagram"),
            ("Show a clear visual.", "visual"),
        ):
            with self.subTest(prompt=prompt):
                intent = classify_whiteboard_intent(prompt)
                self.assertEqual(intent.required_modes, (expected_mode,))
                self.assertEqual(intent.forbidden_modes, ())
                self.assertFalse(intent.force_replace)

        for prompt, expected_mode in (
            ("Clear the diagram.", "diagram"),
            ("Clear notes.", "notes"),
        ):
            with self.subTest(prompt=prompt):
                intent = classify_whiteboard_intent(prompt)
                self.assertEqual(intent.required_modes, ())
                self.assertEqual(intent.forbidden_modes, (expected_mode,))
                self.assertTrue(intent.force_replace)

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
        self.assertEqual(
            VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"]["mergeBehavior"]["enum"],
            ["replace", "expand"],
        )
        self.assertEqual(modes_schema["minItems"], 1)
        self.assertEqual(bullets_schema["maxItems"], 4)
        self.assertNotIn("keywords", VISUAL_DIRECTOR_RESPONSE_SCHEMA["properties"])
        self.assertIn("summaryBullets", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])
        self.assertIn("contentModes", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])
        self.assertIn("boardStrategy", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])
        self.assertIn("mergeBehavior", VISUAL_DIRECTOR_RESPONSE_SCHEMA["required"])

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
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["targetSceneId"], "existing")

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

    async def test_related_addition_expands_the_existing_scene_without_a_new_diagram(self) -> None:
        raw = director_decision("update")
        raw.update({
            "mergeBehavior": "expand",
            "targetSceneId": "existing",
            "contentModes": ["notes"],
            "requestedFootprint": "small",
            "renderMode": "structured",
            "imagePrompt": "",
            "scene": {"entities": [], "connections": []},
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Also add a summary of the water cycle.",
            context={
                "turnSequence": 6,
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
        self.assertEqual(result["mergeBehavior"], "expand")
        self.assertEqual(result["targetSceneId"], "existing")
        self.assertEqual(result["sceneId"], "existing")
        self.assertEqual(result["contentModes"], ["diagram", "notes"])
        self.assertEqual(result["renderMode"], "generatedAsset")
        self.assertIsNone(result["_imageRequest"])

    async def test_cross_mode_expansions_emit_strict_retained_payload_markers(self) -> None:
        cases = (
            ("Add a diagram.", ["notes"], "structured", ["notes", "diagram"], True),
            ("Add notes.", ["visual"], "structured", ["visual", "notes"], False),
            ("Add a diagram.", ["visual"], "structured", ["visual", "diagram"], True),
        )
        for prompt, existing_modes, existing_render_mode, expected_modes, expects_image in cases:
            with self.subTest(prompt=prompt, existing_modes=existing_modes):
                raw = director_decision("update")
                new_mode = expected_modes[-1]
                raw.update({
                    "mergeBehavior": "expand",
                    "targetSceneId": "existing",
                    "contentModes": [new_mode],
                    "summaryBullets": ["A retained visual now has concise notes."]
                    if new_mode == "notes" else [],
                    "requestedFootprint": "small",
                    "renderMode": "generatedAsset" if new_mode == "diagram" else "structured",
                    "imagePrompt": "A water cycle process diagram."
                    if new_mode == "diagram" else "",
                    "scene": {"entities": [], "connections": []},
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt,
                    context={
                        "turnSequence": 7,
                        "board": {
                            "version": 3,
                            "currentPage": 1,
                            "scenes": [{
                                "sceneId": "existing",
                                "conceptKey": "water-cycle",
                                "contentModes": existing_modes,
                                "renderMode": existing_render_mode,
                                "placement": {
                                    "page": 1, "column": 0, "row": 0,
                                    "width": 12 if "visual" in existing_modes else 8,
                                    "height": 6 if "visual" in existing_modes else 5,
                                },
                            }],
                        },
                    },
                )
                self.assertEqual(result["mergeBehavior"], "expand")
                self.assertEqual(result["contentModes"], expected_modes)
                self.assertEqual(result["summaryBullets"], [] if "notes" in existing_modes else raw["summaryBullets"])
                self.assertIsNone(result["stickScene"])
                self.assertEqual(result["_imageRequest"] is not None, expects_image)

    async def test_removal_verbs_forbid_only_the_referenced_mode(self) -> None:
        cases = {
            "Remove the diagram and keep the rest.": "diagram",
            "Delete the notes and keep the rest.": "notes",
            "Drop the visual and keep the rest.": "visual",
            "Clear the diagram and keep the rest.": "diagram",
            "Clear notes and keep the rest.": "notes",
        }
        for prompt, removed_mode in cases.items():
            with self.subTest(prompt=prompt):
                raw = director_decision("update")
                raw.update({
                    "mergeBehavior": "expand",
                    "targetSceneId": "existing",
                    "renderMode": "structured",
                    "imagePrompt": "",
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
                    prompt,
                    context={
                        "turnSequence": 8,
                        "board": {
                            "version": 4,
                            "scenes": [{
                                "sceneId": "existing",
                                "conceptKey": "water-cycle",
                                "contentModes": ["visual", "notes", "diagram"],
                                "renderMode": "generatedAsset",
                                "placement": {
                                    "page": 1, "column": 0, "row": 0,
                                    "width": 24, "height": 10,
                                },
                            }],
                        },
                    },
                )
                self.assertEqual(result["action"], "update")
                self.assertEqual(result["mergeBehavior"], "replace")
                self.assertNotIn(removed_mode, result["contentModes"])

        clause = classify_whiteboard_intent("Remove the diagram and add notes.")
        self.assertEqual(clause.forbidden_modes, ("diagram",))
        self.assertEqual(clause.required_modes, ("notes",))
        retained_clause = classify_whiteboard_intent("Remove the diagram and keep notes.")
        self.assertEqual(retained_clause.forbidden_modes, ("diagram",))
        self.assertEqual(retained_clause.required_modes, ("notes",))

    async def test_clear_adjectives_preserve_requested_create_modes(self) -> None:
        for prompt, mode in (
            ("Make a clear diagram.", "diagram"),
            ("Show a clear visual.", "visual"),
        ):
            with self.subTest(prompt=prompt):
                raw = director_decision()
                raw.update({
                    "contentModes": [mode],
                    "summaryBullets": [],
                    "requestedFootprint": "medium" if mode == "diagram" else "small",
                    "renderMode": "generatedAsset" if mode == "diagram" else "structured",
                    "imagePrompt": "A clear water cycle diagram." if mode == "diagram" else "",
                })
                result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(prompt)
                self.assertEqual(result["action"], "create")
                self.assertEqual(result["contentModes"], [mode])

    async def test_not_only_addition_expands_without_a_new_diagram_job(self) -> None:
        raw = director_decision("update")
        raw.update({
            "mergeBehavior": "expand",
            "targetSceneId": "existing",
            "contentModes": ["notes"],
            "requestedFootprint": "small",
            "renderMode": "structured",
            "imagePrompt": "",
            "scene": {"entities": [], "connections": []},
        })
        result = await self.pipeline(StubTransport([gemini_text(raw)])).generate(
            "Not only a diagram; add notes too.",
            context={
                "turnSequence": 9,
                "board": {
                    "version": 5,
                    "scenes": [{
                        "sceneId": "existing",
                        "conceptKey": "water-cycle",
                        "contentModes": ["diagram"],
                        "renderMode": "generatedAsset",
                        "placement": {
                            "page": 1, "column": 0, "row": 0,
                            "width": 12, "height": 6,
                        },
                    }],
                },
            },
        )
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["mergeBehavior"], "expand")
        self.assertEqual(result["contentModes"], ["diagram", "notes"])
        self.assertIsNone(result["_imageRequest"])

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
        self.assertEqual(result["mergeBehavior"], "replace")

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
        factual_prompt = "Two people exchange a ball."
        visual = await self.pipeline(transport).generate_visual(
            "image", factual_prompt, "Exchange"
        )
        body = json.loads(transport.requests[0][0].data)
        self.assertNotIn("thinkingConfig", json.dumps(body))
        self.assertEqual(body["contents"][0]["parts"][0]["text"], factual_prompt)
        self.assertEqual(
            body["systemInstruction"]["parts"][0]["text"],
            IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
        )
        system_text = IMAGE_GENERATOR_SYSTEM_INSTRUCTION.lower()
        for phrase in (
            "only subjects, actions, and relationships stated in the brief",
            "anchor every connector to a node edge",
            "route it around all content",
            "keep crossings minimal",
            "generous internal padding",
            "clear gutters",
            "comfortable outer margins",
            "balanced scale and composition",
            "restrained, consistent stroke weights and arrowheads",
            "accessible educational color palette",
            "never make meaning depend on color alone",
            "non-color cues",
            "text, words, letters, numbers, labels, captions, signs, watermarks",
            "text-like marks",
            "do not use photorealism",
        ):
            self.assertIn(phrase, system_text)
        self.assertEqual(visual["mimeType"], "image/png")

    async def test_image_failure_returns_none_and_does_not_retry(self) -> None:
        transport = StubTransport([gemini_text("No image")])
        visual = await self.pipeline(transport).generate_visual("image", "Prompt", "Alt")
        self.assertIsNone(visual)
        self.assertEqual(len(transport.requests), 1)

    async def test_transient_image_exhaustion_uses_fallback_once(self) -> None:
        encoded = base64.b64encode(b"fallback-image").decode()
        transport = StubTransport([
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            {
                "candidates": [{"content": {"parts": [{"inlineData": {
                    "mimeType": "image/png",
                    "data": encoded,
                }}]}}]
            },
        ])
        with (
            patch("backend.services.gemini_pipeline.random.uniform", return_value=0.0),
            patch("backend.services.gemini_pipeline.time.sleep"),
        ):
            visual = await self.pipeline(transport).generate_visual(
                "image", "Prompt", "Fallback image"
            )

        self.assertEqual(visual["mimeType"], "image/png")
        self.assertEqual(
            requested_models(transport),
            ["image-test", "image-test", "image-test", DEFAULT_IMAGE_FALLBACK_MODEL],
        )

    async def test_exhausted_image_fallback_returns_none(self) -> None:
        transport = StubTransport([
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            GeminiTransientError("fallback overloaded"),
        ])
        with (
            patch("backend.services.gemini_pipeline.random.uniform", return_value=0.0),
            patch("backend.services.gemini_pipeline.time.sleep"),
        ):
            visual = await self.pipeline(transport).generate_visual(
                "image", "Prompt", "Trusted fallback"
            )

        self.assertIsNone(visual)
        self.assertEqual(len(transport.requests), 4)

    async def test_diagram_image_uses_its_distinct_strict_instruction(self) -> None:
        encoded = base64.b64encode(b"diagram").decode()
        transport = StubTransport([{
            "candidates": [{"content": {"parts": [{"inlineData": {
                "mimeType": "image/png",
                "data": encoded,
            }}]}}]
        }])
        prompt = "Water evaporates from a lake and condenses in a cloud."
        diagram = await self.pipeline(transport).generate_visual(
            "image", prompt, "Water cycle diagram", "diagram"
        )

        body = json.loads(transport.requests[0][0].data)
        self.assertEqual(body["contents"][0]["parts"][0]["text"], prompt)
        self.assertEqual(
            body["systemInstruction"]["parts"][0]["text"],
            DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
        )
        self.assertNotEqual(
            DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
            IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
        )
        instruction = DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION.lower()
        for phrase in (
            "one actual diagram",
            "not a scene, photograph, or photorealistic illustration",
            "only entities and relationships supported by the brief",
            "never invent arrows",
            "correct direction",
            "non-overlapping",
            "anchor connectors to node edges",
            "route them around all content",
            "keep crossings minimal",
            "generous internal padding",
            "clear gutters",
            "comfortable outer margins",
            "no cropping",
            "balanced scale",
            "restrained, consistent stroke weights and arrowheads",
            "accessible educational color palette",
            "never make meaning depend on color alone",
            "non-color cues",
            "clutter",
            "watermarks",
            "text-like marks",
            "photorealism",
        ):
            self.assertIn(phrase, instruction)
        self.assertEqual(diagram["mimeType"], "image/png")

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
        self.assertEqual(pipeline.text_fallback_model, DEFAULT_TEXT_FALLBACK_MODEL)
        self.assertEqual(pipeline.image_fallback_model, DEFAULT_IMAGE_FALLBACK_MODEL)

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

    def test_blank_fallback_environment_values_disable_fallbacks(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "PROD_GEMINI_API_KEY": TEST_KEY,
                "GEMINI_TEXT_FALLBACK_MODEL": "   ",
                "GEMINI_IMAGE_FALLBACK_MODEL": "",
            },
            clear=True,
        ):
            pipeline = GeminiPipeline(transport=StubTransport([]))

        self.assertEqual(pipeline.text_fallback_model, "")
        self.assertEqual(pipeline.image_fallback_model, "")

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
                text_fallback_model=" explicit-text-fallback ",
                image_fallback_model=" ",
                transport=StubTransport([]),
            )

        self.assertEqual(pipeline.text_api_key, "explicit-text-key")
        self.assertEqual(pipeline.image_api_key, "explicit-image-key")
        self.assertEqual(pipeline.text_model, "")
        self.assertEqual(pipeline.image_model, "")
        self.assertEqual(pipeline.text_fallback_model, "explicit-text-fallback")
        self.assertEqual(pipeline.image_fallback_model, "")

    async def test_explicit_blank_primary_still_disables_text_generation(self) -> None:
        transport = StubTransport([])
        pipeline = GeminiPipeline(
            text_api_key=TEST_KEY,
            text_model="",
            text_fallback_model="fallback-does-not-enable-primary",
            transport=transport,
        )
        with self.assertRaises(GeminiConfigurationError):
            await pipeline.generate("Explain ATP.")
        self.assertEqual(transport.requests, [])

    def test_prompt_covers_required_private_direction(self) -> None:
        prompt_text = VISUAL_DIRECTOR_SYSTEM_INSTRUCTION.lower()
        for phrase in (
            "evidence in this order", "one atomic concept", "update",
            "left-to-right", "12 by 8", "image gate", "never expose reasoning", "json only",
            "sparse monochrome black or neutral outline",
            "concise factual content brief",
            "smallest useful ordered contentmodes subset", "visual, notes, and diagram",
            "concept-specific scene entities", "never a partial patch",
            "never emit html, css, svg", "do not provide coordinates or sizes",
            "when diagram is newly selected or replaced",
            "the existing diagram is preserved without another image request",
            "full evidence-grounded scene", "separate structured visual pane",
            "otherwise return empty entities and connections",
        ):
            self.assertIn(phrase, prompt_text)
        image_gate = prompt_text.split("image gate", 1)[1].split("output discipline", 1)[0]
        for raster_style_rule in (
            "monochrome", "no color", "color fills", "embedded text", "watermarks",
        ):
            self.assertNotIn(raster_style_rule, image_gate)
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


class GeminiReliabilityTests(unittest.TestCase):
    def pipeline(self, transport) -> GeminiPipeline:
        return GeminiPipeline(
            text_api_key=TEST_KEY,
            image_api_key=TEST_KEY,
            text_model="primary-model",
            image_model="primary-model",
            text_fallback_model="fallback-model",
            image_fallback_model="fallback-model",
            transport=transport,
        )

    def test_retries_share_deadline_then_cooldown_bypasses_primary(self) -> None:
        clock = FakeClock()
        transport = StubTransport([
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            {"source": "fallback"},
            {"source": "cooldown-fallback"},
            {"source": "primary-after-expiry"},
        ])
        pipeline = self.pipeline(transport)

        with (
            patch("backend.services.gemini_pipeline.time.monotonic", clock.monotonic),
            patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
            patch(
                "backend.services.gemini_pipeline.random.uniform",
                side_effect=[0.1, 0.2],
            ),
        ):
            first = pipeline._request_model(
                "primary-model",
                TEST_KEY,
                {"prompt": "private"},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )
            second = pipeline._request_model(
                "primary-model",
                TEST_KEY,
                {"prompt": "private"},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )
            clock.now += 30.0
            third = pipeline._request_model(
                "primary-model",
                TEST_KEY,
                {"prompt": "private"},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )

        self.assertEqual(first["source"], "fallback")
        self.assertEqual(second["source"], "cooldown-fallback")
        self.assertEqual(third["source"], "primary-after-expiry")
        self.assertEqual(clock.sleeps, [0.6, 1.2])
        self.assertEqual(
            requested_models(transport),
            [
                "primary-model",
                "primary-model",
                "primary-model",
                "fallback-model",
                "fallback-model",
                "primary-model",
            ],
        )
        expected_timeouts = [20.0, 19.4, 18.2, 28.2, 30.0, 20.0]
        for (_, actual), expected in zip(transport.requests, expected_timeouts):
            self.assertAlmostEqual(actual, expected)

    def test_fast_transients_keep_three_primary_attempts_and_full_remainder(self) -> None:
        cases = (
            ("text", 30.0, [20.0, 19.5, 18.5, 28.5]),
            ("image", 90.0, [60.0, 59.5, 58.5, 88.5]),
        )
        for channel, total, expected_timeouts in cases:
            with self.subTest(channel=channel):
                clock = FakeClock()
                transport = ClockedTransport(
                    [
                        GeminiTransientError("fast overload"),
                        GeminiTransientError("fast overload"),
                        GeminiTransientError("fast overload"),
                        {"source": "fallback"},
                    ],
                    clock,
                    [0.0, 0.0, 0.0, 0.0],
                )
                pipeline = self.pipeline(transport)
                with (
                    patch(
                        "backend.services.gemini_pipeline.time.monotonic",
                        clock.monotonic,
                    ),
                    patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
                    patch(
                        "backend.services.gemini_pipeline.random.uniform",
                        return_value=0.0,
                    ),
                ):
                    result = pipeline._request_model(
                        "primary-model",
                        TEST_KEY,
                        {},
                        total,
                        channel=channel,
                        fallback_model="fallback-model",
                    )

                self.assertEqual(result["source"], "fallback")
                self.assertEqual(
                    requested_models(transport),
                    ["primary-model"] * 3 + ["fallback-model"],
                )
                self.assertEqual(clock.sleeps, [0.5, 1.0])
                for (_, actual), expected in zip(
                    transport.requests, expected_timeouts
                ):
                    self.assertAlmostEqual(actual, expected)

    def test_nontransient_error_is_not_retried_or_cooled_down(self) -> None:
        transport = StubTransport([GeminiProviderError("invalid request")])
        pipeline = self.pipeline(transport)
        with patch("backend.services.gemini_pipeline.time.sleep") as sleep:
            with self.assertRaisesRegex(GeminiProviderError, "invalid request"):
                pipeline._request_model(
                    "primary-model",
                    TEST_KEY,
                    {},
                    30.0,
                    channel="text",
                    fallback_model="fallback-model",
                )

        self.assertEqual(len(transport.requests), 1)
        self.assertEqual(pipeline._cooldowns, {})
        sleep.assert_not_called()

    def test_same_as_primary_fallback_is_skipped(self) -> None:
        transport = StubTransport([
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
            GeminiTransientError("overloaded"),
        ])
        pipeline = self.pipeline(transport)
        with (
            patch("backend.services.gemini_pipeline.random.uniform", return_value=0.0),
            patch("backend.services.gemini_pipeline.time.sleep"),
        ):
            with self.assertRaises(GeminiTransientError):
                pipeline._request_model(
                    "primary-model",
                    TEST_KEY,
                    {},
                    30.0,
                    channel="text",
                    fallback_model="primary-model",
                )

        self.assertEqual(requested_models(transport), ["primary-model"] * 3)
        self.assertEqual(pipeline._cooldowns, {})

    def test_slow_primary_timeout_preserves_text_and_image_fallback_reserves(self) -> None:
        cases = (
            ("text", 30.0, 20.0, 10.0),
            ("image", 90.0, 60.0, 30.0),
        )
        for channel, total, primary_cap, reserve in cases:
            with self.subTest(channel=channel):
                clock = FakeClock()
                transport = ClockedTransport(
                    [GeminiTransientError("slow overload"), {"source": "fallback"}],
                    clock,
                    [None, 0.0],
                )
                pipeline = self.pipeline(transport)
                with (
                    patch(
                        "backend.services.gemini_pipeline.time.monotonic",
                        clock.monotonic,
                    ),
                    patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
                    patch(
                        "backend.services.gemini_pipeline.random.uniform",
                        return_value=0.0,
                    ),
                ):
                    result = pipeline._request_model(
                        "primary-model",
                        TEST_KEY,
                        {},
                        total,
                        channel=channel,
                        fallback_model="fallback-model",
                    )

                self.assertEqual(result["source"], "fallback")
                self.assertEqual(
                    requested_models(transport), ["primary-model", "fallback-model"]
                )
                self.assertEqual(clock.sleeps, [])
                self.assertAlmostEqual(transport.requests[0][1], primary_cap)
                self.assertAlmostEqual(transport.requests[1][1], reserve)

    def test_retry_budget_allows_equality_and_skips_immediately_below(self) -> None:
        cases = (
            (15.5, ["primary-model", "primary-model"], [0.5], [20.0, 5.0]),
            (15.499, ["primary-model", "fallback-model"], [], [20.0, 15.499]),
        )
        for remaining_after_failure, models, sleeps, timeouts in cases:
            with self.subTest(remaining=remaining_after_failure):
                clock = FakeClock()
                transport = ClockedTransport(
                    [GeminiTransientError("overloaded"), {"source": "recovered"}],
                    clock,
                    [30.0 - remaining_after_failure, 0.0],
                )
                pipeline = self.pipeline(transport)
                with (
                    patch(
                        "backend.services.gemini_pipeline.time.monotonic",
                        clock.monotonic,
                    ),
                    patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
                    patch(
                        "backend.services.gemini_pipeline.random.uniform",
                        return_value=0.0,
                    ),
                ):
                    pipeline._request_model(
                        "primary-model",
                        TEST_KEY,
                        {},
                        30.0,
                        channel="text",
                        fallback_model="fallback-model",
                    )

                self.assertEqual(requested_models(transport), models)
                self.assertEqual(clock.sleeps, sleeps)
                for (_, actual), expected in zip(transport.requests, timeouts):
                    self.assertAlmostEqual(actual, expected)

    def test_primary_is_bypassed_at_or_below_fallback_reserve(self) -> None:
        for remaining in (10.0, 5.0):
            with self.subTest(remaining=remaining):
                clock = FakeClock()
                transport = ClockedTransport(
                    [{"source": "fallback"}], clock, [0.0]
                )
                pipeline = self.pipeline(transport)

                def consume_initial_budget(_key) -> bool:
                    clock.now += 30.0 - remaining
                    return False

                with (
                    patch(
                        "backend.services.gemini_pipeline.time.monotonic",
                        clock.monotonic,
                    ),
                    patch.object(
                        pipeline, "_in_cooldown", side_effect=consume_initial_budget
                    ),
                ):
                    result = pipeline._request_model(
                        "primary-model",
                        TEST_KEY,
                        {},
                        30.0,
                        channel="text",
                        fallback_model="fallback-model",
                    )

                self.assertEqual(result["source"], "fallback")
                self.assertEqual(requested_models(transport), ["fallback-model"])
                self.assertAlmostEqual(transport.requests[0][1], remaining)
                self.assertEqual(pipeline._cooldowns, {})

    def test_timeout_overrun_starts_cooldown_without_late_work(self) -> None:
        clock = FakeClock()
        original_error = GeminiTransientError("provider-body-secret")
        transport = ClockedTransport(
            [original_error, {"source": "cooldown-fallback"}],
            clock,
            [30.1, 0.0],
        )
        pipeline = self.pipeline(transport)
        with (
            patch("backend.services.gemini_pipeline.time.monotonic", clock.monotonic),
            patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
            self.assertLogs("backend.services.gemini_pipeline", level="WARNING") as logs,
        ):
            with self.assertRaises(GeminiTransientError) as raised:
                pipeline._request_model(
                    "primary-model",
                    "api-key-secret",
                    {"prompt": "prompt-secret"},
                    30.0,
                    channel="text",
                    fallback_model="fallback-model",
                )

        self.assertIs(raised.exception, original_error)
        self.assertEqual(requested_models(transport), ["primary-model"])
        self.assertEqual(clock.sleeps, [])
        output = "\n".join(logs.output)
        self.assertIn("cooldown started but deadline prevents fallback", output)
        self.assertNotIn("fallback selected", output)
        for secret in ("provider-body-secret", "api-key-secret", "prompt-secret"):
            self.assertNotIn(secret, output)

        with patch(
            "backend.services.gemini_pipeline.time.monotonic", clock.monotonic
        ):
            result = pipeline._request_model(
                "primary-model",
                TEST_KEY,
                {},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )

        self.assertEqual(result["source"], "cooldown-fallback")
        self.assertEqual(
            requested_models(transport), ["primary-model", "fallback-model"]
        )
        self.assertAlmostEqual(transport.requests[0][1], 20.0)
        self.assertAlmostEqual(transport.requests[1][1], 30.0)

    def test_disabled_or_same_fallback_keeps_full_primary_timeout(self) -> None:
        for fallback_model in ("", "primary-model"):
            with self.subTest(fallback_model=fallback_model or "disabled"):
                clock = FakeClock()
                transport = ClockedTransport([{"ok": True}], clock, [0.0])
                pipeline = self.pipeline(transport)
                with patch(
                    "backend.services.gemini_pipeline.time.monotonic",
                    clock.monotonic,
                ):
                    pipeline._request_model(
                        "primary-model",
                        TEST_KEY,
                        {},
                        30.0,
                        channel="text",
                        fallback_model=fallback_model,
                    )

                self.assertEqual(requested_models(transport), ["primary-model"])
                self.assertAlmostEqual(transport.requests[0][1], 30.0)
                self.assertEqual(pipeline._cooldowns, {})

    def test_cooldown_keys_separate_text_and_image_channels(self) -> None:
        transport = StubTransport([
            {"source": "text-fallback"},
            {"source": "image-primary"},
        ])
        pipeline = self.pipeline(transport)
        pipeline._start_cooldown(("text", "primary-model"))

        text_result = pipeline._request_model(
            "primary-model",
            TEST_KEY,
            {},
            30.0,
            channel="text",
            fallback_model="fallback-model",
        )
        image_result = pipeline._request_model(
            "primary-model",
            TEST_KEY,
            {},
            90.0,
            channel="image",
            fallback_model="fallback-model",
        )

        self.assertEqual(text_result["source"], "text-fallback")
        self.assertEqual(image_result["source"], "image-primary")
        self.assertEqual(requested_models(transport), ["fallback-model", "primary-model"])

    def test_concurrent_cooldown_reads_all_bypass_primary(self) -> None:
        class ConcurrentTransport:
            def __init__(self) -> None:
                self.models: list[str] = []
                self.lock = threading.Lock()

            def __call__(self, request, _timeout_seconds):
                encoded_model = request.full_url.rsplit("/", 1)[-1].split(":", 1)[0]
                with self.lock:
                    self.models.append(urllib.parse.unquote(encoded_model))
                return {"ok": True}

        transport = ConcurrentTransport()
        pipeline = self.pipeline(transport)
        pipeline._start_cooldown(("text", "primary-model"))

        def request_during_cooldown(_index: int) -> dict[str, object]:
            return pipeline._request_model(
                "primary-model",
                TEST_KEY,
                {},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )

        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(request_during_cooldown, range(12)))

        self.assertTrue(all(result == {"ok": True} for result in results))
        self.assertEqual(transport.models, ["fallback-model"] * 12)

    def test_retry_logs_do_not_include_request_or_provider_secrets(self) -> None:
        transport = StubTransport([
            GeminiTransientError("provider-body-secret"),
            GeminiTransientError("provider-body-secret"),
            GeminiTransientError("provider-body-secret"),
            {"ok": True},
        ])
        pipeline = self.pipeline(transport)
        with (
            patch("backend.services.gemini_pipeline.random.uniform", return_value=0.0),
            patch("backend.services.gemini_pipeline.time.sleep"),
            self.assertLogs("backend.services.gemini_pipeline", level="WARNING") as logs,
        ):
            pipeline._request_model(
                "primary-model",
                "api-key-secret",
                {"prompt": "prompt-secret"},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )

        output = "\n".join(logs.output)
        self.assertIn("text retry 1/2 in 0.500s", output)
        self.assertIn("text retry 2/2 in 1.000s", output)
        self.assertIn("cooldown started and fallback selected", output)
        for secret in ("provider-body-secret", "api-key-secret", "prompt-secret"):
            self.assertNotIn(secret, output)

    def test_budget_skip_log_is_accurate_and_secret_free(self) -> None:
        clock = FakeClock()
        transport = ClockedTransport(
            [GeminiTransientError("provider-body-secret"), {"ok": True}],
            clock,
            [14.501, 0.0],
        )
        pipeline = self.pipeline(transport)
        with (
            patch("backend.services.gemini_pipeline.time.monotonic", clock.monotonic),
            patch("backend.services.gemini_pipeline.time.sleep", clock.sleep),
            patch("backend.services.gemini_pipeline.random.uniform", return_value=0.0),
            self.assertLogs("backend.services.gemini_pipeline", level="WARNING") as logs,
        ):
            pipeline._request_model(
                "primary-model",
                "api-key-secret",
                {"prompt": "prompt-secret"},
                30.0,
                channel="text",
                fallback_model="fallback-model",
            )

        output = "\n".join(logs.output)
        self.assertIn("retry skipped; remaining budget reserved for fallback", output)
        self.assertIn("cooldown started and fallback selected", output)
        self.assertNotIn("deadline prevents fallback", output)
        self.assertEqual(clock.sleeps, [])
        for secret in ("provider-body-secret", "api-key-secret", "prompt-secret"):
            self.assertNotIn(secret, output)


class GeminiTransportTests(unittest.TestCase):
    def test_only_retryable_http_statuses_are_transient(self) -> None:
        for status in (408, 500, 502, 503, 504):
            with self.subTest(status=status):
                error = urllib.error.HTTPError(
                    "https://provider.invalid",
                    status,
                    "Provider failure",
                    {},
                    io.BytesIO(b'{"error":{"message":"overloaded"}}'),
                )
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaises(GeminiTransientError):
                        _default_json_transport(
                            urllib.request.Request("https://provider.invalid"), 1
                        )

    def test_other_http_statuses_are_not_transient(self) -> None:
        for status in (400, 401, 403, 404, 429, 418):
            with self.subTest(status=status):
                error = urllib.error.HTTPError(
                    "https://provider.invalid",
                    status,
                    "Provider failure",
                    {},
                    io.BytesIO(b'{"error":{"message":"request rejected"}}'),
                )
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaises(GeminiProviderError) as raised:
                        _default_json_transport(
                            urllib.request.Request("https://provider.invalid"), 1
                        )
                self.assertNotIsInstance(raised.exception, GeminiTransientError)

    def test_timeout_and_url_errors_are_transient(self) -> None:
        for error in (TimeoutError("timeout"), urllib.error.URLError("offline")):
            with self.subTest(error=type(error).__name__):
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaises(GeminiTransientError):
                        _default_json_transport(
                            urllib.request.Request("https://provider.invalid"), 1
                        )

    def test_unreadable_success_payload_is_not_transient(self) -> None:
        with patch("urllib.request.urlopen", return_value=io.BytesIO(b"not-json")):
            with self.assertRaises(GeminiProviderError) as raised:
                _default_json_transport(
                    urllib.request.Request("https://provider.invalid"), 1
                )
        self.assertNotIsInstance(raised.exception, GeminiTransientError)

    def test_http_error_content_is_absent_from_exception_and_downstream_log(self) -> None:
        sentinels = (
            "provider-body-sentinel",
            "prompt-sentinel",
            "payload-sentinel",
            "api-key-sentinel",
            "provider-reason-sentinel",
        )
        error = urllib.error.HTTPError(
            "https://provider.invalid?key=api-key-sentinel",
            503,
            "provider-reason-sentinel",
            {},
            io.BytesIO(json.dumps({
                "error": {
                    "message": "provider-body-sentinel prompt-sentinel payload-sentinel"
                }
            }).encode()),
        )
        diagnostic_logger = logging.getLogger("tests.gemini_transport_diagnostic")
        captured_error: GeminiProviderError | None = None

        with (
            patch("urllib.request.urlopen", side_effect=error),
            self.assertLogs(diagnostic_logger.name, level="ERROR") as logs,
        ):
            try:
                _default_json_transport(
                    urllib.request.Request("https://provider.invalid"), 1
                )
            except GeminiProviderError as provider_error:
                captured_error = provider_error
                diagnostic_logger.exception("Normalized Gemini transport failure")

        self.assertIsNotNone(captured_error)
        assert captured_error is not None
        exception_text = str(captured_error)
        formatted_log = "\n".join(
            logging.Formatter("%(levelname)s:%(name)s:%(message)s").format(record)
            for record in logs.records
        )
        self.assertIsInstance(captured_error, GeminiTransientError)
        self.assertIn("HTTP 503", exception_text)
        self.assertIn("HTTP 503", formatted_log)
        for sentinel in sentinels:
            self.assertNotIn(sentinel, exception_text)
            self.assertNotIn(sentinel, formatted_log)

    def test_quota_error_preserves_safe_category_without_provider_body(self) -> None:
        error = urllib.error.HTTPError(
            "https://provider.invalid", 429, "Too Many Requests", {},
            io.BytesIO(json.dumps({
                "error": {
                    "status": "provider-status-sentinel",
                    "message": "provider-body-sentinel",
                }
            }).encode()),
        )
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(GeminiProviderError) as raised:
                _default_json_transport(urllib.request.Request("https://provider.invalid"), 1)

        message = str(raised.exception)
        self.assertIn("quota-limited", message)
        self.assertIn("HTTP 429", message)
        self.assertNotIn("provider-status-sentinel", message)
        self.assertNotIn("provider-body-sentinel", message)


if __name__ == "__main__":
    unittest.main()
