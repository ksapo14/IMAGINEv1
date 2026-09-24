"""Lifecycle-managed offline FunctionGemma worker used by the FastAPI backend."""

import os
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .function_gemma_protocol import MAX_IPC_LINE_BYTES, PROTOCOL_VERSION, ProtocolError, decode_message, encode_message

DEFAULT_STARTUP_TIMEOUT_SECONDS = 90.0
DEFAULT_INFERENCE_TIMEOUT_SECONDS = 12.0


class LocalRuntimeError(RuntimeError):
    """A safe local-runtime category, deliberately without paths or worker output."""

    def __init__(self, category: str, retryable: bool) -> None:
        self.category = category
        self.retryable = retryable
        super().__init__(category)


class LocalFunctionGemmaRuntime:
    """Keep one offline worker alive and recover it after timeout, crash, or bad IPC."""

    def __init__(self, python_path: str, startup_timeout_seconds: float = DEFAULT_STARTUP_TIMEOUT_SECONDS, inference_timeout_seconds: float = DEFAULT_INFERENCE_TIMEOUT_SECONDS, worker_module: str = "backend.services.function_gemma_worker") -> None:
        if startup_timeout_seconds <= 0 or inference_timeout_seconds <= 0:
            raise ValueError("Local FunctionGemma timeouts must be positive.")
        self.python_path = python_path.strip()
        self.startup_timeout_seconds = startup_timeout_seconds
        self.inference_timeout_seconds = inference_timeout_seconds
        self.worker_module = worker_module
        self._lock = threading.Lock()
        self._process: subprocess.Popen[bytes] | None = None
        self._responses: queue.Queue[bytes | None] | None = None
        self._protocol_violation: threading.Event | None = None
        self._worker_eof: threading.Event | None = None
        self._status = "not_checked"
        self._closed = False

    @property
    def runtime_status(self) -> str:
        return self._status

    def decide(self, utterance: str, current_slide: dict[str, str], available_slides: list[dict[str, str]]) -> dict[str, str]:
        """Perform exactly one serialized request; only this method touches worker pipes."""
        with self._lock:
            if self._closed:
                raise LocalRuntimeError("runtime_closed", True)
            self._ensure_started_locked()
            request_id = uuid.uuid4().hex
            request = {"version": PROTOCOL_VERSION, "kind": "decision", "id": request_id, "utterance": utterance, "current_slide": current_slide, "available_slides": available_slides}
            try:
                self._write_locked(encode_message(request))
                response = self._read_locked(self.inference_timeout_seconds)
                decision = self._validate_result(response, request_id, {slide["id"] for slide in available_slides})
            except LocalRuntimeError:
                self._stop_locked()
                raise
            except (BrokenPipeError, OSError, ProtocolError):
                self._stop_locked()
                raise LocalRuntimeError("protocol_error", True) from None
            self._status = "ready"
            return decision

    def close(self) -> None:
        """Terminate the worker and its pipes so reload/shutdown cannot leave a process behind."""
        with self._lock:
            self._closed = True
            self._stop_locked()

    def _ensure_started_locked(self) -> None:
        if self._process is not None and self._process.poll() is None:
            return
        self._stop_locked()
        if not self.python_path or not Path(self.python_path).is_file():
            self._status = "python_unavailable"
            raise LocalRuntimeError("python_unavailable", False)
        environment = os.environ.copy()
        environment.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1"})
        try:
            self._process = subprocess.Popen([self.python_path, "-m", self.worker_module], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=str(Path(__file__).resolve().parents[2]), env=environment)
        except OSError:
            self._process = None
            self._status = "python_unavailable"
            raise LocalRuntimeError("python_unavailable", False) from None
        self._responses = queue.Queue(maxsize=1)
        self._protocol_violation = threading.Event()
        self._worker_eof = threading.Event()
        threading.Thread(target=self._reader, args=(self._process.stdout, self._responses, self._protocol_violation, self._worker_eof, self._process), daemon=True).start()
        self._status = "loading"
        try:
            startup = self._read_locked(self.startup_timeout_seconds)
            if startup.get("version") != PROTOCOL_VERSION or startup.get("kind") != "startup":
                raise LocalRuntimeError("protocol_error", True)
            if startup.get("ok") is not True:
                category = startup.get("category")
                if category not in {"dependency_missing", "cache_missing", "load_failure"}:
                    category = "load_failure"
                raise LocalRuntimeError(category, False)
        except LocalRuntimeError:
            self._stop_locked()
            raise
        self._status = "ready"

    @staticmethod
    def _reader(stream: Any, responses: queue.Queue[bytes | None], protocol_violation: threading.Event, worker_eof: threading.Event, process: subprocess.Popen[bytes]) -> None:
        """Read at most one expected line; unsolicited output terminates the worker."""
        try:
            while True:
                line = stream.readline(MAX_IPC_LINE_BYTES + 1)
                if not line:
                    break
                try:
                    responses.put_nowait(line)
                except queue.Full:
                    protocol_violation.set()
                    if process.poll() is None:
                        process.terminate()
                    break
        finally:
            worker_eof.set()

    def _write_locked(self, payload: bytes) -> None:
        if self._protocol_violation is not None and self._protocol_violation.is_set():
            raise LocalRuntimeError("protocol_error", True)
        if self._process is None or self._process.stdin is None or self._process.poll() is not None:
            raise LocalRuntimeError("worker_crashed", True)
        self._process.stdin.write(payload)
        self._process.stdin.flush()

    def _read_locked(self, timeout_seconds: float) -> dict[str, Any]:
        if self._responses is None:
            raise LocalRuntimeError("worker_crashed", True)
        if self._protocol_violation is not None and self._protocol_violation.is_set():
            raise LocalRuntimeError("protocol_error", True)
        try:
            line = self._responses.get(timeout=timeout_seconds)
        except queue.Empty:
            if self._protocol_violation is not None and self._protocol_violation.is_set():
                raise LocalRuntimeError("protocol_error", True) from None
            if self._worker_eof is not None and self._worker_eof.is_set():
                self._status = "worker_crashed"
                raise LocalRuntimeError("worker_crashed", True) from None
            self._status = "timeout"
            raise LocalRuntimeError("timeout", True) from None
        if self._protocol_violation is not None and self._protocol_violation.is_set():
            raise LocalRuntimeError("protocol_error", True)
        try:
            return decode_message(line)
        except ProtocolError:
            self._status = "protocol_error"
            raise LocalRuntimeError("protocol_error", True) from None

    @staticmethod
    def _validate_result(response: dict[str, Any], request_id: str, available_ids: set[str]) -> dict[str, str]:
        if response.get("version") != PROTOCOL_VERSION or response.get("kind") != "result" or response.get("id") != request_id:
            raise LocalRuntimeError("protocol_error", True)
        if response.get("ok") is False:
            category = response.get("category")
            if category not in {"inference_failure", "protocol_error"}:
                category = "protocol_error"
            raise LocalRuntimeError(category, True)
        decision = response.get("decision")
        if not isinstance(decision, dict) or set(decision) not in ({"action"}, {"action", "slide_id"}):
            raise LocalRuntimeError("protocol_error", True)
        if decision.get("action") == "no_action" and set(decision) == {"action"}:
            return {"action": "no_action"}
        if decision.get("action") == "goto_slide" and isinstance(decision.get("slide_id"), str) and decision["slide_id"] in available_ids and set(decision) == {"action", "slide_id"}:
            return {"action": "goto_slide", "slide_id": decision["slide_id"]}
        raise LocalRuntimeError("protocol_error", True)

    def _stop_locked(self) -> None:
        process, self._process = self._process, None
        self._responses = None
        self._protocol_violation = None
        self._worker_eof = None
        if process is None:
            return
        for pipe in (process.stdin, process.stdout):
            try:
                if pipe is not None:
                    pipe.close()
            except OSError:
                pass
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
