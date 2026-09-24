import os
import sys
import unittest
from unittest.mock import patch

from backend.services.function_gemma_local import LocalFunctionGemmaRuntime, LocalRuntimeError
from backend.services import function_gemma_local as local_runtime_module
from backend.services.function_gemma_protocol import MAX_IPC_LINE_BYTES, PROTOCOL_VERSION, ProtocolError, decode_message, encode_message, parse_function_call
from backend.services.function_gemma import FunctionGemmaService


SLIDE = {"id": "open", "title": "Open", "description": "Opening."}


class FunctionGemmaProtocolTests(unittest.TestCase):
    def test_parser_accepts_only_one_complete_deck_scoped_call(self) -> None:
        self.assertEqual(parse_function_call("<start_function_call>call:no_action{}<end_function_call>", {"open"}), {"action": "no_action"})
        self.assertEqual(parse_function_call("<start_function_call>call:goto_slide{slide_id:<escape>open<escape>}<end_function_call>", {"open"}), {"action": "goto_slide", "slide_id": "open"})
        for output in ["prefix<start_function_call>call:no_action{}<end_function_call>", "<start_function_call>call:goto_slide{slide_id:<escape>missing<escape>}<end_function_call>", "<start_function_call>call:no_action{}<end_function_call><start_function_call>call:no_action{}<end_function_call>"]:
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                parse_function_call(output, {"open"})

    def test_jsonl_is_versioned_bounded_and_one_object(self) -> None:
        line = encode_message({"version": PROTOCOL_VERSION, "kind": "startup", "ok": True})
        self.assertEqual(decode_message(line)["kind"], "startup")
        for line in [b"{}", b"[]\n", b"{bad}\n", b"x" * (MAX_IPC_LINE_BYTES + 1)]:
            with self.subTest(line=line[:8]), self.assertRaises(ProtocolError):
                decode_message(line)

    def test_fake_worker_reuses_then_closes_cleanly(self) -> None:
        runtime = LocalFunctionGemmaRuntime(sys.executable, startup_timeout_seconds=3, inference_timeout_seconds=3, worker_module="tests.fixtures.fake_function_gemma_worker")
        try:
            self.assertEqual(runtime.decide("hold", SLIDE, [SLIDE]), {"action": "no_action"})
            process = runtime._process
            self.assertIsNotNone(process)
            self.assertEqual(runtime.decide("hold", SLIDE, [SLIDE]), {"action": "no_action"})
        finally:
            runtime.close()
        self.assertIsNotNone(process)
        self.assertIsNotNone(process.poll())

    def test_local_runtime_selection_never_requires_an_http_endpoint(self) -> None:
        service = FunctionGemmaService(runtime="local", local_python=sys.executable)
        try:
            self.assertEqual(service.runtime, "local")
            self.assertFalse(service.status()["auth_configured"])
            self.assertEqual(service.status()["mode"], "local")
        finally:
            service.close()

    def test_fake_worker_timeout_and_bad_protocol_are_recoverable(self) -> None:
        for mode, category in [("hang", "timeout"), ("bad_id", "protocol_error"), ("unknown_slide", "protocol_error"), ("crash", "worker_crashed")]:
            with self.subTest(mode=mode), patch.dict(os.environ, {"FUNCTION_GEMMA_FAKE_MODE": mode}, clear=False):
                runtime = LocalFunctionGemmaRuntime(sys.executable, startup_timeout_seconds=3, inference_timeout_seconds=.1, worker_module="tests.fixtures.fake_function_gemma_worker")
                try:
                    with self.assertRaises(LocalRuntimeError) as raised:
                        runtime.decide("hold", SLIDE, [SLIDE])
                    self.assertEqual(raised.exception.category, category)
                    self.assertIsNone(runtime._process)
                finally:
                    runtime.close()

    def test_flooded_worker_cannot_grow_the_response_queue_and_restarts(self) -> None:
        created_queues = []
        original_queue = local_runtime_module.queue.Queue

        def make_queue(*args: object, **kwargs: object):
            instance = original_queue(*args, **kwargs)
            created_queues.append(instance)
            return instance

        runtime = LocalFunctionGemmaRuntime(sys.executable, startup_timeout_seconds=3, inference_timeout_seconds=3, worker_module="tests.fixtures.fake_function_gemma_worker")
        try:
            with patch.dict(os.environ, {"FUNCTION_GEMMA_FAKE_MODE": "flood"}, clear=False), patch("backend.services.function_gemma_local.queue.Queue", side_effect=make_queue):
                with self.assertRaises(LocalRuntimeError) as raised:
                    runtime.decide("hold", SLIDE, [SLIDE])
            self.assertEqual(raised.exception.category, "protocol_error")
            self.assertTrue(created_queues)
            self.assertEqual(created_queues[0].maxsize, 1)
            self.assertLessEqual(created_queues[0].qsize(), 1)
            self.assertIsNone(runtime._process)
            self.assertEqual(runtime.decide("hold", SLIDE, [SLIDE]), {"action": "no_action"})
        finally:
            runtime.close()


if __name__ == "__main__":
    unittest.main()
