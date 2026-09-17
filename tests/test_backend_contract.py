import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from pydantic import ValidationError

import backend.main as backend_main
from backend.main import GenerateRequest, GenerateResponse, SlidingWindowRateLimiter
from backend.services.gemini_pipeline import GeminiProviderError


def accepted_stick_scene() -> dict[str, object]:
    return {
        "version": 1,
        "columns": 12,
        "rows": 8,
        "entities": [
            {"id": "mass-a", "type": "circle", "x": 0, "y": 0, "width": 2, "height": 2, "label": "A", "pose": "neutral", "facing": "front"},
            {"id": "mass-b", "type": "circle", "x": 4, "y": 0, "width": 2, "height": 2, "label": "B", "pose": "neutral", "facing": "front"},
        ],
        "connections": [{"id": "attracts", "fromId": "mass-a", "toId": "mass-b", "label": "attracts", "direction": "both"}],
    }


def accepted_result() -> dict[str, object]:
    return {
        "boardVersion": 1,
        "turnSequence": 1,
        "boardStrategy": "integrate",
        "action": "create",
        "mergeBehavior": "replace",
        "conceptKey": "gravity",
        "title": "Gravity",
        "headingMode": "show",
        "summaryBullets": [],
        "summary": "Gravity attracts masses.",
        "contentModes": ["diagram"],
        "confidence": 0.9,
        "sceneId": "scene-1",
        "targetSceneId": None,
        "requestedFootprint": "medium",
        "placement": {"page": 1, "column": 0, "row": 0, "width": 12, "height": 6},
        "stickScene": None,
        "renderMode": "generatedAsset",
        "generatedAsset": None,
        "visualJobId": "job-existing",
        "warning": None,
        "_imageRequest": None,
    }


class BackendContractTests(unittest.TestCase):
    def test_request_context_has_hard_bounds(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="x" * 4001)
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="ATP", lessonContext={"source": "x" * 3601})
        with self.assertRaises(ValidationError):
            GenerateRequest(
                userInput="ATP",
                recentTurns=[{"userInput": "x" * 401} for _ in range(6)],
            )
        with self.assertRaises(ValidationError):
            GenerateRequest(
                userInput="ATP",
                concepts=[{"conceptKey": f"c-{index}"} for index in range(25)],
            )
        historical = GenerateRequest(
            userInput="ATP",
            recentTurns=[{"action": "hold", "userInput": "Moving on."}],
        )
        self.assertEqual(historical.recentTurns[0].action, "hold")

    def test_mode_is_retained_only_as_compatibility_input(self) -> None:
        self.assertEqual(GenerateRequest(userInput="ATP").mode, "live")
        self.assertEqual(GenerateRequest(userInput="ATP", mode="prepare").mode, "prepare")
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="ATP", mode="unknown")

    def test_board_dimensions_and_scene_bounds_are_fixed(self) -> None:
        request = GenerateRequest(userInput="ATP")
        self.assertEqual((request.board.columns, request.board.rows), (24, 14))
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="ATP", board={"columns": 12, "rows": 14})
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="ATP", board={"scenes": [{
                "sceneId": "bad",
                "contentModes": ["notes"],
                "placement": {"page": 1, "column": 20, "row": 0, "width": 8, "height": 6},
            }]})

    def test_response_rejects_mode_dependency_mismatches(self) -> None:
        base = {**accepted_result(), "summaryBullets": ["Gravity attracts masses."], "contentModes": ["notes"], "requestedFootprint": "small", "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5}, "stickScene": None, "renderMode": "structured", "visualJobId": None}
        GenerateResponse(**base)
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**base, "contentModes": ["notes", "notes"]})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**base, "contentModes": ["diagram"]})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**base, "renderMode": "generatedAsset", "visualJobId": "job"})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**base, "summaryBullets": []})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**accepted_result(), "summaryBullets": ["Unselected note."]})

    def test_response_rejects_removed_hold_action(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**accepted_result(), "action": "hold"})

    def test_expand_marker_is_bounded_to_an_integrated_diagram_update(self) -> None:
        marker = {
            **accepted_result(),
            "action": "update",
            "mergeBehavior": "expand",
            "targetSceneId": "scene-1",
            "contentModes": ["diagram", "notes"],
            "summaryBullets": ["Gravity attracts every mass."],
            "visualJobId": None,
        }
        GenerateResponse(**marker)
        GenerateResponse.model_validate(
            {**marker, "_imageRequest": None},
            context={"allow_internal_image_request": True},
        )
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**accepted_result(), "mergeBehavior": "expand"})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**marker, "boardStrategy": "reset"})
        # The same public shape can represent notes -> new diagram internally;
        # the resolved pipeline distinguishes it by supplying one image request.
        GenerateResponse.model_validate(
            {**marker, "_imageRequest": {"imagePrompt": "Draw gravity.", "visualAlt": "Gravity"}},
            context={"allow_internal_image_request": True},
        )
        with self.assertRaises(ValidationError):
            GenerateResponse.model_validate(
                {**marker, "_imageRequest": {"imagePrompt": "", "visualAlt": "Gravity"}},
                context={"allow_internal_image_request": True},
            )

        retained_notes = {
            **marker,
            "contentModes": ["notes", "diagram"],
            "summaryBullets": [],
            "visualJobId": "job-new-diagram",
        }
        GenerateResponse(**retained_notes)
        retained_visual = {
            **marker,
            "contentModes": ["visual", "notes"],
            "summaryBullets": ["Gravity attracts masses."],
            "stickScene": None,
            "renderMode": "structured",
            "visualJobId": None,
        }
        GenerateResponse(**retained_visual)
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**retained_notes, "mergeBehavior": "replace"})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**retained_visual, "mergeBehavior": "replace"})

    def test_response_enforces_reset_action_and_page_invariants(self) -> None:
        reset = {**accepted_result(), "boardStrategy": "reset"}
        GenerateResponse(**reset)
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**reset, "action": "update", "targetSceneId": "scene-1"})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{
                **reset,
                "placement": {"page": 2, "column": 0, "row": 0, "width": 12, "height": 6},
            })
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**reset, "boardStrategy": "archive"})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**reset, "headingMode": "inheritPrimary"})

    def test_response_rejects_malformed_stick_scene_graphs(self) -> None:
        valid_scene = accepted_stick_scene()
        base = {
            **accepted_result(),
            "contentModes": ["visual", "diagram"],
            "requestedFootprint": "full",
            "placement": {"page": 1, "column": 0, "row": 0, "width": 24, "height": 10},
            "stickScene": valid_scene,
        }
        corruptions = {
            "unsafe entity id": {**valid_scene, "entities": [{**valid_scene["entities"][0], "id": "bad id"}, valid_scene["entities"][1]]},
            "duplicate entity id": {**valid_scene, "entities": [valid_scene["entities"][0], {**valid_scene["entities"][1], "id": "mass-a"}]},
            "out of bounds entity": {**valid_scene, "entities": [{**valid_scene["entities"][0], "x": 11, "width": 2}, valid_scene["entities"][1]]},
            "overlapping entities": {**valid_scene, "entities": [valid_scene["entities"][0], {**valid_scene["entities"][1], "x": 1}]},
            "duplicate connection id": {**valid_scene, "connections": [valid_scene["connections"][0], valid_scene["connections"][0]]},
            "dangling connection": {**valid_scene, "connections": [{**valid_scene["connections"][0], "toId": "missing"}]},
            "self connection": {**valid_scene, "connections": [{**valid_scene["connections"][0], "toId": "mass-a"}]},
        }
        for name, scene in corruptions.items():
            with self.subTest(name=name), self.assertRaises(ValidationError):
                GenerateResponse(**{**base, "stickScene": scene})

    def test_response_enforces_action_identity_and_generated_visual_contract(self) -> None:
        base = accepted_result()
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**base, "targetSceneId": "scene-1"})
        update = {**base, "action": "update", "targetSceneId": "scene-1"}
        GenerateResponse(**update)
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**update, "targetSceneId": None})
        with self.assertRaises(ValidationError):
            GenerateResponse(**{**update, "targetSceneId": "scene-2"})

        visual = {
            **base,
            "contentModes": ["visual"],
            "summaryBullets": [],
            "requestedFootprint": "medium",
            "placement": {"page": 1, "column": 0, "row": 0, "width": 12, "height": 6},
            "stickScene": None,
            "renderMode": "generatedAsset",
            "visualJobId": None,
        }
        valid_asset = {
            "dataUrl": "data:image/png;base64,aW1hZ2U=",
            "mimeType": "image/png",
            "alt": "Two masses",
        }
        GenerateResponse(**{**visual, "visualJobId": "job-1"})
        GenerateResponse(**{**visual, "generatedAsset": valid_asset})
        valid_image_request = {
            "imagePrompt": "Two masses attract.",
            "visualAlt": "Two masses attracting",
        }
        GenerateResponse.model_validate(
            {**visual, "_imageRequest": valid_image_request},
            context={"allow_internal_image_request": True},
        )
        GenerateResponse.model_validate(
            {
                **accepted_result(),
                "visualJobId": None,
                "_imageRequest": valid_image_request,
            },
            context={"allow_internal_image_request": True},
        )
        invalid_internal_requests = {
            "missing request": None,
            "wrong request type": "prompt",
            "missing prompt": {"visualAlt": "Two masses"},
            "missing alt": {"imagePrompt": "Two masses attract."},
            "wrong prompt type": {"imagePrompt": 7, "visualAlt": "Two masses"},
            "wrong alt type": {"imagePrompt": "Two masses attract.", "visualAlt": 7},
            "blank prompt": {"imagePrompt": "   ", "visualAlt": "Two masses"},
            "blank alt": {"imagePrompt": "Two masses attract.", "visualAlt": "   "},
            "untrimmed prompt": {"imagePrompt": " Two masses attract. ", "visualAlt": "Two masses"},
            "untrimmed alt": {"imagePrompt": "Two masses attract.", "visualAlt": " Two masses "},
            "oversized prompt": {"imagePrompt": "x" * 801, "visualAlt": "Two masses"},
            "oversized alt": {"imagePrompt": "Two masses attract.", "visualAlt": "x" * 321},
            "extra field": {**valid_image_request, "style": "unsafe"},
        }
        for name, image_request in invalid_internal_requests.items():
            with self.subTest(name=name), self.assertRaises(ValidationError):
                GenerateResponse.model_validate(
                    {**visual, "_imageRequest": image_request},
                    context={"allow_internal_image_request": True},
                )
        for name, fields in {
            "neither asset nor job": {},
            "both asset and job": {"generatedAsset": valid_asset, "visualJobId": "job-1"},
            "unsafe job id": {"visualJobId": "bad job"},
            "wrong data mime": {"generatedAsset": {**valid_asset, "dataUrl": "data:image/jpeg;base64,aW1hZ2U="}},
            "malformed base64": {"generatedAsset": {**valid_asset, "dataUrl": "data:image/png;base64,%%%"}},
            "empty alt": {"generatedAsset": {**valid_asset, "alt": ""}},
        }.items():
            with self.subTest(name=name), self.assertRaises(ValidationError):
                GenerateResponse(**{**visual, **fields})

        structured_visual = {
            **accepted_result(),
            "contentModes": ["visual"],
            "summaryBullets": [],
            "renderMode": "structured",
            "visualJobId": None,
            "stickScene": accepted_stick_scene(),
        }
        GenerateResponse(**structured_visual)
        with self.assertRaises(ValidationError):
            GenerateResponse(**{
                **accepted_result(),
                "contentModes": ["visual", "diagram"],
                "requestedFootprint": "full",
                "placement": {"page": 1, "column": 0, "row": 0, "width": 24, "height": 10},
                "renderMode": "structured",
                "visualJobId": None,
            })

    def test_response_requires_generated_diagram_without_stick_fallback(self) -> None:
        diagram = accepted_result()
        GenerateResponse(**diagram)
        with self.assertRaisesRegex(ValidationError, "generated diagram asset"):
            GenerateResponse(**{
                **diagram,
                "renderMode": "structured",
                "visualJobId": None,
            })
        with self.assertRaisesRegex(ValidationError, "structured visual pane"):
            GenerateResponse(**{**diagram, "stickScene": accepted_stick_scene()})

    def test_rate_limiter_reopens_and_prunes_after_window(self) -> None:
        now = [100.0]
        limiter = SlidingWindowRateLimiter(limit=2, window_seconds=60, clock=lambda: now[0])
        self.assertTrue(limiter.allow("inactive"))
        self.assertTrue(limiter.allow("inactive"))
        self.assertFalse(limiter.allow("inactive"))
        now[0] = 161.0
        self.assertTrue(limiter.allow("active"))
        self.assertNotIn("inactive", limiter.requests)

    def test_deployed_request_gates_have_exact_per_minute_limits(self) -> None:
        expected = {
            "generation": (backend_main.generation_rate_limiter, 50),
            "visual polling": (backend_main.visual_status_rate_limiter, 480),
            "transcription key check": (
                backend_main.transcription_status_rate_limiter,
                50,
            ),
            "transcription connection": (
                backend_main.transcription_connection_rate_limiter,
                50,
            ),
        }
        for name, (limiter, limit) in expected.items():
            with self.subTest(name=name):
                self.assertEqual(limiter.limit, limit)
                self.assertEqual(limiter.window_seconds, 60.0)

    def test_public_runtime_config_uses_no_development_gemini_key(self) -> None:
        root = Path(__file__).resolve().parents[1]
        config_paths = (
            root / "backend" / "main.py",
            *sorted((root / "backend" / "services").rglob("*.py")),
            root / ".env.example",
            root / "docker-compose.yml",
            root / "README.md",
        )
        obsolete_key = "DEV_" + "GEMINI_API_KEY"
        for path in config_paths:
            with self.subTest(path=path):
                self.assertNotIn(obsolete_key, path.read_text(encoding="utf-8"))

    def test_backend_compose_passes_optional_gemini_fallback_models_through(self) -> None:
        root = Path(__file__).resolve().parents[1]
        compose = (root / "docker-compose.yml").read_text(encoding="utf-8")
        backend = compose.split("  frontend:", 1)[0]
        environment = backend.split("    environment:", 1)[1].split("    ports:", 1)[0]

        # A valueless Compose mapping inherits nonblank or explicitly blank host
        # values and removes the container variable when the host value is unset.
        for variable in (
            "GEMINI_TEXT_FALLBACK_MODEL",
            "GEMINI_IMAGE_FALLBACK_MODEL",
        ):
            with self.subTest(variable=variable):
                self.assertIn(f"      {variable}:\n", environment)
                self.assertNotIn(f"{variable}: ${{", environment)

    def test_environment_secrets_are_ignored_but_the_example_stays_public(self) -> None:
        root = Path(__file__).resolve().parents[1]
        ignore_rules = (root / ".gitignore").read_text(encoding="utf-8").splitlines()
        readme = (root / "README.md").read_text(encoding="utf-8")

        self.assertIn(".env", ignore_rules)
        self.assertIn(".env.*", ignore_rules)
        self.assertIn("!.env.example", ignore_rules)
        self.assertLess(ignore_rules.index(".env.*"), ignore_rules.index("!.env.example"))
        self.assertIn("`.env` and `.env.*` are excluded from Git", readme)
        self.assertIn("`.env.example` contains names and non-secret defaults", readme)

    def test_browser_origin_and_transcription_caps_remain(self) -> None:
        self.assertTrue(backend_main.is_allowed_browser_origin("http://localhost:3000"))
        self.assertFalse(backend_main.is_allowed_browser_origin("https://malicious.example"))
        client = "session-cap"
        backend_main.transcription_sessions.pop(client, None)
        try:
            self.assertTrue(backend_main.acquire_transcription_session(client))
            self.assertTrue(backend_main.acquire_transcription_session(client))
            self.assertFalse(backend_main.acquire_transcription_session(client))
        finally:
            backend_main.release_transcription_session(client)
            backend_main.release_transcription_session(client)


class VisualJobLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        with backend_main.visual_jobs_lock:
            backend_main.visual_jobs.clear()

    def tearDown(self) -> None:
        with backend_main.visual_jobs_lock:
            backend_main.visual_jobs.clear()

    async def test_structured_result_does_not_schedule_job(self) -> None:
        result = accepted_result()
        with patch.object(backend_main, "track_visual_task") as track:
            await backend_main.schedule_visual_generation(result)
        track.assert_not_called()
        self.assertEqual(backend_main.visual_jobs, {})

    async def test_image_job_is_reserved_before_task_starts(self) -> None:
        result = {
            **accepted_result(),
            "contentModes": ["visual"],
            "summaryBullets": [],
            "requestedFootprint": "medium",
            "placement": {"page": 1, "column": 0, "row": 0, "width": 12, "height": 6},
            "stickScene": None,
            "renderMode": "generatedAsset",
            "visualJobId": None,
            "_imageRequest": {"imagePrompt": "A teacher points.", "visualAlt": "Teacher points"},
        }
        GenerateResponse.model_validate(
            result,
            context={"allow_internal_image_request": True},
        )
        captured = []
        with patch.object(backend_main, "track_visual_task", side_effect=captured.append):
            await backend_main.schedule_visual_generation(result)
        self.assertIsNotNone(result["visualJobId"])
        self.assertIn(result["visualJobId"], backend_main.visual_jobs)
        self.assertEqual(backend_main.visual_jobs[result["visualJobId"]]["status"], "pending")
        self.assertEqual(len(captured), 1)
        captured[0].close()

    async def test_diagram_schedules_exactly_one_diagram_kind_job(self) -> None:
        result = {
            **accepted_result(),
            "visualJobId": None,
            "_imageRequest": {
                "imagePrompt": "Mass A attracts mass B.",
                "visualAlt": "Two masses attract each other",
            },
        }
        GenerateResponse.model_validate(
            result,
            context={"allow_internal_image_request": True},
        )
        run_job = Mock(return_value=None)
        with (
            patch.object(backend_main, "run_visual_job", new=run_job),
            patch.object(backend_main, "track_visual_task") as track,
        ):
            await backend_main.schedule_visual_generation(result)

        job_id = result["visualJobId"]
        run_job.assert_called_once_with(
            job_id,
            "scene-1",
            "Mass A attracts mass B.",
            "Two masses attract each other",
            "diagram",
        )
        track.assert_called_once_with(None)
        self.assertEqual(len(backend_main.visual_jobs), 1)

    async def test_visual_image_failure_keeps_structured_content_available(self) -> None:
        with patch.object(
            backend_main.gemini_pipeline,
            "generate_visual",
            new=AsyncMock(return_value=None),
        ) as generate_visual:
            await backend_main.run_visual_job("job", "scene", "prompt", "alt")
        generate_visual.assert_awaited_once_with(
            "image", "prompt", "alt", "visual"
        )
        job = backend_main.visual_jobs["job"]
        self.assertEqual(job["status"], "failed")
        self.assertIsNone(job["generatedAsset"])
        self.assertNotIn("prompt", str(job["warning"]))

    async def test_diagram_job_passes_strict_kind_to_pipeline(self) -> None:
        with patch.object(
            backend_main.gemini_pipeline,
            "generate_visual",
            new=AsyncMock(return_value=None),
        ) as generate_visual:
            await backend_main.run_visual_job(
                "diagram-job", "scene", "prompt", "alt", "diagram"
            )
        generate_visual.assert_awaited_once_with(
            "image", "prompt", "alt", "diagram"
        )
        self.assertEqual(
            backend_main.visual_jobs["diagram-job"]["warning"],
            "The diagram could not be generated.",
        )

    def test_visual_state_sweep_expires_terminal_jobs(self) -> None:
        backend_main.visual_jobs.update({
            "stale": {"status": "complete", "updatedAt": 1.0},
            "pending": {"status": "pending", "updatedAt": 1.0},
        })
        with backend_main.visual_jobs_lock:
            backend_main.sweep_visual_state_locked(backend_main.VISUAL_JOB_TTL_SECONDS + 2.0)
        self.assertNotIn("stale", backend_main.visual_jobs)
        self.assertEqual(backend_main.visual_jobs["pending"]["status"], "failed")


class StreamingGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_orders_atomic_result_then_done(self) -> None:
        result = accepted_result()

        async def generate_stream(_, mode, context):
            self.assertEqual(mode, "live")
            self.assertEqual(context["turnSequence"], 3)
            yield {"type": "result", "result": result}

        with (
            patch.object(backend_main.gemini_pipeline, "generate_stream", new=generate_stream),
            patch.object(backend_main, "schedule_visual_generation", new=AsyncMock()) as schedule,
        ):
            events = [
                json.loads(line)
                async for line in backend_main.stream_generation_events(
                    "Explain ATP.", "live", {"turnSequence": 3}
                )
            ]
        self.assertEqual([event["type"] for event in events], ["result", "done"])
        schedule.assert_awaited_once_with(result)

    async def test_stream_sanitizes_provider_error(self) -> None:
        async def generate_stream(_, __, ___):
            raise GeminiProviderError("secret provider diagnostic")
            yield

        with patch.object(backend_main.gemini_pipeline, "generate_stream", new=generate_stream):
            events = [
                json.loads(line)
                async for line in backend_main.stream_generation_events("Explain ATP.")
            ]
        self.assertEqual(events[-1]["type"], "error")
        self.assertNotIn("secret provider diagnostic", json.dumps(events))


if __name__ == "__main__":
    unittest.main()
