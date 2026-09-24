"""Tiny JSONL worker used to exercise parent lifecycle handling without a model."""

import os
import sys

from backend.services.function_gemma_protocol import PROTOCOL_VERSION, decode_message, encode_message


def send(value: dict[str, object]) -> None:
    sys.stdout.buffer.write(encode_message(value))
    sys.stdout.buffer.flush()


mode = os.getenv("FUNCTION_GEMMA_FAKE_MODE", "valid")
if mode == "crash_startup":
    raise SystemExit(1)
send({"version": PROTOCOL_VERSION, "kind": "startup", "ok": True})
if mode == "flood":
    for _ in range(100):
        send({"version": PROTOCOL_VERSION, "kind": "result", "id": "unsolicited", "ok": True, "decision": {"action": "no_action"}})
for line in sys.stdin.buffer:
    request = decode_message(line)
    if mode == "hang":
        continue
    if mode == "bad_id":
        send({"version": PROTOCOL_VERSION, "kind": "result", "id": "wrong", "ok": True, "decision": {"action": "no_action"}})
    elif mode == "unknown_slide":
        send({"version": PROTOCOL_VERSION, "kind": "result", "id": request["id"], "ok": True, "decision": {"action": "goto_slide", "slide_id": "missing"}})
    elif mode == "crash":
        raise SystemExit(1)
    else:
        send({"version": PROTOCOL_VERSION, "kind": "result", "id": request["id"], "ok": True, "decision": {"action": "no_action"}})
