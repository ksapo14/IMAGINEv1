"""Opt-in offline semantic smoke test for a local FunctionGemma snapshot."""

import argparse
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.services.function_gemma_protocol import PROTOCOL_VERSION, decode_message, encode_message


def read_frame(process: subprocess.Popen[bytes], timeout_seconds: int) -> dict:
    """Bound a blocking pipe read, including a silent or hung child."""
    assert process.stdout is not None
    frames: queue.Queue[bytes] = queue.Queue(maxsize=1)
    threading.Thread(target=lambda: frames.put(process.stdout.readline()), daemon=True).start()
    try:
        return decode_message(frames.get(timeout=timeout_seconds))
    except queue.Empty as error:
        raise RuntimeError("evaluator transport timeout") from error


def main() -> int:
    """Launch one offline worker, verify a handshake and two serialized replies."""
    parser = argparse.ArgumentParser(description="Test a local FunctionGemma snapshot with the desktop evaluator protocol.")
    parser.add_argument("model_directory", nargs="?", help="Optional directory containing a FunctionGemma snapshot; defaults to the local Hugging Face cache")
    args = parser.parse_args()
    command = [sys.executable, "-u", "-m", "backend.evaluate"]
    if args.model_directory:
        command.append(args.model_directory)
    environment = os.environ.copy()
    environment.pop("DEEPGRAM_API_KEY", None)
    environment.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
    # Use the same pipe contract as Rust. The key is removed even when the
    # caller runs this from a shell configured for Deepgram transcription.
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment)
    try:
        assert process.stdin is not None and process.stdout is not None
        started = time.monotonic()
        startup = read_frame(process, 300)
        if startup != {"version": PROTOCOL_VERSION, "kind": "startup", "ok": True}:
            raise RuntimeError(f"evaluator startup failed: {startup.get('category', 'protocol_error')}")
        cold_seconds = time.monotonic() - started
        slides = [
            {"id": "open", "title": "Opening", "description": "Introduction to Imagineer and its founders."},
            {"id": "financials", "title": "Financials", "description": "Funding allocation and three-year financial projections."},
        ]
        scenarios = [
            ("Show the slide about our three-year financial projections and funding allocation.", {"action": "goto_slide", "slide_id": "financials"}),
            ("Stay on the current slide. Do not move to another slide.", {"action": "no_action"}),
        ]
        semantic_failures = []
        # Two requests prove the same loaded process can navigate or stay put.
        for index, (utterance, expected) in enumerate(scenarios):
            request_id = f"smoke-{index}"
            request = {"version": PROTOCOL_VERSION, "kind": "decision", "id": request_id, "utterance": utterance, "current_slide": slides[0], "available_slides": slides}
            process.stdin.write(encode_message(request))
            process.stdin.flush()
            result = read_frame(process, 120)
            if result.get("id") != request_id or result.get("ok") is not True:
                raise RuntimeError(f"evaluator transport failure: {result.get('category', 'protocol_error')}")
            if result.get("decision") != expected:
                semantic_failures.append(f"{request_id}: expected {expected}, got {result.get('decision')}")
        if semantic_failures:
            print("FunctionGemma semantic mismatch: " + "; ".join(semantic_failures), file=sys.stderr)
            return 1
        print(f"offline FunctionGemma smoke passed: startup={cold_seconds:.1f}s, reused one evaluator")
    finally:
        if process.stdin is not None:
            process.stdin.close()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
    if process.returncode != 0:
        raise RuntimeError("evaluator did not exit cleanly")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
