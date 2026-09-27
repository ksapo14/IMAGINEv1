"""Worker boundary tests that do not require a model download or server."""

import io
import os
import sys
import types
import unittest
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import Mock, patch

from backend.services.function_gemma_protocol import MAX_IPC_LINE_BYTES, PROTOCOL_VERSION, ProtocolError, decode_message, encode_message, parse_function_call
from backend.evaluate import MODEL_ID, evaluate_instruction, load_model, main, tools


class FunctionGemmaProtocolTests(unittest.TestCase):
    def test_parser_accepts_only_one_complete_deck_scoped_call(self) -> None:
        functions = {"show_open": "open"}
        self.assertEqual(parse_function_call("<start_function_call>call:no_action{}<end_function_call>", functions), {"action": "no_action"})
        self.assertEqual(parse_function_call("<start_function_call>call:show_open{}<end_function_call>", functions), {"action": "goto_slide", "slide_id": "open"})
        for output in [
            "prefix<start_function_call>call:no_action{}<end_function_call>",
            "<start_function_call>call:show_missing{}<end_function_call>",
            "<start_function_call>call:goto_slide{slide_id:<escape>open<escape>}<end_function_call>",
            "<start_function_call>call:show_open{slide_id:<escape>open<escape>}<end_function_call>",
            "<start_function_call>call:no_action{}<end_function_call><start_function_call>call:no_action{}<end_function_call>",
        ]:
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                parse_function_call(output, functions)

    def test_each_candidate_has_its_own_described_empty_schema(self) -> None:
        offered = tools([
            {"id": "financials", "title": "Financials", "description": "Use for forecasts and funding allocation."},
            {"id": "gtm", "title": "Go to market", "description": "Use for private school sales and teacher referrals."},
        ])
        self.assertEqual([tool["function"]["name"] for tool in offered], ["show_financials", "show_go_to_market", "no_action"])
        self.assertIn("forecasts and funding", offered[0]["function"]["description"])
        self.assertIn("teacher referrals", offered[1]["function"]["description"])
        for tool in offered:
            self.assertEqual(tool["function"]["parameters"], {"type": "object", "properties": {}, "additionalProperties": False})
        duplicate_titles = tools([
            {"id": "first", "title": "Plan", "description": "First plan."},
            {"id": "second", "title": "Plan", "description": "Second plan."},
        ])
        self.assertEqual([tool["function"]["name"] for tool in duplicate_titles], ["show_plan", "show_plan_2", "no_action"])

    def test_jsonl_is_versioned_bounded_and_one_object(self) -> None:
        line = encode_message({"version": PROTOCOL_VERSION, "kind": "startup", "ok": True})
        self.assertEqual(decode_message(line)["kind"], "startup")
        for bad_line in [b"{}", b"[]\n", b"{bad}\n", b"x" * (MAX_IPC_LINE_BYTES + 1)]:
            with self.subTest(line=bad_line[:8]), self.assertRaises(ProtocolError):
                decode_message(bad_line)

    def test_invalid_model_folder_fails_before_loading_dependencies(self) -> None:
        with patch.object(Path, "is_dir", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "invalid_model_folder"):
                load_model("missing-model")
        with patch.object(Path, "is_dir", return_value=True), patch.object(Path, "is_file", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "invalid_model_folder"):
                load_model("incomplete-model")

    def test_selected_folder_loads_offline_and_forces_cpu(self) -> None:
        with patch.object(Path, "is_dir", return_value=True), patch.object(Path, "is_file", return_value=True):
            folder = "selected-model"
            processor = Mock()
            model = Mock()
            fake_torch = types.SimpleNamespace(float32="float32")
            fake_transformers = types.SimpleNamespace(
                AutoProcessor=types.SimpleNamespace(from_pretrained=Mock(return_value=processor)),
                AutoModelForCausalLM=types.SimpleNamespace(from_pretrained=Mock(return_value=model)),
            )
            with patch.dict(sys.modules, {"torch": fake_torch, "transformers": fake_transformers}), patch.dict(os.environ, {"HF_HUB_OFFLINE": "0", "TRANSFORMERS_OFFLINE": "0"}):
                loaded_processor, loaded_model = load_model(folder)
                self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
                self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")
            self.assertIs(loaded_processor, processor)
            self.assertIs(loaded_model, model)
            fake_transformers.AutoProcessor.from_pretrained.assert_called_once_with(folder, local_files_only=True, trust_remote_code=False)
            fake_transformers.AutoModelForCausalLM.from_pretrained.assert_called_once_with(folder, local_files_only=True, trust_remote_code=False, dtype="float32")
            model.to.assert_called_once_with("cpu")
            model.eval.assert_called_once_with()

    def test_default_model_loads_from_cache_without_a_folder(self) -> None:
        processor = Mock()
        model = Mock()
        fake_transformers = types.SimpleNamespace(
            AutoProcessor=types.SimpleNamespace(from_pretrained=Mock(return_value=processor)),
            AutoModelForCausalLM=types.SimpleNamespace(from_pretrained=Mock(return_value=model)),
        )
        with patch.dict(sys.modules, {"torch": types.SimpleNamespace(float32="float32"), "transformers": fake_transformers}):
            self.assertEqual(load_model(), (processor, model))
        fake_transformers.AutoProcessor.from_pretrained.assert_called_once_with(MODEL_ID, local_files_only=True, trust_remote_code=False)
        fake_transformers.AutoModelForCausalLM.from_pretrained.assert_called_once_with(MODEL_ID, local_files_only=True, trust_remote_code=False, dtype="float32")
        model.to.assert_called_once_with("cpu")

    def test_missing_torch_reports_dependency_error(self) -> None:
        with patch.object(Path, "is_dir", return_value=True), patch.object(Path, "is_file", return_value=True), patch.dict(sys.modules, {"torch": None}):
            with self.assertRaisesRegex(RuntimeError, "dependency_missing"):
                load_model("selected-model")

    def test_invalid_request_is_rejected_before_model_inference(self) -> None:
        request = {"version": PROTOCOL_VERSION, "kind": "decision", "id": "r1", "utterance": "Go to the opening", "current_slide": {"id": "open"}, "available_slides": [{"id": "open"}, {"id": "open"}]}
        with self.assertRaises(ProtocolError):
            evaluate_instruction(Mock(), Mock(), request)

    def test_evaluation_passes_semantic_deck_and_accepts_only_a_valid_call(self) -> None:
        class Inputs(dict):
            def to(self, device: str) -> "Inputs":
                self.device = device
                return self

        request = {"version": PROTOCOL_VERSION, "kind": "decision", "id": "one", "utterance": "Discuss the financial projection", "current_slide": {"id": "open", "title": "Opening", "description": "Introduction"}, "available_slides": [{"id": "open", "title": "Opening", "description": "Introduction"}, {"id": "financials", "title": "Financials", "description": "Three-year projections"}]}
        processor = Mock()
        processor.apply_chat_template.return_value = Inputs(input_ids=[[1, 2]])
        processor.tokenizer.convert_tokens_to_ids.return_value = 99
        processor.decode.return_value = "<start_function_call>call:show_financials{}<end_function_call>"
        model = Mock()
        model.generate.return_value = [[1, 2, 3]]
        fake_transformers = types.SimpleNamespace(StoppingCriteria=type("StoppingCriteria", (), {}), StoppingCriteriaList=list)
        with patch.dict(sys.modules, {"torch": types.SimpleNamespace(inference_mode=nullcontext), "transformers": fake_transformers}):
            self.assertEqual(evaluate_instruction(processor, model, request), {"action": "goto_slide", "slide_id": "financials"})
        messages = processor.apply_chat_template.call_args.args[0]
        self.assertIn("slide director", messages[0]["content"])
        self.assertIn('"latest_utterance":"Discuss the financial projection"', messages[1]["content"])
        offered = processor.apply_chat_template.call_args.kwargs["tools"]
        self.assertEqual({tool["function"]["name"] for tool in offered}, {"show_financials", "no_action"})
        self.assertIn("Three-year projections", offered[0]["function"]["description"])
        self.assertEqual(offered[0]["function"]["parameters"], {"type": "object", "properties": {}, "additionalProperties": False})
        self.assertFalse(model.generate.call_args.kwargs["do_sample"])

    def test_worker_reuses_loaded_model_for_bounded_jsonl_requests(self) -> None:
        request = {"version": PROTOCOL_VERSION, "kind": "decision", "id": "one", "utterance": "Stay", "current_slide": {"id": "open"}, "available_slides": [{"id": "open"}]}
        input_stream = io.BytesIO(encode_message(request) + encode_message({**request, "id": "two"}))
        output_stream = io.BytesIO()
        with patch("backend.evaluate.load_model", return_value=("processor", "model")) as loader, patch("backend.evaluate.evaluate_instruction", return_value={"action": "no_action"}) as inference, patch("backend.evaluate.sys.stdin", types.SimpleNamespace(buffer=input_stream)), patch("backend.evaluate.sys.stdout", types.SimpleNamespace(buffer=output_stream)):
            self.assertEqual(main("selected-model"), 0)
        loader.assert_called_once_with("selected-model")
        self.assertEqual(inference.call_count, 2)
        responses = [decode_message(line + b"\n") for line in output_stream.getvalue().splitlines()]
        self.assertEqual([response["kind"] for response in responses], ["startup", "result", "result"])
        self.assertEqual([response.get("id") for response in responses[1:]], ["one", "two"])

    def test_worker_starts_without_a_model_folder_argument(self) -> None:
        output_stream = io.BytesIO()
        with patch("backend.evaluate.load_model", return_value=("processor", "model")) as loader, patch("backend.evaluate.sys.argv", ["evaluate.py"]), patch("backend.evaluate.sys.stdin", types.SimpleNamespace(buffer=io.BytesIO())), patch("backend.evaluate.sys.stdout", types.SimpleNamespace(buffer=output_stream)):
            self.assertEqual(main(), 0)
        loader.assert_called_once_with(None)
        self.assertTrue(decode_message(output_stream.getvalue())["ok"])


if __name__ == "__main__":
    unittest.main()
