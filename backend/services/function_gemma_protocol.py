"""Strict, versioned JSONL messages and FunctionGemma call parsing."""

import json
import re
from typing import Any

PROTOCOL_VERSION = 1
MAX_IPC_LINE_BYTES = 64 * 1024
_ID = r"[a-z0-9][a-z0-9_-]{0,79}"
_NO_ACTION = re.compile(r"\A<start_function_call>call:no_action\{\}<end_function_call>\Z")
_GOTO_SLIDE = re.compile(
    rf"\A<start_function_call>call:goto_slide\{{slide_id:<escape>(?P<slide_id>{_ID})<escape>\}}<end_function_call>\Z"
)


class ProtocolError(ValueError):
    """A worker message or generated call did not meet the narrow contract."""


def encode_message(message: dict[str, Any]) -> bytes:
    """Serialize one bounded JSONL object for the private worker pipe."""
    payload = json.dumps(message, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    if len(payload) + 1 > MAX_IPC_LINE_BYTES:
        raise ProtocolError("message_too_large")
    return payload + b"\n"


def decode_message(line: bytes) -> dict[str, Any]:
    """Decode one complete bounded JSONL object without accepting extra framing."""
    if not line or len(line) > MAX_IPC_LINE_BYTES or not line.endswith(b"\n"):
        raise ProtocolError("invalid_frame")
    try:
        value = json.loads(line)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolError("invalid_json") from error
    if not isinstance(value, dict):
        raise ProtocolError("invalid_message")
    return value


def parse_function_call(output: str, available_ids: set[str]) -> dict[str, str]:
    """Accept exactly one deck-scoped FunctionGemma call and nothing else."""
    if _NO_ACTION.fullmatch(output):
        return {"action": "no_action"}
    match = _GOTO_SLIDE.fullmatch(output)
    if match and match["slide_id"] in available_ids:
        return {"action": "goto_slide", "slide_id": match["slide_id"]}
    raise ProtocolError("invalid_function_call")
