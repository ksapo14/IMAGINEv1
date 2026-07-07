import asyncio
import json
import os
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
from typing import Literal
from urllib.parse import urlencode
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
import websockets
from dotenv import load_dotenv

from .services.gemini_pipeline import (
    GeminiConfigurationError,
    GeminiPipeline,
    GeminiProviderError,
)

load_dotenv()

app = FastAPI(title="IMAGINEv1 Backend")

# Frontend and backend run on separate local ports during development.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv("CORS_ALLOW_ORIGIN_REGEX")
    or (
        r"^https?://("
        r"localhost|127\.0\.0\.1|\[::1\]|"
        r"10\.\d+\.\d+\.\d+|"
        r"192\.168\.\d+\.\d+|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+"
        r")(:\d+)?$"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEEPGRAM_AUTH_TOKEN_URL = "https://api.deepgram.com/v1/auth/token"
DEEPGRAM_FLUX_LISTEN_URL = "wss://api.deepgram.com/v2/listen"
gemini_pipeline = GeminiPipeline()


class SlidingWindowRateLimiter:
    def __init__(
        self,
        limit: int = 10,
        window_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.clock = clock
        self.requests: defaultdict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()

    def allow(self, client_key: str) -> bool:
        now = self.clock()
        cutoff = now - self.window_seconds

        with self.lock:
            recent = self.requests[client_key]
            while recent and recent[0] <= cutoff:
                recent.popleft()

            if len(recent) >= self.limit:
                return False

            recent.append(now)
            return True


generation_rate_limiter = SlidingWindowRateLimiter()
visual_jobs: dict[str, dict[str, object]] = {}
visual_batches: dict[str, dict[str, object]] = {}
visual_jobs_lock = Lock()


class GenerateRequest(BaseModel):
    userInput: str = Field(..., min_length=1, max_length=4000)


class GeneratedVisual(BaseModel):
    kind: Literal["diagram", "generated"]
    alt: str
    html: str | None = None
    dataUrl: str | None = None
    mimeType: str | None = None


class CompositionTheme(BaseModel):
    palette: Literal["slate", "sage", "ember", "indigo", "mono"]
    density: Literal["compact", "comfortable", "spacious"]
    motion: Literal["subtle", "none"]


class CompositionBlock(BaseModel):
    blockId: str
    kind: Literal[
        "heading",
        "notes",
        "callout",
        "diagram",
        "image",
        "comparison",
        "timeline",
    ]
    title: str
    body: str
    items: list[str]
    size: Literal["compact", "medium", "large", "wide"]
    visual: GeneratedVisual | None = None
    visualJobId: str | None = None


class GenerateResponse(BaseModel):
    title: str
    layoutMode: Literal[
        "textDominant",
        "visualDominant",
        "balanced",
        "sequence",
        "comparison",
    ]
    theme: CompositionTheme
    blocks: list[CompositionBlock]
    warning: str | None


class VisualJobResponse(BaseModel):
    status: Literal["pending", "complete", "failed"]
    blockId: str
    visual: GeneratedVisual | None = None
    warning: str | None = None


async def run_visual_job(
    job_id: str,
    batch_id: str,
    block_id: str,
    user_input: str,
    visual_strategy: str,
    visual_prompt: str,
    visual_alt: str,
) -> None:
    visual = await gemini_pipeline.generate_visual(
        visual_strategy,
        visual_prompt,
        visual_alt,
    )
    if visual is None:
        with visual_jobs_lock:
            visual_jobs[job_id] = {
                "status": "failed",
                "blockId": block_id,
                "visual": None,
                "warning": "The notes are ready, but the visual could not be generated.",
            }
            batch = visual_batches.get(batch_id)
            if batch:
                pending_job_ids = batch.get("pendingJobIds")
                if isinstance(pending_job_ids, set):
                    pending_job_ids.discard(job_id)
                    if not pending_job_ids:
                        visual_batches.pop(batch_id, None)
        return

    with visual_jobs_lock:
        visual_jobs[job_id] = {
            "status": "complete",
            "blockId": block_id,
            "visual": visual,
            "warning": None,
        }
        batch = visual_batches.get(batch_id)
        if batch:
            result = batch.get("result")
            pending_job_ids = batch.get("pendingJobIds")
            if isinstance(result, dict):
                blocks = result.get("blocks")
                if isinstance(blocks, list):
                    for block in blocks:
                        if (
                            isinstance(block, dict)
                            and block.get("blockId") == block_id
                        ):
                            block["visual"] = visual
                            block["visualJobId"] = None
                            break
            if isinstance(pending_job_ids, set):
                pending_job_ids.discard(job_id)
                if not pending_job_ids and isinstance(result, dict):
                    gemini_pipeline.cache_result(user_input, result)
                    visual_batches.pop(batch_id, None)


def get_deepgram_api_key() -> str:
    return os.getenv("DEEPGRAM_API_KEY", "").strip()


def get_deepgram_options() -> dict[str, str]:
    """Options for Deepgram Flux turn-based transcription.

    Browser MediaRecorder sends WebM/Opus in a container, so encoding and
    sample_rate should be omitted.
    """
    options = {
        "model": os.getenv("DEEPGRAM_MODEL", "flux-general-en"),
        "eot_threshold": os.getenv("DEEPGRAM_EOT_THRESHOLD", "0.7"),
        "eot_timeout_ms": os.getenv("DEEPGRAM_EOT_TIMEOUT_MS", "1500"),
    }

    language_hint = os.getenv("DEEPGRAM_LANGUAGE_HINT", "").strip()
    if language_hint:
        options["language_hint"] = language_hint

    return options


def check_deepgram_api_key(timeout_seconds: float = 8.0) -> dict[str, str | bool]:
    api_key = get_deepgram_api_key()

    if not api_key:
        return {
            "apiKeyStatus": "missing",
            "apiKeyValid": False,
            "apiKeyMessage": "DEEPGRAM_API_KEY is not configured in .env.",
        }

    request = urllib.request.Request(
        DEEPGRAM_AUTH_TOKEN_URL,
        headers={"Authorization": f"Token {api_key}"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            response.read()
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            return {
                "apiKeyStatus": "invalid",
                "apiKeyValid": False,
                "apiKeyMessage": (
                    "Deepgram rejected DEEPGRAM_API_KEY. Replace the key or "
                    "check the key's project permissions."
                ),
            }

        return {
            "apiKeyStatus": "error",
            "apiKeyValid": False,
            "apiKeyMessage": (
                "Deepgram key validation returned "
                f"HTTP {error.code}: {error.reason}."
            ),
        }
    except (TimeoutError, urllib.error.URLError) as error:
        return {
            "apiKeyStatus": "unreachable",
            "apiKeyValid": False,
            "apiKeyMessage": (
                "Could not reach Deepgram to validate DEEPGRAM_API_KEY: "
                f"{error}."
            ),
        }

    return {
        "apiKeyStatus": "valid",
        "apiKeyValid": True,
        "apiKeyMessage": "Deepgram accepted DEEPGRAM_API_KEY.",
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_content(
    payload: GenerateRequest,
    request: Request,
) -> GenerateResponse:
    """Generate a composed note canvas and schedule useful visuals."""
    user_input = payload.userInput.strip()
    if not user_input:
        raise HTTPException(status_code=422, detail="Input cannot be empty.")

    client_key = request.client.host if request.client else "unknown"
    if not generation_rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=429,
            detail="Too many generation requests. Please wait and try again.",
        )

    try:
        result = await gemini_pipeline.generate(user_input)
    except GeminiConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except GeminiProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    visual_requests = result.pop("_visualRequests", [])
    pending_job_ids: set[str] = set()
    batch_id = uuid.uuid4().hex

    if isinstance(visual_requests, list):
        for visual_request in visual_requests:
            if not isinstance(visual_request, dict):
                continue
            block_id = visual_request.get("blockId")
            visual_strategy = visual_request.get("visualStrategy")
            visual_prompt = visual_request.get("visualPrompt")
            visual_alt = visual_request.get("visualAlt")
            if (
                not isinstance(block_id, str)
                or visual_strategy not in {"diagram", "image"}
                or not isinstance(visual_prompt, str)
                or not isinstance(visual_alt, str)
            ):
                continue

            job_id = uuid.uuid4().hex
            pending_job_ids.add(job_id)
            blocks = result.get("blocks")
            if isinstance(blocks, list):
                for block in blocks:
                    if (
                        isinstance(block, dict)
                        and block.get("blockId") == block_id
                    ):
                        block["visualJobId"] = job_id
                        break

            with visual_jobs_lock:
                visual_jobs[job_id] = {
                    "status": "pending",
                    "blockId": block_id,
                    "visual": None,
                    "warning": None,
                }
            asyncio.create_task(
                run_visual_job(
                    job_id,
                    batch_id,
                    block_id,
                    user_input,
                    str(visual_strategy),
                    visual_prompt,
                    visual_alt,
                )
            )

    if pending_job_ids:
        with visual_jobs_lock:
            visual_batches[batch_id] = {
                "userInput": user_input,
                "result": result,
                "pendingJobIds": pending_job_ids,
            }
    else:
        gemini_pipeline.cache_result(user_input, result)

    return GenerateResponse(**result)


@app.get("/api/visual/{job_id}", response_model=VisualJobResponse)
def visual_job_status(job_id: str) -> VisualJobResponse:
    with visual_jobs_lock:
        job = visual_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Visual job was not found.")
    return VisualJobResponse(**job)


@app.get("/api/transcribe/status")
def transcribe_status(checkKey: bool = False) -> dict[str, str | bool]:
    """Expose non-secret Deepgram setup status for demo diagnostics."""
    options = get_deepgram_options()
    status: dict[str, str | bool] = {
        "configured": bool(get_deepgram_api_key()),
        "mode": "flux-turn-based",
        "listenEndpoint": "/v2/listen",
        "model": options["model"],
        "eotThreshold": options["eot_threshold"],
        "eotTimeoutMs": options["eot_timeout_ms"],
        "apiKeyStatus": "not_checked",
        "apiKeyValid": False,
        "apiKeyMessage": "Key validation was not requested.",
    }

    if "language_hint" in options:
        status["languageHint"] = options["language_hint"]

    if checkKey:
        status.update(check_deepgram_api_key())

    return status


@app.websocket("/api/transcribe")
async def transcribe_stream(websocket: WebSocket) -> None:
    """Proxy browser microphone audio to Deepgram without exposing the API key."""
    await websocket.accept()

    api_key = get_deepgram_api_key()
    if not api_key:
        await websocket.send_json(
            {
                "type": "Error",
                "message": "DEEPGRAM_API_KEY is not configured in .env.",
            }
        )
        await websocket.close(code=1011)
        return

    query = urlencode(get_deepgram_options())

    try:
        await websocket.send_json(
            {"type": "Status", "status": "connecting_to_deepgram"}
        )
        async with websockets.connect(
            f"{DEEPGRAM_FLUX_LISTEN_URL}?{query}",
            additional_headers={"Authorization": f"Token {api_key}"},
            max_size=None,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=5,
            proxy=None,
        ) as deepgram:
            await websocket.send_json({"type": "Status", "status": "connected"})

            async def browser_to_deepgram() -> None:
                try:
                    while True:
                        message = await websocket.receive()

                        audio_chunk = message.get("bytes")
                        if audio_chunk:
                            await deepgram.send(audio_chunk)
                            continue

                        control_message = message.get("text")
                        if control_message == "__stop__":
                            await deepgram.send(json.dumps({"type": "CloseStream"}))
                            break
                except WebSocketDisconnect:
                    pass

            async def deepgram_to_browser() -> None:
                async for message in deepgram:
                    await websocket.send_text(message)

            tasks = {
                asyncio.create_task(browser_to_deepgram()),
                asyncio.create_task(deepgram_to_browser()),
            }
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

            for task in done:
                task.result()
    except WebSocketDisconnect:
        return
    except websockets.exceptions.InvalidStatus as error:
        try:
            await websocket.send_json(
                {
                    "type": "Error",
                    "message": (
                        "Deepgram rejected the websocket handshake. Check "
                        "DEEPGRAM_API_KEY, account access, and model settings. "
                        f"Status: {getattr(error.response, 'status_code', 'unknown')}"
                    ),
                }
            )
        except RuntimeError:
            pass
        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass
    except Exception as error:
        try:
            await websocket.send_json(
                {
                    "type": "Error",
                    "message": (
                        "Deepgram streaming failed. Check internet access, "
                        "firewall/proxy settings, and the API key. "
                        f"Details: {type(error).__name__}: {error}"
                    ),
                }
            )
        except RuntimeError:
            pass
        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass
