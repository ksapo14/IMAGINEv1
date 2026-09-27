"""Evaluate pitch utterances with local, CPU-only FunctionGemma."""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from .services.function_gemma_protocol import MAX_IPC_LINE_BYTES, PROTOCOL_VERSION, ProtocolError, decode_message, encode_message, parse_function_call

MAX_NEW_TOKENS = 96
MODEL_ID = "google/functiongemma-270m-it"
PITCH_DIRECTOR_INSTRUCTION = "You are the slide director for a live Imagineer pitch. Your only job is to select the slide that best matches the speaker's latest utterance. Choose exactly one function call and no prose. Each listed show_* function represents one different available slide; its description gives the slide topic and cues for when to show it. Use the listed function name exactly. Match the meaning of the utterance to those descriptions: keywords are clues, not mandatory exact matches. Call that slide's function when the speaker explicitly requests it or clearly begins discussing its subject. Prefer the most specific matching slide if topics overlap. The current slide is already visible and has no show function. Call no_action if the speaker asks to stay, continues the current subject, gives only a vague transition such as 'next', or does not clearly match another slide. Never invent a function or arguments."


def send(message: dict[str, Any]) -> None:
    """Reserve stdout for bounded JSONL protocol messages."""
    sys.stdout.buffer.write(encode_message(message))
    sys.stdout.buffer.flush()


def load_model(model_directory: str | None = None) -> tuple[Any, Any]:
    """Load FunctionGemma from the local Hugging Face cache or an explicit snapshot."""
    model_source = MODEL_ID
    if model_directory is not None:
        model_path = Path(model_directory).expanduser()
        if not model_path.is_dir() or not (model_path / "config.json").is_file():
            raise RuntimeError("invalid_model_folder")
        model_source = str(model_path)

    # Keep evaluation offline even when the machine has network access or
    # Hugging Face credentials.
    os.environ.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "DO_NOT_TRACK": "1",
    })
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor
    except ImportError as error:
        raise RuntimeError("dependency_missing") from error

    try:
        processor = AutoProcessor.from_pretrained(model_source, local_files_only=True, trust_remote_code=False)
        model = AutoModelForCausalLM.from_pretrained(
            model_source, local_files_only=True, trust_remote_code=False, dtype=torch.float32
        )
        model.to("cpu")
        model.eval()
    except Exception as error:
        raise RuntimeError("load_failure") from error
    return processor, model


def tools(candidate_slides: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Offer one zero-argument function per target slide; no callback is executed."""
    empty_parameters = {"type": "object", "properties": {}, "additionalProperties": False}
    available = []
    used_names: set[str] = set()
    for slide in candidate_slides:
        base = re.sub(r"[^a-z0-9]+", "_", slide["title"].lower()).strip("_")
        if not base:
            base = re.sub(r"[^a-z0-9]+", "_", slide["id"]).strip("_")
        name = f"show_{base[:50]}"
        suffix = 2
        while name in used_names:
            name = f"show_{base[:50]}_{suffix}"
            suffix += 1
        used_names.add(name)
        available.append({
            "type": "function",
            "function": {
                "name": name,
                "description": f"Show the '{slide['title']}' slide. {slide['description']}",
                "parameters": empty_parameters,
            },
        })
    available.append({
        "type": "function",
        "function": {
            "name": "no_action",
            "description": "Keep the current slide visible. Choose when the speaker asks to stay, continues discussing the current slide, gives no clear cue for a different available slide, or the utterance is ambiguous.",
            "parameters": empty_parameters,
        },
    })
    return available


def evaluate_instruction(processor: Any, model: Any, request: dict[str, Any]) -> dict[str, str]:
    """Generate one function-call proposal and validate its semantic slide ID."""
    # The input contains only compact semantic slide metadata; React markup and
    # raw microphone audio never enter the model worker.
    request_id = request.get("id")
    utterance = request.get("utterance")
    current_slide = request.get("current_slide")
    available_slides = request.get("available_slides")
    if request.get("version") != PROTOCOL_VERSION or request.get("kind") != "decision" or not isinstance(request_id, str) or not request_id:
        raise ProtocolError("invalid_request")
    if not isinstance(utterance, str) or not isinstance(current_slide, dict) or not isinstance(available_slides, list):
        raise ProtocolError("invalid_request")
    slide_ids = [slide.get("id") for slide in available_slides if isinstance(slide, dict)]
    if len(slide_ids) != len(available_slides) or not all(isinstance(slide_id, str) for slide_id in slide_ids) or len(set(slide_ids)) != len(slide_ids) or current_slide.get("id") not in slide_ids:
        raise ProtocolError("invalid_request")

    try:
        import torch
        from transformers import StoppingCriteria, StoppingCriteriaList

        # Each available target has its own function and topic cues. Greedy CPU
        # generation stops at the closing function-call token.
        candidate_slides = [slide for slide in available_slides if slide["id"] != current_slide["id"]]
        offered_tools = tools(candidate_slides)
        function_ids = {tool["function"]["name"]: slide["id"] for tool, slide in zip(offered_tools, candidate_slides)}
        prompt_input = {
            "latest_utterance": utterance,
            "current_slide": {"title": current_slide.get("title"), "description": current_slide.get("description")},
        }
        messages = [
            {"role": "developer", "content": PITCH_DIRECTOR_INSTRUCTION},
            {"role": "user", "content": json.dumps(prompt_input, separators=(",", ":"))},
        ]
        inputs = processor.apply_chat_template(messages, tools=offered_tools, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to("cpu")
        token_source = getattr(processor, "tokenizer", processor)
        end_token = token_source.convert_tokens_to_ids("<end_function_call>")

        class StopAtEndFunctionCall(StoppingCriteria):
            def __call__(self, input_ids: Any, _: Any, **__: Any) -> bool:
                return isinstance(end_token, int) and input_ids[0, -1].item() == end_token

        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS, do_sample=False, stopping_criteria=StoppingCriteriaList([StopAtEndFunctionCall()]))
        generated = output[0][len(inputs["input_ids"][0]):]
        # Parsing is exact and deck-scoped; generated text is never executed.
        return parse_function_call(processor.decode(generated, skip_special_tokens=False), function_ids)
    except ProtocolError:
        raise
    except Exception as error:
        raise RuntimeError("inference_failure") from error


def main(model_directory: str | None = None) -> int:
    """Load once and process bounded, serialized requests until stdin closes."""
    if model_directory is None and len(sys.argv) > 1:
        if len(sys.argv) != 2:
            send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": False, "category": "invalid_model_folder"})
            return 1
        model_directory = sys.argv[1]
    try:
        processor, model = load_model(model_directory)
    except RuntimeError as error:
        send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": False, "category": str(error)})
        return 1
    send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": True})

    # Stdout is protocol-only. Each bounded request receives exactly one result
    # frame, while malformed oversized input terminates the session.
    while line := sys.stdin.buffer.readline(MAX_IPC_LINE_BYTES + 1):
        request_id = ""
        try:
            request = decode_message(line)
            if isinstance(request.get("id"), str):
                request_id = request["id"]
            decision = evaluate_instruction(processor, model, request)
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request_id, "ok": True, "decision": decision})
        except ProtocolError:
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request_id, "ok": False, "category": "protocol_error"})
            if len(line) > MAX_IPC_LINE_BYTES:
                return 1
        except RuntimeError as error:
            send({"version": PROTOCOL_VERSION, "kind": "result", "id": request_id, "ok": False, "category": str(error)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
