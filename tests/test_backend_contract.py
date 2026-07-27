import unittest
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

import backend.main as backend_main
from backend.main import GenerateRequest, SlidingWindowRateLimiter


class BackendContractTests(unittest.TestCase):
    def test_generation_input_has_hard_character_limit(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="x" * 4001)

    def test_rate_limiter_reopens_after_window(self) -> None:
        now = [100.0]
        limiter = SlidingWindowRateLimiter(
            limit=2,
            window_seconds=60,
            clock=lambda: now[0],
        )

        self.assertTrue(limiter.allow("client"))
        self.assertTrue(limiter.allow("client"))
        self.assertFalse(limiter.allow("client"))

        now[0] = 161.0
        self.assertTrue(limiter.allow("client"))

    def test_rate_limiter_prunes_inactive_client_keys(self) -> None:
        now = [100.0]
        limiter = SlidingWindowRateLimiter(
            limit=2,
            window_seconds=60,
            clock=lambda: now[0],
        )

        self.assertTrue(limiter.allow("inactive-client"))
        now[0] = 161.0
        self.assertTrue(limiter.allow("active-client"))

        self.assertNotIn("inactive-client", limiter.requests)

    def test_browser_origin_policy_rejects_unconfigured_sites(self) -> None:
        self.assertTrue(
            backend_main.is_allowed_browser_origin("http://localhost:3000")
        )
        self.assertTrue(backend_main.is_allowed_browser_origin(None))
        self.assertFalse(
            backend_main.is_allowed_browser_origin("https://malicious.example")
        )

    def test_transcription_sessions_are_capped_per_client(self) -> None:
        client_key = "session-cap-test"
        backend_main.transcription_sessions.pop(client_key, None)
        try:
            self.assertTrue(backend_main.acquire_transcription_session(client_key))
            self.assertTrue(backend_main.acquire_transcription_session(client_key))
            self.assertFalse(backend_main.acquire_transcription_session(client_key))
        finally:
            backend_main.release_transcription_session(client_key)
            backend_main.release_transcription_session(client_key)

        self.assertNotIn(client_key, backend_main.transcription_sessions)


class VisualJobLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        with backend_main.visual_jobs_lock:
            backend_main.visual_jobs.clear()
            backend_main.visual_batches.clear()

    def tearDown(self) -> None:
        with backend_main.visual_jobs_lock:
            backend_main.visual_jobs.clear()
            backend_main.visual_batches.clear()

    async def test_partial_visual_failure_never_caches_in_either_order(self) -> None:
        success_visual = {"kind": "diagram", "diagram": {"type": "flowchart"}}

        for failure_first in (True, False):
            with self.subTest(failure_first=failure_first):
                self.setUp()
                first_job_id = "first-job"
                second_job_id = "second-job"
                batch_id = "batch"
                result: dict[str, object] = {
                    "warning": None,
                    "blocks": [
                        {"blockId": "first-block", "visualJobId": first_job_id},
                        {"blockId": "second-block", "visualJobId": second_job_id},
                    ],
                }
                with backend_main.visual_jobs_lock:
                    backend_main.visual_batches[batch_id] = {
                        "result": result,
                        "pendingJobIds": {first_job_id, second_job_id},
                        "failed": False,
                        "updatedAt": 1.0,
                    }

                side_effects = (
                    [RuntimeError("provider detail"), success_visual]
                    if failure_first
                    else [success_visual, RuntimeError("provider detail")]
                )
                with (
                    patch.object(
                        backend_main.gemini_pipeline,
                        "generate_visual",
                        new=AsyncMock(side_effect=side_effects),
                    ),
                    patch.object(
                        backend_main.gemini_pipeline,
                        "cache_result",
                    ) as cache_result,
                ):
                    await backend_main.run_visual_job(
                        first_job_id,
                        batch_id,
                        "first-block",
                        "prompt",
                        "diagram",
                        "first visual",
                        "first visual",
                    )
                    await backend_main.run_visual_job(
                        second_job_id,
                        batch_id,
                        "second-block",
                        "prompt",
                        "diagram",
                        "second visual",
                        "second visual",
                    )

                self.assertNotIn(batch_id, backend_main.visual_batches)
                cache_result.assert_not_called()
                blocks = result["blocks"]
                self.assertIsInstance(blocks, list)
                self.assertTrue(all(block["visualJobId"] is None for block in blocks))
                self.assertTrue(any(block.get("visualFailed") for block in blocks))
                failed_jobs = [
                    job
                    for job in backend_main.visual_jobs.values()
                    if job["status"] == "failed"
                ]
                self.assertEqual(len(failed_jobs), 1)
                self.assertNotIn("provider detail", str(failed_jobs[0]["warning"]))

    def test_visual_state_sweep_expires_batches_and_terminal_jobs(self) -> None:
        with backend_main.visual_jobs_lock:
            backend_main.visual_jobs.update(
                {
                    "stale-terminal": {
                        "status": "complete",
                        "updatedAt": 1.0,
                    },
                    "stale-pending": {
                        "status": "pending",
                        "updatedAt": 1.0,
                    },
                }
            )
            backend_main.visual_batches["stale-batch"] = {
                "pendingJobIds": {"stale-pending"},
                "updatedAt": 1.0,
            }
            backend_main.sweep_visual_state_locked(
                backend_main.VISUAL_JOB_TTL_SECONDS + 2.0
            )

        self.assertNotIn("stale-terminal", backend_main.visual_jobs)
        self.assertNotIn("stale-batch", backend_main.visual_batches)
        self.assertEqual(
            backend_main.visual_jobs["stale-pending"]["status"],
            "failed",
        )


if __name__ == "__main__":
    unittest.main()
