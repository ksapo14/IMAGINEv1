"""Offline FunctionGemma subprocess worker. It never executes model-selected tools."""

import json
import os
import sys
from typing import Any

from .function_gemma_protocol import PROTOCOL_VERSION, ProtocolError, decode_message, encode_message, parse_function_call

MODEL_ID = "google/functiongemma-270m-it"
MAX_NEW_TOKENS = 96


def send(message: dict[str, Any]) -> None:
    """Write one protocol response; stdout is reserved exclusively for JSONL."""
    sys.stdout.buffer.write(encode_message(message))
    sys.stdout.buffer.flush()


def load_model() -> tuple[Any, Any]:
    """Load the cached model once, with network access disabled by the parent."""
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as error:
        raise RuntimeError("dependency_missing") from error
    try:
        # The cached FunctionGemma snapshot is tokenizer-complete but does not
        # include optional processor metadata, so use the model's chat tokenizer.
        processor = AutoTokenizer.from_pretrained(MODEL_ID, local_files_only=True)
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype="auto", device_map="auto", local_files_only=True)
        model.eval()
    except OSError as error:
        raise RuntimeError("cache_missing") from error
    except Exception as error:
        raise RuntimeError("load_failure") from error
    return processor, model


def tools(slide_ids: list[str]) -> list[dict[str, Any]]:
    """Describe the only two proposals the model can make; no executable callbacks exist."""
    return [
        {"type": "function", "function": {"name": "goto_slide", "description": "Navigate to one available slide.", "parameters": {"type": "object", "properties": {"slide_id": {"type": "string", "enum": slide_ids}}, "required": ["slide_id"], "additionalProperties": False}}},
        {"type": "function", "function": {"name": "no_action", "description": "Keep the current slide.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    ]


def decide(processor: Any, model: Any, request: dict[str, Any]) -> dict[str, str]:
    """Generate one deterministic function call and parse it before returning it."""
    try:
        import torch
        from transformers import StoppingCriteria, StoppingCriteriaList

        request_id = request["id"]
        if request.get("version") != PROTOCOL_VERSION or request.get("kind") != "decision" or not isinstance(request_id, str):
            raise ProtocolError("invalid_request")
        utterance = request["utterance"]
        current_slide = request["current_slide"]
        available_slides = request["available_slides"]
        if not isinstance(utterance, str) or not isinstance(current_slide, dict) or not isinstance(available_slides, list):
            raise ProtocolError("invalid_request")
        slide_ids = [slide.get("id") for slide in available_slides if isinstance(slide, dict)]
        if len(slide_ids) != len(available_slides) or not all(isinstance(slide_id, str) for slide_id in slide_ids):
            raise ProtocolError("invalid_request")
        messages = [
            {"role": "developer", "content": "Choose exactly one function. Navigate only when the completed utterance clearly requests a listed slide; otherwise choose no_action."},
            {"role": "user", "content": json.dumps({"latest_utterance": utterance, "current_slide": current_slide, "available_slides": available_slides}, separators=(",", ":"))},
        ]
        inputs = processor.apply_chat_template(messages, tools=tools(slide_ids), add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to(model.device)
        end_token = processor.convert_tokens_to_ids("<end_function_call>")

        class StopAtEndFunctionCall(StoppingCriteria):
            """End deterministic generation immediately after the function-call marker."""

            def __call__(self, input_ids: Any, _: Any, **__: Any) -> bool:
                return isinstance(end_token, int) and input_ids[0, -1].item() == end_token

        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS, do_sample=False, stopping_criteria=StoppingCriteriaList([StopAtEndFunctionCall()]))
        generated = output[0][inputs["input_ids"].shape[-1]:]
        return parse_function_call(processor.decode(generated, skip_special_tokens=False), set(slide_ids))
    except ProtocolError:
        raise
    except Exception as error:
        raise RuntimeError("inference_failure") from error


def main() -> int:
    """Load once, then process serialized requests until the parent closes stdin."""
    try:
        processor, model = load_model()
    except RuntimeError as error:
        send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": False, "category": str(error)})
        return 1
    send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": True})
    for line in sys.stdin.buffer:
        request: dict[str, Any] = {}
        try:
            request = decode_message(line)
            request_id = request.get("id") if isinstance(request.get("id"), str) else ""
            decision = decide(processor, model, request)
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request_id, "ok": True, "decision": decision})
        except ProtocolError:
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request.get("id", ""), "ok": False, "category": "protocol_error"})
        except RuntimeError as error:
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request.get("id", ""), "ok": False, "category": str(error)})
    return 0


if __name__ == "__main__":
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    raise SystemExit(main())
