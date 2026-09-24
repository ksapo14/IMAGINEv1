"""Bounded, secret-safe client for a separately managed FunctionGemma server."""

import asyncio
import errno
import ipaddress
import json
import logging
import os
import socket
import ssl
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse
import urllib.error
import urllib.request

from .function_gemma_local import LocalFunctionGemmaRuntime, LocalRuntimeError

DEFAULT_BASE_URL = "http://127.0.0.1:8000/v1"
DEFAULT_MODEL = "google/functiongemma-270m-it"
DEFAULT_DEADLINE_SECONDS = 4.0
MAX_IN_FLIGHT_REQUESTS = 4
MAX_RESPONSE_BYTES = 64 * 1024
READ_CHUNK_BYTES = 8 * 1024
STATUS_CACHE_SECONDS = 30.0
logger = logging.getLogger(__name__)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Turn every redirect into an HTTP error so credentials never follow it."""

    def redirect_request(self, *_: Any, **__: Any) -> None:
        return None


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirectHandler())


def open_without_redirects(request: urllib.request.Request, timeout: float) -> Any:
    """Open one request while deliberately refusing provider redirects."""
    return _NO_REDIRECT_OPENER.open(request, timeout=timeout)


@dataclass(frozen=True)
class FunctionGemmaFailure:
    """A classified failure containing only values safe to expose to operators."""

    category: str
    message: str
    action: str
    retryable: bool
    upstream_status: int | None = None


class FunctionGemmaConfigurationError(RuntimeError):
    """Raised before a request when endpoint, model, or credential input is unsafe."""

    def __init__(self, failure: FunctionGemmaFailure | None = None) -> None:
        self.failure = failure or FunctionGemmaFailure(
            "configuration_error",
            "FunctionGemma configuration is invalid.",
            "Correct the FunctionGemma endpoint or model configuration and restart the backend.",
            False,
        )
        super().__init__(self.failure.message)


class FunctionGemmaProviderError(RuntimeError):
    """Raised when a managed FunctionGemma server cannot make a valid tool decision."""

    def __init__(self, failure: FunctionGemmaFailure) -> None:
        self.failure = failure
        super().__init__(self.failure.message)


class FunctionGemmaService:
    """Select either the offline local worker or the existing hardened HTTP client."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        deadline_seconds: float = DEFAULT_DEADLINE_SECONDS,
        max_in_flight: int = MAX_IN_FLIGHT_REQUESTS,
        status_cache_seconds: float = STATUS_CACHE_SECONDS,
        runtime: str | None = None,
        local_python: str | None = None,
        local_startup_timeout_seconds: float | None = None,
        local_inference_timeout_seconds: float | None = None,
    ) -> None:
        configured_runtime = (runtime if runtime is not None else os.getenv("FUNCTION_GEMMA_RUNTIME", "auto")).strip().lower()
        configured_python = local_python if local_python is not None else os.getenv("FUNCTION_GEMMA_LOCAL_PYTHON", "")
        if configured_runtime not in {"auto", "local", "http"}:
            raise FunctionGemmaConfigurationError()
        # An explicit constructor endpoint is an integration/test request for HTTP;
        # application configuration still selects local mode when no endpoint is supplied.
        self.runtime = "http" if base_url is not None and runtime is None else ("local" if configured_runtime == "local" or (configured_runtime == "auto" and bool(configured_python.strip())) else "http")
        configured_base_url = base_url if base_url is not None else os.getenv("FUNCTION_GEMMA_BASE_URL", DEFAULT_BASE_URL)
        self.base_url = configured_base_url.strip().rstrip("/") or DEFAULT_BASE_URL
        self.model = (model if model is not None else os.getenv("FUNCTION_GEMMA_MODEL", DEFAULT_MODEL)).strip()
        configured_api_key = api_key if api_key is not None else os.getenv("FUNCTION_GEMMA_API_KEY", "")
        self.api_key = "" if self.runtime == "local" else self._normalize_api_key(configured_api_key)
        if deadline_seconds <= 0 or max_in_flight < 1 or status_cache_seconds < 0:
            raise ValueError("FunctionGemma limits must be positive.")
        self.deadline_seconds = deadline_seconds
        self.status_cache_seconds = status_cache_seconds
        self.in_flight = threading.BoundedSemaphore(1 if self.runtime == "local" else max_in_flight)
        self._status_lock = threading.Lock()
        self._status = "not_checked"
        self._status_checked_at = 0.0
        self._status_failure: FunctionGemmaFailure | None = None
        self._local = None if self.runtime == "http" else LocalFunctionGemmaRuntime(
            configured_python,
            startup_timeout_seconds=local_startup_timeout_seconds or float(os.getenv("FUNCTION_GEMMA_LOCAL_STARTUP_TIMEOUT_SECONDS", "90")),
            inference_timeout_seconds=local_inference_timeout_seconds or float(os.getenv("FUNCTION_GEMMA_LOCAL_INFERENCE_TIMEOUT_SECONDS", "12")),
        )

    @staticmethod
    def _normalize_api_key(value: str) -> str:
        """Return a bearer credential that cannot alter a request header."""
        api_key = value.strip()
        if api_key and (not api_key.isascii() or not api_key.isprintable()):
            raise FunctionGemmaConfigurationError()
        return api_key

    @staticmethod
    def _configuration_failure() -> FunctionGemmaFailure:
        return FunctionGemmaFailure(
            "configuration_error",
            "FunctionGemma configuration is invalid.",
            "Set an http(s) FunctionGemma /v1 endpoint and a valid model name, then restart the backend.",
            False,
        )

    def _validate_configuration(self) -> None:
        """Reject endpoint inputs that could leak credentials or change request routing."""
        parsed = urlparse(self.base_url)
        try:
            has_valid_port = parsed.port is None or 0 < parsed.port < 65536
        except ValueError:
            has_valid_port = False
        valid_model = bool(self.model) and len(self.model) <= 256 and self.model.isascii() and self.model.isprintable() and not any(char.isspace() for char in self.model)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or not has_valid_port
            or not valid_model
        ):
            raise FunctionGemmaConfigurationError(self._configuration_failure())

    def _endpoint(self) -> str:
        self._validate_configuration()
        return f"{self.base_url}/chat/completions"

    def startup_warning(self) -> None:
        """Record configuration state at startup without sending a network request."""
        if self.runtime == "local":
            self._log("startup", "not_checked", False, "The local FunctionGemma runtime will start when slide decisions are first used.")
            return
        try:
            self._validate_configuration()
        except FunctionGemmaConfigurationError as error:
            self._record_failure(error.failure, "startup")
        else:
            self._log("startup", "not_checked", False, "start the separately managed FunctionGemma runtime before using slide decisions")

    def status(self, probe: bool = False) -> dict[str, str | bool | int | None]:
        """Return cached readiness, optionally making one explicit bounded protocol probe."""
        if probe and self._needs_probe():
            self._probe()
        with self._status_lock:
            failure = self._status_failure
            runtime_status = self._status
        action = failure.action if failure else ("The local FunctionGemma runtime will start when slide decisions are first used." if self.runtime == "local" else "Start the separately managed FunctionGemma runtime before using slide decisions.")
        return {
            "runtime_status": runtime_status,
            "ready": runtime_status == "ready",
            "auth_configured": bool(self.api_key) if self.runtime == "http" else False,
            "mode": self.runtime,
            "action": action,
            "category": failure.category if failure else "not_checked",
            "upstream_status": failure.upstream_status if failure else None,
            "retryable": failure.retryable if failure else False,
        }

    def _needs_probe(self) -> bool:
        with self._status_lock:
            return time.monotonic() - self._status_checked_at >= self.status_cache_seconds

    def _probe(self) -> None:
        """Verify the real tools protocol without using browser utterances or slide data."""
        probe_slide = {"id": "probe", "title": "Probe", "description": "Protocol readiness check."}
        try:
            self._run_bounded("", probe_slide, [probe_slide])
        except (FunctionGemmaConfigurationError, FunctionGemmaProviderError):
            pass

    async def decide(self, utterance: str, current_slide: dict[str, str], available_slides: list[dict[str, str]]) -> dict[str, str]:
        """Return the only allowed decision within one absolute deadline."""
        return await asyncio.to_thread(self._run_bounded, utterance, current_slide, available_slides)

    def _run_bounded(self, utterance: str, current_slide: dict[str, str], available_slides: list[dict[str, str]]) -> dict[str, str]:
        if not self.in_flight.acquire(blocking=False):
            failure = FunctionGemmaFailure("busy", "The slide-decision service is busy.", "Wait briefly and try the slide decision again.", True, 429)
            self._record_failure(failure, "request")
            raise FunctionGemmaProviderError(failure)
        try:
            if self._local is not None:
                try:
                    decision = self._local.decide(utterance, current_slide, available_slides)
                except LocalRuntimeError as error:
                    raise FunctionGemmaProviderError(self._local_failure(error)) from None
            else:
                decision = self._post_decision(utterance, current_slide, available_slides)
        except FunctionGemmaConfigurationError as error:
            self._record_failure(error.failure, "request")
            raise
        except FunctionGemmaProviderError as error:
            self._record_failure(error.failure, "request")
            raise
        else:
            self._record_ready()
            return decision
        finally:
            self.in_flight.release()

    @staticmethod
    def _local_failure(error: LocalRuntimeError) -> FunctionGemmaFailure:
        """Map private subprocess conditions to actionable, non-sensitive diagnostics."""
        failures = {
            "python_unavailable": ("The configured local FunctionGemma Python runtime is unavailable.", "Check FUNCTION_GEMMA_LOCAL_PYTHON and restart the backend.", False),
            "dependency_missing": ("The local FunctionGemma runtime is missing required Python packages.", "Use the Python environment that has torch and transformers installed.", False),
            "cache_missing": ("The local FunctionGemma model cache is unavailable.", "Download the gated model into the configured Python environment before running offline.", False),
            "load_failure": ("The local FunctionGemma model could not be loaded.", "Check the local Python environment and cached model compatibility.", False),
            "timeout": ("The local FunctionGemma runtime took too long.", "Try again; the local worker will restart automatically.", True),
            "inference_failure": ("The local FunctionGemma inference failed.", "Try again; the local worker will restart automatically.", True),
            "protocol_error": ("The local FunctionGemma runtime returned an invalid response.", "Try again; the local worker will restart automatically.", True),
            "worker_crashed": ("The local FunctionGemma runtime stopped unexpectedly.", "Try again; the local worker will restart automatically.", True),
            "runtime_closed": ("The local FunctionGemma runtime is restarting.", "Wait briefly and try the slide decision again.", True),
        }
        message, action, retryable = failures.get(error.category, failures["protocol_error"])
        return FunctionGemmaFailure(error.category, message, action, retryable)

    def close(self) -> None:
        """Release the optional local worker during FastAPI shutdown or reload."""
        if self._local is not None:
            self._local.close()

    def _post_decision(self, utterance: str, current_slide: dict[str, str], available_slides: list[dict[str, str]]) -> dict[str, str]:
        endpoint = self._endpoint()
        deadline = time.monotonic() + self.deadline_seconds
        slide_ids = [slide["id"] for slide in available_slides]
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "Choose exactly one function. Navigate only when the completed utterance clearly moves to a listed slide; otherwise choose no_action."},
                {"role": "user", "content": json.dumps({"latest_utterance": utterance, "current_slide": current_slide, "available_slides": available_slides}, separators=(",", ":"))},
            ],
            "tools": [
                {"type": "function", "function": {"name": "goto_slide", "description": "Navigate to one available semantic slide.", "parameters": {"type": "object", "properties": {"slide_id": {"type": "string", "enum": slide_ids}}, "required": ["slide_id"], "additionalProperties": False}}},
                {"type": "function", "function": {"name": "no_action", "description": "Keep the current slide.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
            ],
            "tool_choice": "required",
            "temperature": 0,
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(endpoint, data=json.dumps(body, separators=(",", ":")).encode("utf-8"), headers=headers, method="POST")
        try:
            response = open_without_redirects(request, timeout=self._remaining_seconds(deadline))
        except urllib.error.HTTPError as error:
            raise FunctionGemmaProviderError(self._http_failure(error.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise FunctionGemmaProviderError(self._connect_failure(error)) from None
        try:
            with response:
                raw = self._read_response(response, deadline)
        except FunctionGemmaProviderError:
            raise
        except (TimeoutError, socket.timeout):
            raise FunctionGemmaProviderError(self._response_timeout_failure()) from None
        except OSError as error:
            raise FunctionGemmaProviderError(self._transport_failure(error)) from None
        try:
            payload: Any = json.loads(raw)
        except (TypeError, ValueError):
            raise FunctionGemmaProviderError(FunctionGemmaFailure("invalid_json", "The FunctionGemma response was invalid JSON.", "Check that the FunctionGemma server implements OpenAI-compatible chat completions.", False)) from None
        return self._extract_tool_call(payload, set(slide_ids))

    @staticmethod
    def _http_failure(status: int) -> FunctionGemmaFailure:
        if 300 <= status <= 399:
            return FunctionGemmaFailure("redirect_blocked", "The FunctionGemma endpoint redirected the request.", "Use a direct FunctionGemma /v1 endpoint without redirects.", False, status)
        if status in {401, 403}:
            return FunctionGemmaFailure("authentication_rejected", "FunctionGemma authentication was rejected.", "Check FUNCTION_GEMMA_API_KEY on the backend and restart it.", False, status)
        if status == 400:
            return FunctionGemmaFailure("bad_request", "The FunctionGemma server rejected the request.", "Confirm the server supports OpenAI-compatible tools at /v1/chat/completions.", False, status)
        if status == 404:
            return FunctionGemmaFailure("endpoint_not_found", "The FunctionGemma endpoint was not found.", "Set FUNCTION_GEMMA_BASE_URL to the server's /v1 base URL.", False, status)
        if status == 422:
            return FunctionGemmaFailure("unprocessable_request", "The FunctionGemma server could not process the tools request.", "Confirm the server supports OpenAI-compatible tools at /v1/chat/completions.", False, status)
        if status == 429:
            return FunctionGemmaFailure("rate_limited", "The FunctionGemma server is rate limited.", "Wait briefly, then try again.", True, status)
        if 500 <= status <= 599:
            return FunctionGemmaFailure("upstream_server_error", "The FunctionGemma server failed.", "Check the FunctionGemma runtime logs, then try again.", True, status)
        return FunctionGemmaFailure("upstream_http_error", "The FunctionGemma server returned an unexpected response.", "Check the FunctionGemma runtime configuration.", False, status)

    def _connect_failure(self, error: BaseException) -> FunctionGemmaFailure:
        """Classify failures before urllib has received a valid HTTP response."""
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        # Some urllib redirect paths wrap the HTTP status in URLError rather than
        # raising HTTPError directly; keep credential-protection diagnostics exact.
        if isinstance(reason, urllib.error.HTTPError):
            return self._http_failure(reason.code)
        if isinstance(reason, (TimeoutError, socket.timeout)) and self._is_loopback_endpoint():
            return FunctionGemmaFailure("connection_refused", "The local FunctionGemma runtime is unreachable.", "Start the separately managed FunctionGemma server, then try again.", True)
        return self._transport_failure(error)

    def _is_loopback_endpoint(self) -> bool:
        """Treat local listener setup failures as missing runtimes, not OAuth errors."""
        hostname = urlparse(self.base_url).hostname
        if hostname == "localhost":
            return True
        try:
            return hostname is not None and ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            return False

    @staticmethod
    def _response_timeout_failure() -> FunctionGemmaFailure:
        return FunctionGemmaFailure("timeout", "The FunctionGemma server timed out.", "Check that the FunctionGemma runtime is healthy, then try again.", True)

    @staticmethod
    def _transport_failure(error: BaseException) -> FunctionGemmaFailure:
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return FunctionGemmaService._response_timeout_failure()
        if isinstance(reason, ssl.SSLError):
            return FunctionGemmaFailure("tls_error", "The FunctionGemma TLS connection failed.", "Check the FunctionGemma server certificate and HTTPS configuration.", False)
        if isinstance(reason, socket.gaierror):
            return FunctionGemmaFailure("dns_error", "The FunctionGemma server host could not be resolved.", "Check FUNCTION_GEMMA_BASE_URL on the backend.", False)
        if isinstance(reason, ConnectionRefusedError) or getattr(reason, "errno", None) == errno.ECONNREFUSED:
            return FunctionGemmaFailure("connection_refused", "The FunctionGemma runtime is not accepting connections.", "Start the separately managed FunctionGemma server, then try again.", True)
        return FunctionGemmaFailure("transport_error", "The FunctionGemma server could not be reached.", "Check that the FunctionGemma runtime is reachable from the backend.", True)

    def _record_ready(self) -> None:
        with self._status_lock:
            self._status = "ready"
            self._status_checked_at = time.monotonic()
            self._status_failure = None
        self._log("protocol_exchange", "ready", False, "FunctionGemma tools protocol is ready")

    def _record_failure(self, failure: FunctionGemmaFailure, event: str) -> None:
        with self._status_lock:
            self._status = failure.category
            self._status_checked_at = time.monotonic()
            self._status_failure = failure
        self._log(event, failure.category, failure.retryable, failure.action, failure.upstream_status)

    def _log(self, event: str, category: str, retryable: bool, action: str, upstream_status: int | None = None) -> None:
        """Emit fixed-schema diagnostics without request data, URLs, headers, or errors."""
        logger.warning("function_gemma_diagnostic %s", {
            "event": event,
            "category": category,
            "upstream_status": upstream_status,
            "retryable": retryable,
            "runtime_status": self._status,
            "auth_configured": bool(self.api_key),
            "action": action,
        })

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise FunctionGemmaProviderError(FunctionGemmaFailure("timeout", "The FunctionGemma server timed out.", "Check that the FunctionGemma runtime is healthy, then try again.", True))
        return remaining

    def _read_response(self, response: Any, deadline: float) -> bytes:
        """Apply the absolute deadline to every socket read, not just connect."""
        content_length = response.headers.get("Content-Length")
        try:
            if content_length and int(content_length) > MAX_RESPONSE_BYTES:
                raise FunctionGemmaProviderError(FunctionGemmaFailure("response_too_large", "The FunctionGemma response was too large.", "Check the FunctionGemma server response format.", False))
        except ValueError:
            raise FunctionGemmaProviderError(FunctionGemmaFailure("invalid_response", "The FunctionGemma response was invalid.", "Check the FunctionGemma server response format.", False)) from None
        chunks: list[bytes] = []
        total = 0
        read_one_chunk = getattr(response, "read1", None)
        if not callable(read_one_chunk):
            raise FunctionGemmaProviderError(FunctionGemmaFailure("unsupported_response", "The FunctionGemma response was unsupported.", "Check that the server uses an HTTP response compatible with OpenAI clients.", False))
        while True:
            self._set_read_timeout(response, self._remaining_seconds(deadline))
            chunk = read_one_chunk(min(READ_CHUNK_BYTES, MAX_RESPONSE_BYTES + 1 - total))
            if not chunk:
                self._remaining_seconds(deadline)
                return b"".join(chunks)
            total += len(chunk)
            if total > MAX_RESPONSE_BYTES:
                raise FunctionGemmaProviderError(FunctionGemmaFailure("response_too_large", "The FunctionGemma response was too large.", "Check the FunctionGemma server response format.", False))
            chunks.append(chunk)

    @staticmethod
    def _set_read_timeout(response: Any, timeout_seconds: float) -> None:
        socket_object = getattr(getattr(getattr(response, "fp", None), "raw", None), "_sock", None)
        if socket_object is not None:
            socket_object.settimeout(timeout_seconds)

    @staticmethod
    def _extract_tool_call(payload: Any, available_ids: set[str]) -> dict[str, str]:
        try:
            tool_calls = payload["choices"][0]["message"]["tool_calls"]
            if not isinstance(tool_calls, list) or len(tool_calls) != 1:
                raise ValueError
            function = tool_calls[0]["function"]
            name = function["name"]
            arguments = json.loads(function["arguments"])
            if not isinstance(arguments, dict):
                raise ValueError
        except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            raise FunctionGemmaProviderError(FunctionGemmaFailure("invalid_tool_call", "The FunctionGemma response did not contain one valid tool call.", "Check that the server supports OpenAI-compatible tools.", False)) from None
        if name == "no_action" and not arguments:
            return {"action": "no_action"}
        if name == "goto_slide" and set(arguments) == {"slide_id"} and isinstance(arguments.get("slide_id"), str) and arguments["slide_id"] in available_ids:
            return {"action": "goto_slide", "slide_id": arguments["slide_id"]}
        raise FunctionGemmaProviderError(FunctionGemmaFailure("invalid_tool_call", "The FunctionGemma response did not contain one valid tool call.", "Check that the server supports OpenAI-compatible tools.", False))
