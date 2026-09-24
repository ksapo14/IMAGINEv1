import asyncio
import errno
import json
import os
import socket
import ssl
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from backend import main as backend_main
from backend.main import PitchDecisionRequest, PitchDecisionResponse, SlidingWindowRateLimiter
from backend.services.function_gemma import FunctionGemmaConfigurationError, FunctionGemmaFailure, FunctionGemmaProviderError, FunctionGemmaService


ROOT = Path(__file__).resolve().parents[1]


SLIDES = [
    {"id": "open", "title": "Open", "description": "Opening slide."},
    {"id": "tam", "title": "Market", "description": "Market opportunity."},
]


class StubResponse:
    def __init__(self, payload: object) -> None:
        self.payload = json.dumps(payload).encode("utf-8")
        self.headers = {}
        self.sent = False

    def __enter__(self) -> "StubResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, _: int) -> bytes:
        if self.sent:
            return b""
        self.sent = True
        return self.payload

    def read1(self, size: int) -> bytes:
        return self.read(size)


def tool_call(name: str, arguments: object) -> dict[str, object]:
    return {"choices": [{"message": {"tool_calls": [{"function": {"name": name, "arguments": json.dumps(arguments)}}]}}]}


class FunctionGemmaContractTests(unittest.TestCase):
    def test_function_gemma_config_precedence_preserves_process_values(self) -> None:
        def fake_load(path: Path, override: bool) -> None:
            if path.name == ".env":
                os.environ.setdefault("FUNCTION_GEMMA_RUNTIME", "http")
                os.environ["FUNCTION_GEMMA_BASE_URL"] = "http://from-env/v1"
            else:
                os.environ.update({"FUNCTION_GEMMA_RUNTIME": "local", "FUNCTION_GEMMA_MODEL": "local-model"})

        with patch.dict(os.environ, {"FUNCTION_GEMMA_RUNTIME": "process"}, clear=True), patch("backend.main.load_dotenv", side_effect=fake_load) as loader:
            backend_main.load_function_gemma_environment(ROOT)
            self.assertEqual(os.environ["FUNCTION_GEMMA_RUNTIME"], "process")
            self.assertEqual(os.environ["FUNCTION_GEMMA_MODEL"], "local-model")
            self.assertEqual(os.environ["FUNCTION_GEMMA_BASE_URL"], "http://from-env/v1")
            self.assertEqual(loader.call_args_list[0].kwargs, {"override": False})
            self.assertEqual(loader.call_args_list[1].kwargs, {"override": True})
        with patch.dict(os.environ, {}, clear=True):
            service = FunctionGemmaService()
            self.assertEqual(service.runtime, "http")
            self.assertEqual(service.base_url, "http://127.0.0.1:8000/v1")

    def test_request_and_response_are_bounded_and_deck_scoped(self) -> None:
        request = PitchDecisionRequest(latestUtterance="Show the market.", currentSlide=SLIDES[0], availableSlides=SLIDES)
        self.assertEqual(request.currentSlide.id, "open")
        self.assertEqual(PitchDecisionResponse(action="goto_slide", slide_id="tam").slide_id, "tam")
        self.assertEqual(PitchDecisionResponse(action="no_action").action, "no_action")
        with self.assertRaises(ValidationError):
            PitchDecisionRequest(latestUtterance="x", currentSlide=SLIDES[0], availableSlides=[SLIDES[0], SLIDES[0]])
        with self.assertRaises(ValidationError):
            PitchDecisionRequest(latestUtterance="x", currentSlide=SLIDES[0], availableSlides=[SLIDES[1]])
        with self.assertRaises(ValidationError):
            PitchDecisionResponse(action="goto_slide")
        with self.assertRaises(ValidationError):
            PitchDecisionResponse(action="no_action", slide_id="tam")

    def test_service_sends_only_the_two_required_tools_and_parses_a_valid_target(self) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request: object, timeout: float) -> StubResponse:
            captured["url"] = request.full_url
            captured["body"] = json.loads(request.data)
            captured["timeout"] = timeout
            return StubResponse(tool_call("goto_slide", {"slide_id": "tam"}))

        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", deadline_seconds=3)
        with patch("backend.services.function_gemma.open_without_redirects", fake_urlopen):
            decision = asyncio.run(service.decide("Tell me about market size.", SLIDES[0], SLIDES))
        self.assertEqual(decision, {"action": "goto_slide", "slide_id": "tam"})
        self.assertEqual(captured["url"], "http://127.0.0.1:8000/v1/chat/completions")
        body = captured["body"]
        self.assertEqual(body["model"], "google/functiongemma-270m-it")
        self.assertEqual(body["tool_choice"], "required")
        self.assertEqual([tool["function"]["name"] for tool in body["tools"]], ["goto_slide", "no_action"])
        self.assertEqual(body["tools"][0]["function"]["parameters"]["properties"]["slide_id"]["enum"], ["open", "tam"])

    def test_service_reads_a_trimmed_environment_key_and_omits_blank_keys(self) -> None:
        captured_headers: list[dict[str, str]] = []

        def fake_urlopen(request: object, timeout: float) -> StubResponse:
            captured_headers.append(dict(request.header_items()))
            return StubResponse(tool_call("no_action", {}))

        with patch.dict(os.environ, {"FUNCTION_GEMMA_API_KEY": "  environment-token  "}, clear=False):
            service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        with patch("backend.services.function_gemma.open_without_redirects", fake_urlopen):
            asyncio.run(service.decide("Hold this slide.", SLIDES[0], SLIDES))
        self.assertEqual(captured_headers[0].get("Authorization"), "Bearer environment-token")

        blank_service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key=" \t ")
        with patch("backend.services.function_gemma.open_without_redirects", fake_urlopen):
            asyncio.run(blank_service.decide("Hold this slide.", SLIDES[0], SLIDES))
        self.assertNotIn("Authorization", captured_headers[1])

    def test_constructor_key_overrides_the_environment_key(self) -> None:
        captured: dict[str, str] = {}

        def fake_urlopen(request: object, timeout: float) -> StubResponse:
            captured.update(dict(request.header_items()))
            return StubResponse(tool_call("no_action", {}))

        with patch.dict(os.environ, {"FUNCTION_GEMMA_API_KEY": "environment-token"}, clear=False):
            service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key="  constructor-token ")
        with patch("backend.services.function_gemma.open_without_redirects", fake_urlopen):
            asyncio.run(service.decide("Hold this slide.", SLIDES[0], SLIDES))
        self.assertEqual(captured.get("Authorization"), "Bearer constructor-token")

    def test_blank_base_url_uses_the_native_default_and_preserves_compose_default(self) -> None:
        with patch.dict(os.environ, {"FUNCTION_GEMMA_BASE_URL": " \t "}, clear=False):
            service = FunctionGemmaService()
        self.assertEqual(service.base_url, "http://127.0.0.1:8000/v1")

        example = (ROOT / ".env.example").read_text(encoding="utf-8")
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("FUNCTION_GEMMA_BASE_URL=", example)
        self.assertNotIn("FUNCTION_GEMMA_BASE_URL=http", example)
        self.assertIn(
            "FUNCTION_GEMMA_BASE_URL: ${FUNCTION_GEMMA_BASE_URL:-http://host.docker.internal:8000/v1}",
            compose,
        )

    def test_service_rejects_unsafe_api_keys_without_leaking_them(self) -> None:
        for api_key in ("private-token\r\nInjected: value", "private-token-😀"):
            with self.subTest(api_key="unsafe"):
                with self.assertRaises(FunctionGemmaConfigurationError) as raised:
                    FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key=api_key)
            self.assertNotIn(api_key, str(raised.exception))

    def test_service_rejects_invalid_or_unavailable_tool_calls(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        for payload in [tool_call("goto_slide", {"slide_id": "missing"}), tool_call("no_action", {"slide_id": "tam"}), {"choices": []}]:
            with self.subTest(payload=payload), self.assertRaises(FunctionGemmaProviderError):
                service._extract_tool_call(payload, {"open", "tam"})

    def test_service_normalizes_transport_and_configuration_errors(self) -> None:
        invalid = FunctionGemmaService(base_url="not a URL")
        with self.assertRaises(FunctionGemmaConfigurationError):
            invalid._endpoint()
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        with patch("backend.services.function_gemma.open_without_redirects", side_effect=OSError("secret transport detail")):
            with self.assertRaises(FunctionGemmaProviderError) as raised:
                asyncio.run(service.decide("Market", SLIDES[0], SLIDES))
        self.assertNotIn("secret transport detail", str(raised.exception))

    def test_service_sanitizes_authentication_refusals(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key="private-token")
        for status_code in (401, 403):
            with self.subTest(status_code=status_code), patch(
                "backend.services.function_gemma.open_without_redirects",
                side_effect=HTTPError("http://127.0.0.1:8000/v1/chat/completions", status_code, "private provider detail", {}, None),
            ):
                with self.assertRaises(FunctionGemmaProviderError) as raised:
                    asyncio.run(service.decide("Market", SLIDES[0], SLIDES))
            self.assertEqual(raised.exception.failure.category, "authentication_rejected")
            self.assertNotIn("private-token", str(raised.exception))
            self.assertNotIn("private provider detail", str(raised.exception))

    def test_rate_limiter_expires_requests(self) -> None:
        clock = [0.0]
        limiter = SlidingWindowRateLimiter(limit=1, window_seconds=10, clock=lambda: clock[0])
        self.assertTrue(limiter.allow("client"))
        self.assertFalse(limiter.allow("client"))
        clock[0] = 10.1
        self.assertTrue(limiter.allow("client"))

    def test_absolute_deadline_bounds_connect_and_each_response_read(self) -> None:
        class Socket:
            def __init__(self) -> None:
                self.timeouts: list[float] = []

            def settimeout(self, value: float) -> None:
                self.timeouts.append(value)

        response = StubResponse(tool_call("no_action", {}))
        socket = Socket()
        response.fp = SimpleNamespace(raw=SimpleNamespace(_sock=socket))
        captured: dict[str, float] = {}

        def fake_urlopen(_: object, timeout: float) -> StubResponse:
            captured["connect"] = timeout
            return response

        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", deadline_seconds=4)
        with (
            patch("backend.services.function_gemma.time.monotonic", side_effect=[10.0, 10.0, 10.5, 11.0, 11.5, 12.0]),
            patch("backend.services.function_gemma.open_without_redirects", fake_urlopen),
        ):
            self.assertEqual(service._run_bounded("Hold this slide.", SLIDES[0], SLIDES), {"action": "no_action"})
        self.assertEqual(captured["connect"], 4.0)
        self.assertTrue(socket.timeouts)
        self.assertTrue(all(0 < value <= 4 for value in socket.timeouts))

    def test_expired_deadline_and_busy_worker_are_rejected_without_network(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", max_in_flight=1)
        with patch("backend.services.function_gemma.time.monotonic", return_value=5.0):
            with self.assertRaisesRegex(FunctionGemmaProviderError, "timed out"):
                service._remaining_seconds(5.0)
        self.assertTrue(service.in_flight.acquire(blocking=False))
        try:
            with self.assertRaisesRegex(FunctionGemmaProviderError, "busy"):
                service._run_bounded("Market", SLIDES[0], SLIDES)
        finally:
            service.in_flight.release()

    def test_partial_read1_chunks_recheck_the_deadline_before_the_next_receive(self) -> None:
        class PartialResponse:
            headers: dict[str, str] = {}

            def __init__(self) -> None:
                self.chunks = [b"first", b"second", b"third"]
                self.reads = 0

            def read1(self, _: int) -> bytes:
                self.reads += 1
                return self.chunks.pop(0)

        response = PartialResponse()
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        with patch("backend.services.function_gemma.time.monotonic", side_effect=[0.0, 1.0, 2.0]):
            with self.assertRaisesRegex(FunctionGemmaProviderError, "timed out"):
                service._read_response(response, 2.0)
        self.assertEqual(response.reads, 2)

    def test_unsupported_buffered_response_shape_is_rejected(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        response = SimpleNamespace(headers={}, read=lambda _: b"unsafe")
        with self.assertRaisesRegex(FunctionGemmaProviderError, "unsupported"):
            service._read_response(response, float("inf"))

    def test_route_returns_only_deck_scoped_provider_decisions(self) -> None:
        payload = PitchDecisionRequest(latestUtterance="Market", currentSlide=SLIDES[0], availableSlides=SLIDES)
        request = SimpleNamespace(client=SimpleNamespace(host="route-test"))
        with patch.object(backend_main.function_gemma, "decide", new=AsyncMock(return_value={"action": "goto_slide", "slide_id": "tam"})):
            response = asyncio.run(backend_main.decide_pitch_slide(payload, request))
        self.assertEqual(response.model_dump(exclude_none=True), {"action": "goto_slide", "slide_id": "tam"})
        with patch.object(backend_main.function_gemma, "decide", new=AsyncMock(return_value={"action": "goto_slide", "slide_id": "missing"})):
            with self.assertRaisesRegex(Exception, "unavailable slide"):
                asyncio.run(backend_main.decide_pitch_slide(payload, SimpleNamespace(client=SimpleNamespace(host="route-test-unknown"))))

    def test_route_keeps_authentication_diagnostics_out_of_the_public_response(self) -> None:
        payload = PitchDecisionRequest(latestUtterance="Market", currentSlide=SLIDES[0], availableSlides=SLIDES)
        backend_error = FunctionGemmaProviderError(FunctionGemmaFailure("authentication_rejected", "private provider body", "private action", False, 401))
        with patch.object(backend_main.function_gemma, "decide", new=AsyncMock(side_effect=backend_error)):
            with self.assertRaises(backend_main.HTTPException) as raised:
                asyncio.run(backend_main.decide_pitch_slide(payload, SimpleNamespace(client=SimpleNamespace(host="route-test-auth"))))
        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail, {"code": "function_gemma_auth_rejected", "message": "Slide decisions were rejected by FunctionGemma."})
        self.assertNotIn("private provider body", str(raised.exception.detail))

    def test_transport_failures_are_classified_without_the_raw_reason(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        failures = {
            ConnectionRefusedError(errno.ECONNREFUSED, "private refused detail"): "connection_refused",
            socket.gaierror("private dns detail"): "dns_error",
            ssl.SSLError("private TLS detail"): "tls_error",
            URLError(TimeoutError("private local connect timeout")): "connection_refused",
            OSError("private transport detail"): "transport_error",
        }
        for error, category in failures.items():
            with self.subTest(category=category), patch("backend.services.function_gemma.open_without_redirects", side_effect=error):
                with self.assertRaises(FunctionGemmaProviderError) as raised:
                    asyncio.run(service.decide("PRIVATE UTTERANCE", SLIDES[0], SLIDES))
            self.assertEqual(raised.exception.failure.category, category)
            self.assertNotIn("private", str(raised.exception).lower())

    def test_response_read_timeout_stays_distinct_from_local_connection_setup(self) -> None:
        class ReadTimeoutResponse:
            headers: dict[str, str] = {}

            def __enter__(self) -> "ReadTimeoutResponse":
                return self

            def __exit__(self, *_: object) -> None:
                return None

            def read1(self, _: int) -> bytes:
                raise TimeoutError("private response timeout")

        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1")
        with patch("backend.services.function_gemma.open_without_redirects", return_value=ReadTimeoutResponse()):
            with self.assertRaises(FunctionGemmaProviderError) as raised:
                asyncio.run(service.decide("PRIVATE UTTERANCE", SLIDES[0], SLIDES))
        self.assertEqual(raised.exception.failure.category, "timeout")
        self.assertNotIn("private", str(raised.exception).lower())

    def test_http_failures_are_precisely_classified_without_provider_content(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key="private-token")
        expected = {400: "bad_request", 401: "authentication_rejected", 403: "authentication_rejected", 404: "endpoint_not_found", 422: "unprocessable_request", 429: "rate_limited", 500: "upstream_server_error", 503: "upstream_server_error"}
        for status, category in expected.items():
            error = HTTPError("http://private-user:private-pass@example.test/v1/chat/completions", status, "private provider reason", {}, None)
            with self.subTest(status=status), patch("backend.services.function_gemma.open_without_redirects", side_effect=error):
                with self.assertRaises(FunctionGemmaProviderError) as raised:
                    asyncio.run(service.decide("PRIVATE UTTERANCE", SLIDES[0], SLIDES))
            self.assertEqual(raised.exception.failure.category, category)
            self.assertNotIn("private", str(raised.exception).lower())

    def test_unsafe_endpoint_and_model_configuration_never_echoes_input(self) -> None:
        for base_url, model in [
            ("http://private-user:private-pass@localhost:8000/v1", "model"),
            ("http://localhost:8000/v1?private=query", "model"),
            ("http://localhost:8000/v1#private", "model"),
            ("ftp://localhost:8000/v1", "model"),
            ("http://localhost:8000/v1", "private model"),
        ]:
            with self.subTest(base_url="unsafe"), self.assertRaises(FunctionGemmaConfigurationError) as raised:
                FunctionGemmaService(base_url=base_url, model=model)._endpoint()
            self.assertEqual(raised.exception.failure.category, "configuration_error")
            self.assertNotIn("private", str(raised.exception).lower())

    def test_status_probe_uses_real_loopback_protocol_once_then_caches_readiness(self) -> None:
        test_case = self

        class Handler(BaseHTTPRequestHandler):
            calls = 0

            def do_POST(self) -> None:  # noqa: N802 - required HTTP handler name
                type(self).calls += 1
                test_case.assertEqual(self.path, "/v1/chat/completions")
                test_case.assertEqual(self.headers["Authorization"], "Bearer dummy-probe-token")
                test_case.assertEqual(self.headers["Content-Type"], "application/json")
                size = int(self.headers["Content-Length"])
                request = json.loads(self.rfile.read(size))
                test_case.assertEqual(request["model"], "test/functiongemma")
                test_case.assertEqual(request["tool_choice"], "required")
                test_case.assertEqual(request["temperature"], 0)
                test_case.assertEqual([message["role"] for message in request["messages"]], ["system", "user"])
                user_context = json.loads(request["messages"][1]["content"])
                test_case.assertEqual(user_context["latest_utterance"], "")
                test_case.assertEqual(user_context["current_slide"]["id"], "probe")
                test_case.assertEqual([slide["id"] for slide in user_context["available_slides"]], ["probe"])
                test_case.assertEqual([tool["function"]["name"] for tool in request["tools"]], ["goto_slide", "no_action"])
                test_case.assertEqual(len(request["tools"]), 2)
                test_case.assertEqual(request["tools"][0]["function"]["parameters"]["properties"]["slide_id"]["enum"], ["probe"])
                response = json.dumps(tool_call("no_action", {})).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)

            def log_message(self, *_: object) -> None:
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            service = FunctionGemmaService(base_url=f"http://127.0.0.1:{server.server_port}/v1", model="test/functiongemma", api_key="dummy-probe-token", status_cache_seconds=60)
            self.assertEqual(service.status()["runtime_status"], "not_checked")
            self.assertTrue(service.status(probe=True)["ready"])
            self.assertTrue(service.status(probe=True)["ready"])
            self.assertEqual(Handler.calls, 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            self.assertFalse(thread.is_alive())

    def test_readiness_recovers_after_a_classified_failure_and_valid_protocol_response(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", status_cache_seconds=0)
        with patch("backend.services.function_gemma.open_without_redirects", side_effect=ConnectionRefusedError(errno.ECONNREFUSED, "private listener detail")):
            self.assertEqual(service.status(probe=True)["runtime_status"], "connection_refused")
        with patch("backend.services.function_gemma.open_without_redirects", return_value=StubResponse(tool_call("no_action", {}))):
            status = service.status(probe=True)
        self.assertEqual(status["runtime_status"], "ready")
        self.assertTrue(status["ready"])

    def test_route_maps_connection_refused_to_safe_dependency_response(self) -> None:
        payload = PitchDecisionRequest(latestUtterance="PRIVATE UTTERANCE", currentSlide=SLIDES[0], availableSlides=SLIDES)
        failure = FunctionGemmaFailure("connection_refused", "private OS detail", "private action", True)
        with patch.object(backend_main.function_gemma, "decide", new=AsyncMock(side_effect=FunctionGemmaProviderError(failure))):
            with self.assertRaises(backend_main.HTTPException) as raised:
                asyncio.run(backend_main.decide_pitch_slide(payload, SimpleNamespace(client=SimpleNamespace(host="route-test-refused"))))
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail, {"code": "function_gemma_runtime_unavailable", "message": "Slide decisions are unavailable because FunctionGemma is not running."})
        self.assertNotIn("private", str(raised.exception.detail).lower())

    def test_status_route_is_cached_until_an_explicit_probe(self) -> None:
        safe_status = {"runtime_status": "not_checked", "ready": False, "auth_configured": True, "action": "Start the separately managed FunctionGemma runtime before using slide decisions.", "category": "not_checked", "upstream_status": None, "retryable": False}
        request = SimpleNamespace(client=SimpleNamespace(host="status-test"))
        with patch.object(backend_main.function_gemma, "status", return_value=safe_status) as status:
            self.assertEqual(backend_main.pitch_status(request), safe_status)
            self.assertEqual(backend_main.pitch_status(request, probe=True), safe_status)
        self.assertEqual(status.call_args_list[0].kwargs, {"probe": False})
        self.assertEqual(status.call_args_list[1].kwargs, {"probe": True})

    def test_operator_logs_use_only_the_fixed_secret_safe_schema(self) -> None:
        service = FunctionGemmaService(base_url="http://127.0.0.1:8000/v1", api_key="private-token")
        with (
            patch("backend.services.function_gemma.open_without_redirects", side_effect=ConnectionRefusedError(errno.ECONNREFUSED, "PRIVATE OS DETAIL")),
            patch("backend.services.function_gemma.logger.warning") as warning,
        ):
            with self.assertRaises(FunctionGemmaProviderError):
                asyncio.run(service.decide("PRIVATE UTTERANCE", SLIDES[0], SLIDES))
        payload = warning.call_args.args[1]
        self.assertEqual(set(payload), {"event", "category", "upstream_status", "retryable", "runtime_status", "auth_configured", "action"})
        self.assertNotIn("private", str(payload).lower())

    def test_asgi_validation_errors_never_include_submitted_request_values(self) -> None:
        canaries = ["UTTERANCE-CANARY-DO-NOT-LEAK", "SLIDE-CANARY-DO-NOT-LEAK"]
        payload = {
            "latestUtterance": canaries[0] * 400,
            "currentSlide": {"id": "open", "title": canaries[1], "description": canaries[1]},
            "availableSlides": [{"id": "open", "title": canaries[1], "description": canaries[1]}],
        }

        async def invoke() -> list[dict[str, object]]:
            sent: list[dict[str, object]] = []
            received = False

            async def receive() -> dict[str, object]:
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": json.dumps(payload).encode("utf-8"), "more_body": False}
                return {"type": "http.disconnect"}

            async def send(message: dict[str, object]) -> None:
                sent.append(message)

            await backend_main.app({
                "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                "scheme": "http", "path": "/api/pitch/decide", "raw_path": b"/api/pitch/decide",
                "query_string": b"", "headers": [(b"content-type", b"application/json")],
                "client": ("127.0.0.1", 0), "server": ("testserver", 80),
            }, receive, send)
            return sent

        messages = asyncio.run(invoke())
        start = next(message for message in messages if message["type"] == "http.response.start")
        body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
        self.assertEqual(start["status"], 422)
        self.assertEqual(json.loads(body), {"detail": {"code": "invalid_request", "message": "Request data is invalid."}})
        for canary in canaries:
            self.assertNotIn(canary.encode("utf-8"), body)

    def test_redirects_are_blocked_before_credentials_can_reach_another_origin(self) -> None:
        test_case = self

        class TargetHandler(BaseHTTPRequestHandler):
            calls = 0
            authorization_headers: list[str | None] = []

            def do_POST(self) -> None:  # noqa: N802 - required HTTP handler name
                type(self).calls += 1
                type(self).authorization_headers.append(self.headers.get("Authorization"))
                self.send_response(500)
                self.end_headers()

            def log_message(self, *_: object) -> None:
                return

        class RedirectHandler(BaseHTTPRequestHandler):
            status = 301
            target_url = ""

            def do_POST(self) -> None:  # noqa: N802 - required HTTP handler name
                self.send_response(type(self).status)
                self.send_header("Location", type(self).target_url)
                self.end_headers()

            def log_message(self, *_: object) -> None:
                return

        target = ThreadingHTTPServer(("127.0.0.1", 0), TargetHandler)
        redirect = ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
        target_thread = threading.Thread(target=target.serve_forever, daemon=True)
        redirect_thread = threading.Thread(target=redirect.serve_forever, daemon=True)
        target_thread.start()
        redirect_thread.start()
        try:
            RedirectHandler.target_url = f"http://127.0.0.1:{target.server_port}/private-redirect-target"
            service = FunctionGemmaService(base_url=f"http://127.0.0.1:{redirect.server_port}/v1", api_key="dummy-redirect-token")
            for status in (301, 302, 303, 307, 308):
                RedirectHandler.status = status
                with self.subTest(status=status), self.assertRaises(FunctionGemmaProviderError) as raised:
                    asyncio.run(service.decide("PRIVATE UTTERANCE", SLIDES[0], SLIDES))
                test_case.assertEqual(raised.exception.failure.category, "redirect_blocked")
                test_case.assertEqual(raised.exception.failure.upstream_status, status)
            self.assertEqual(TargetHandler.calls, 0)
            self.assertEqual(TargetHandler.authorization_headers, [])
        finally:
            for server, thread in ((redirect, redirect_thread), (target, target_thread)):
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)
                self.assertFalse(thread.is_alive())
