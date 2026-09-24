"""Opt-in offline smoke test for the cached direct-Transformers FunctionGemma worker."""

import sys
import time
from pathlib import Path

# Direct execution adds scripts/ to sys.path; include the repository for backend imports.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.services.function_gemma_local import LocalFunctionGemmaRuntime


def main() -> int:
    """Prove offline load, strict decision parsing, worker reuse, and shutdown cleanup."""
    slide = {"id": "open", "title": "Opening", "description": "Opening slide."}
    runtime = LocalFunctionGemmaRuntime(sys.executable, startup_timeout_seconds=90, inference_timeout_seconds=12)
    process = None
    try:
        started = time.monotonic()
        first = runtime.decide("Stay on this slide.", slide, [slide])
        cold_seconds = time.monotonic() - started
        process = runtime._process
        started = time.monotonic()
        second = runtime.decide("Keep the current slide.", slide, [slide])
        warm_seconds = time.monotonic() - started
        if process is None or runtime._process is not process:
            raise RuntimeError("worker was not reused")
        print(f"offline FunctionGemma smoke passed: first={cold_seconds:.1f}s warm={warm_seconds:.1f}s decisions={first['action']},{second['action']}")
    finally:
        runtime.close()
    if process is None or process.poll() is None:
        raise RuntimeError("worker cleanup failed")
    print("offline FunctionGemma worker cleanup passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
