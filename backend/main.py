"""FastAPI boundary for pitch decisions and Deepgram transcription."""

import asyncio
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from collections.abc import Callable
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import urlencode
import urllib.error
import urllib.request

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, model_validator
import websockets

from .services.function_gemma import FunctionGemmaConfigurationError, FunctionGemmaProviderError, FunctionGemmaService

FUNCTION_GEMMA_ENV_KEYS = (
    "FUNCTION_GEMMA_RUNTIME",
    "FUNCTION_GEMMA_LOCAL_PYTHON",
    "FUNCTION_GEMMA_LOCAL_STARTUP_TIMEOUT_SECONDS",
    "FUNCTION_GEMMA_LOCAL_INFERENCE_TIMEOUT_SECONDS",
    "FUNCTION_GEMMA_BASE_URL",
    "FUNCTION_GEMMA_MODEL",
    "FUNCTION_GEMMA_API_KEY",
)


def load_function_gemma_environment(root: Path) -> None:
    """Apply .env.local over .env without letting either replace process settings."""
    process_values = {key: os.environ[key] for key in FUNCTION_GEMMA_ENV_KEYS if key in os.environ}
    load_dotenv(root / ".env", override=False)
    load_dotenv(root / ".env.local", override=True)
    os.environ.update(process_values)


# Resolve from the repository root so native startup and backend-directory
# startup share config. Per-machine .env.local stays ignored by Git.
load_function_gemma_environment(Path(__file__).resolve().parents[1])
logger = logging.getLogger(__name__)
app = FastAPI(title="IMAGINEv1 Backend")


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    """Keep FastAPI validation internals and submitted request data out of 422 bodies."""
    return JSONResponse(status_code=422, content={"detail": {"code": "invalid_request", "message": "Request data is invalid."}})

DEFAULT_ALLOWED_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$"
allowed_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip() or DEFAULT_ALLOWED_ORIGIN_REGEX
try:
    allowed_origin_pattern = re.compile(allowed_origin_regex)
except re.error:
    logger.warning("Ignoring invalid CORS_ALLOW_ORIGIN_REGEX and using local defaults.")
    allowed_origin_regex = DEFAULT_ALLOWED_ORIGIN_REGEX
    allowed_origin_pattern = re.compile(allowed_origin_regex)

app.add_middleware(CORSMiddleware, allow_origin_regex=allowed_origin_regex, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

DEEPGRAM_AUTH_TOKEN_URL = "https://api.deepgram.com/v1/auth/token"
DEEPGRAM_FLUX_LISTEN_URL = "wss://api.deepgram.com/v2/listen"
MAX_TRANSCRIPTION_SESSIONS_PER_CLIENT = 2
TRANSCRIPTION_SESSION_TIMEOUT_SECONDS = 10 * 60
function_gemma = FunctionGemmaService()
# Configuration is checked at startup, but readiness is deliberately not probed:
# the model server is external and may be started after this backend.
function_gemma.startup_warning()


@app.on_event("shutdown")
def close_function_gemma() -> None:
    """Stop the optional local model worker during FastAPI reload and shutdown."""
    function_gemma.close()


class SlidingWindowRateLimiter:
    """Keep unauthenticated browser routes bounded per client address."""

    def __init__(self, limit: int = 50, window_seconds: float = 60.0, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.clock = clock
        self.requests: defaultdict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()
        self.next_prune_at = self.clock()

    def allow(self, client_key: str) -> bool:
        now = self.clock()
        cutoff = now - self.window_seconds
        with self.lock:
            if now >= self.next_prune_at:
                for key, timestamps in list(self.requests.items()):
                    while timestamps and timestamps[0] <= cutoff:
                        timestamps.popleft()
                    if not timestamps:
                        self.requests.pop(key, None)
                self.next_prune_at = now + self.window_seconds
            recent = self.requests[client_key]
            while recent and recent[0] <= cutoff:
                recent.popleft()
            if len(recent) >= self.limit:
                return False
            recent.append(now)
            return True


pitch_decision_rate_limiter = SlidingWindowRateLimiter(limit=50)
pitch_status_rate_limiter = SlidingWindowRateLimiter(limit=10)
transcription_status_rate_limiter = SlidingWindowRateLimiter(limit=50)
transcription_connection_rate_limiter = SlidingWindowRateLimiter(limit=50)
transcription_sessions: defaultdict[str, int] = defaultdict(int)
transcription_sessions_lock = Lock()


class PitchSlide(BaseModel):
    """The compact semantic deck description supplied to FunctionGemma."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    title: str = Field(..., min_length=1, max_length=240)
    description: str = Field(..., min_length=1, max_length=1000)


class PitchDecisionRequest(BaseModel):
    """One finalized speech turn and the deck the model may address."""

    model_config = ConfigDict(extra="forbid")
    latestUtterance: str = Field(..., min_length=1, max_length=4000)
    currentSlide: PitchSlide
    availableSlides: list[PitchSlide] = Field(..., min_length=1, max_length=40)

    @model_validator(mode="after")
    def validate_deck(self) -> "PitchDecisionRequest":
        slide_ids = [slide.id for slide in self.availableSlides]
        if len(slide_ids) != len(set(slide_ids)):
            raise ValueError("Available slides must have unique IDs.")
        if self.currentSlide.id not in slide_ids:
            raise ValueError("The current slide must be included in available slides.")
        return self


class PitchDecisionResponse(BaseModel):
    """The only model proposals that may leave the backend."""

    model_config = ConfigDict(extra="forbid")
    action: Literal["goto_slide", "no_action"]
    slide_id: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_action(self) -> "PitchDecisionResponse":
        if self.action == "goto_slide" and self.slide_id is None:
            raise ValueError("goto_slide requires a slide_id.")
        if self.action == "no_action" and self.slide_id is not None:
            raise ValueError("no_action cannot include a slide_id.")
        return self


def is_allowed_browser_origin(origin: str | None) -> bool:
    """Allow non-browser clients and configured browser origins only."""
    return not origin or allowed_origin_pattern.fullmatch(origin) is not None


def acquire_transcription_session(client_key: str) -> bool:
    with transcription_sessions_lock:
        if transcription_sessions[client_key] >= MAX_TRANSCRIPTION_SESSIONS_PER_CLIENT:
            return False
        transcription_sessions[client_key] += 1
        return True


def release_transcription_session(client_key: str) -> None:
    with transcription_sessions_lock:
        remaining = transcription_sessions.get(client_key, 0) - 1
        if remaining > 0:
            transcription_sessions[client_key] = remaining
        else:
            transcription_sessions.pop(client_key, None)


def get_deepgram_api_key() -> str:
    return os.getenv("DEEPGRAM_API_KEY", "").strip()


def get_deepgram_options() -> dict[str, str]:
    """Build Flux turn-boundary options for browser WebM/Opus audio."""
    options = {"model": os.getenv("DEEPGRAM_MODEL", "flux-general-en"), "eot_threshold": os.getenv("DEEPGRAM_EOT_THRESHOLD", "0.7"), "eot_timeout_ms": os.getenv("DEEPGRAM_EOT_TIMEOUT_MS", "1500")}
    language_hint = os.getenv("DEEPGRAM_LANGUAGE_HINT", "").strip()
    if language_hint:
        options["language_hint"] = language_hint
    return options


def check_deepgram_api_key(timeout_seconds: float = 8.0) -> dict[str, str | bool]:
    """Check the configured key without returning it to the browser."""
    api_key = get_deepgram_api_key()
    if not api_key:
        return {"apiKeyStatus": "missing", "apiKeyValid": False, "apiKeyMessage": "DEEPGRAM_API_KEY is not configured in .env."}
    request = urllib.request.Request(DEEPGRAM_AUTH_TOKEN_URL, headers={"Authorization": f"Token {api_key}"}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            response.read()
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            return {"apiKeyStatus": "invalid", "apiKeyValid": False, "apiKeyMessage": "Deepgram rejected DEEPGRAM_API_KEY. Replace the key or check the key's project permissions."}
        return {"apiKeyStatus": "error", "apiKeyValid": False, "apiKeyMessage": "Deepgram key validation returned an error."}
    except (TimeoutError, urllib.error.URLError):
        return {"apiKeyStatus": "unreachable", "apiKeyValid": False, "apiKeyMessage": "Deepgram could not be reached for key validation."}
    return {"apiKeyStatus": "valid", "apiKeyValid": True, "apiKeyMessage": "Deepgram accepted DEEPGRAM_API_KEY."}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


def pitch_error_detail(category: str) -> dict[str, str]:
    """Map internal diagnostics to the small, stable browser error contract."""
    messages = {
        "configuration_error": ("function_gemma_configuration", "Slide decisions are not configured."),
        "connection_refused": ("function_gemma_runtime_unavailable", "Slide decisions are unavailable because FunctionGemma is not running."),
        "dns_error": ("function_gemma_runtime_unavailable", "Slide decisions cannot reach FunctionGemma."),
        "tls_error": ("function_gemma_runtime_unavailable", "Slide decisions cannot reach FunctionGemma."),
        "timeout": ("function_gemma_timeout", "Slide decisions timed out."),
        "transport_error": ("function_gemma_runtime_unavailable", "Slide decisions cannot reach FunctionGemma."),
        "authentication_rejected": ("function_gemma_auth_rejected", "Slide decisions were rejected by FunctionGemma."),
        "endpoint_not_found": ("function_gemma_endpoint_invalid", "Slide decisions could not find the FunctionGemma endpoint."),
        "redirect_blocked": ("function_gemma_redirect_blocked", "Slide decisions rejected an unexpected FunctionGemma redirect."),
        "bad_request": ("function_gemma_protocol_error", "Slide decisions are incompatible with FunctionGemma."),
        "unprocessable_request": ("function_gemma_protocol_error", "Slide decisions are incompatible with FunctionGemma."),
        "rate_limited": ("function_gemma_busy", "Slide decisions are temporarily busy."),
        "busy": ("function_gemma_busy", "Slide decisions are temporarily busy."),
        "python_unavailable": ("function_gemma_local_python_unavailable", "Local FunctionGemma Python is unavailable."),
        "dependency_missing": ("function_gemma_local_dependency_missing", "Local FunctionGemma dependencies are unavailable."),
        "cache_missing": ("function_gemma_local_cache_missing", "The local FunctionGemma model cache is unavailable."),
        "load_failure": ("function_gemma_local_load_failure", "Local FunctionGemma could not load its model."),
        "inference_failure": ("function_gemma_local_inference_failed", "Local FunctionGemma could not make a slide decision."),
        "protocol_error": ("function_gemma_protocol_error", "Slide decisions are incompatible with FunctionGemma."),
        "worker_crashed": ("function_gemma_local_runtime_unavailable", "Local FunctionGemma stopped unexpectedly."),
        "runtime_closed": ("function_gemma_local_runtime_unavailable", "Local FunctionGemma is restarting."),
        "upstream_server_error": ("function_gemma_upstream_error", "Slide decisions are temporarily unavailable."),
    }
    code, message = messages.get(category, ("function_gemma_unavailable", "Slide decisions are unavailable."))
    return {"code": code, "message": message}


def pitch_error_status(category: str) -> int:
    """Use 503 for unreachable dependencies and 502 for invalid upstream replies."""
    if category in {"configuration_error", "connection_refused", "dns_error", "tls_error", "timeout", "transport_error", "rate_limited", "busy", "upstream_server_error", "python_unavailable", "dependency_missing", "cache_missing", "load_failure", "inference_failure", "worker_crashed", "runtime_closed"}:
        return 503
    return 502


@app.get("/api/pitch/status")
def pitch_status(request: Request, probe: bool = False) -> dict[str, str | bool | int | None]:
    """Expose cached FunctionGemma readiness; probing is explicit and rate-limited."""
    if probe:
        client_key = request.client.host if request.client else "unknown"
        if not pitch_status_rate_limiter.allow(client_key):
            raise HTTPException(status_code=429, detail={"code": "pitch_status_rate_limited", "message": "Too many readiness checks. Please wait and try again."})
    return function_gemma.status(probe=probe)


@app.post("/api/pitch/decide", response_model=PitchDecisionResponse, response_model_exclude_none=True)
async def decide_pitch_slide(payload: PitchDecisionRequest, request: Request) -> PitchDecisionResponse:
    """Ask the selected FunctionGemma runtime for one safe slide proposal."""
    if not payload.latestUtterance.strip():
        raise HTTPException(status_code=422, detail={"code": "invalid_utterance", "message": "A completed utterance is required."})
    client_key = request.client.host if request.client else "unknown"
    if not pitch_decision_rate_limiter.allow(client_key):
        raise HTTPException(status_code=429, detail={"code": "pitch_decision_rate_limited", "message": "Too many slide-decision requests. Please wait and try again."})
    try:
        decision = await function_gemma.decide(payload.latestUtterance.strip(), payload.currentSlide.model_dump(mode="json"), [slide.model_dump(mode="json") for slide in payload.availableSlides])
        response = PitchDecisionResponse.model_validate(decision)
    except FunctionGemmaConfigurationError as error:
        raise HTTPException(status_code=pitch_error_status(error.failure.category), detail=pitch_error_detail(error.failure.category)) from None
    except FunctionGemmaProviderError as error:
        raise HTTPException(status_code=pitch_error_status(error.failure.category), detail=pitch_error_detail(error.failure.category)) from None
    if response.slide_id and response.slide_id not in {slide.id for slide in payload.availableSlides}:
        raise HTTPException(status_code=502, detail={"code": "function_gemma_invalid_decision", "message": "Slide decisions returned an unavailable slide."})
    return response


@app.get("/api/transcribe/status")
def transcribe_status(request: Request, checkKey: bool = False) -> dict[str, str | bool]:
    """Expose non-secret Deepgram setup status for demo diagnostics."""
    options = get_deepgram_options()
    status: dict[str, str | bool] = {"configured": bool(get_deepgram_api_key()), "mode": "flux-turn-based", "listenEndpoint": "/v2/listen", "model": options["model"], "eotThreshold": options["eot_threshold"], "eotTimeoutMs": options["eot_timeout_ms"], "apiKeyStatus": "not_checked", "apiKeyValid": False, "apiKeyMessage": "Key validation was not requested."}
    if "language_hint" in options:
        status["languageHint"] = options["language_hint"]
    if checkKey:
        client_key = request.client.host if request.client else "unknown"
        if not transcription_status_rate_limiter.allow(client_key):
            raise HTTPException(status_code=429, detail="Too many transcription-key checks. Please wait and try again.")
        status.update(check_deepgram_api_key())
    return status


@app.websocket("/api/transcribe")
async def transcribe_stream(websocket: WebSocket) -> None:
    """Proxy browser microphone audio to Deepgram without exposing the API key."""
    origin = websocket.headers.get("origin")
    if not is_allowed_browser_origin(origin):
        await websocket.close(code=1008, reason="Origin is not allowed.")
        return
    client_key = websocket.client.host if websocket.client else "unknown"
    if not transcription_connection_rate_limiter.allow(client_key):
        await websocket.close(code=1013, reason="Too many connection attempts.")
        return
    if not acquire_transcription_session(client_key):
        await websocket.close(code=1013, reason="Too many active sessions.")
        return
    try:
        await websocket.accept()
        api_key = get_deepgram_api_key()
        if not api_key:
            await websocket.send_json({"type": "Error", "message": "Speech transcription is not configured."})
            await websocket.close(code=1011)
            return
        query = urlencode(get_deepgram_options())

        async def relay_transcription() -> None:
            await websocket.send_json({"type": "Status", "status": "connecting_to_deepgram"})
            async with websockets.connect(f"{DEEPGRAM_FLUX_LISTEN_URL}?{query}", additional_headers={"Authorization": f"Token {api_key}"}, max_size=None, ping_interval=20, ping_timeout=20, close_timeout=5, proxy=None) as deepgram:
                await websocket.send_json({"type": "Status", "status": "connected"})

                async def browser_to_deepgram() -> None:
                    while True:
                        message = await websocket.receive()
                        audio_chunk = message.get("bytes")
                        if audio_chunk:
                            await deepgram.send(audio_chunk)
                            continue
                        if message.get("text") == "__stop__":
                            await deepgram.send(json.dumps({"type": "CloseStream"}))
                            break

                async def deepgram_to_browser() -> None:
                    async for message in deepgram:
                        await websocket.send_text(message)

                tasks = {asyncio.create_task(browser_to_deepgram()), asyncio.create_task(deepgram_to_browser())}
                try:
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        task.result()
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)

        try:
            await asyncio.wait_for(relay_transcription(), timeout=TRANSCRIPTION_SESSION_TIMEOUT_SECONDS)
        except WebSocketDisconnect:
            return
        except TimeoutError:
            await websocket.send_json({"type": "Error", "message": "The transcription session reached its time limit."})
            await websocket.close(code=1000)
        except websockets.exceptions.InvalidStatus:
            logger.exception("Deepgram rejected a websocket handshake.")
            await websocket.send_json({"type": "Error", "message": "The speech provider rejected the connection. Check the API key, account access, and model settings."})
            await websocket.close(code=1011)
        except Exception:
            logger.exception("Unexpected transcription streaming failure.")
            try:
                await websocket.send_json({"type": "Error", "message": "Speech transcription failed unexpectedly."})
            except RuntimeError:
                pass
            try:
                await websocket.close(code=1011)
            except RuntimeError:
                pass
    finally:
        release_transcription_session(client_key)
