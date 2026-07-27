import asyncio
import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable, Coroutine
from threading import Lock
from typing import Annotated, Literal
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

logger = logging.getLogger(__name__)
app = FastAPI(title="IMAGINEv1 Backend")

# Frontend and backend run on separate local ports during development.
DEFAULT_ALLOWED_ORIGIN_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|\[::1\]|"
    r"10\.\d+\.\d+\.\d+|"
    r"192\.168\.\d+\.\d+|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+"
    r")(:\d+)?$"
)
allowed_origin_regex = (
    os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    or DEFAULT_ALLOWED_ORIGIN_REGEX
)
try:
    allowed_origin_pattern = re.compile(allowed_origin_regex)
except re.error:
    logger.warning(
        "Ignoring invalid CORS_ALLOW_ORIGIN_REGEX and using local defaults."
    )
    allowed_origin_regex = DEFAULT_ALLOWED_ORIGIN_REGEX
    allowed_origin_pattern = re.compile(allowed_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=allowed_origin_regex,
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


generation_rate_limiter = SlidingWindowRateLimiter()
visual_status_rate_limiter = SlidingWindowRateLimiter(limit=480)
transcription_status_rate_limiter = SlidingWindowRateLimiter(limit=4)
transcription_connection_rate_limiter = SlidingWindowRateLimiter(limit=12)
visual_jobs: dict[str, dict[str, object]] = {}
visual_batches: dict[str, dict[str, object]] = {}
visual_jobs_lock = Lock()
visual_tasks: set[asyncio.Task[None]] = set()
transcription_sessions: defaultdict[str, int] = defaultdict(int)
transcription_sessions_lock = Lock()

VISUAL_JOB_TTL_SECONDS = 10 * 60
VISUAL_JOB_MAX_ENTRIES = 256
MAX_TRANSCRIPTION_SESSIONS_PER_CLIENT = 2
TRANSCRIPTION_SESSION_TIMEOUT_SECONDS = 10 * 60


def is_allowed_browser_origin(origin: str | None) -> bool:
    """Allow non-browser clients and configured browser origins only."""
    return not origin or allowed_origin_pattern.fullmatch(origin) is not None


def acquire_transcription_session(client_key: str) -> bool:
    with transcription_sessions_lock:
        if (
            transcription_sessions[client_key]
            >= MAX_TRANSCRIPTION_SESSIONS_PER_CLIENT
        ):
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


def sweep_visual_state_locked(now: float | None = None) -> None:
    """Expire stale batches and bound retained terminal visual-job state."""
    current_time = time.monotonic() if now is None else now
    cutoff = current_time - VISUAL_JOB_TTL_SECONDS

    for batch_id, batch in list(visual_batches.items()):
        updated_at = batch.get("updatedAt")
        if isinstance(updated_at, (int, float)) and updated_at <= cutoff:
            pending_job_ids = batch.get("pendingJobIds")
            if isinstance(pending_job_ids, set):
                for pending_job_id in pending_job_ids:
                    job = visual_jobs.get(pending_job_id)
                    if job and job.get("status") == "pending":
                        job.update(
                            {
                                "status": "failed",
                                "visual": None,
                                "warning": "The visual request expired.",
                                "updatedAt": current_time,
                            }
                        )
            visual_batches.pop(batch_id, None)

    expired_job_ids = [
        job_id
        for job_id, job in visual_jobs.items()
        if job.get("status") != "pending"
        and isinstance(job.get("updatedAt"), (int, float))
        and float(job["updatedAt"]) <= cutoff
    ]
    for job_id in expired_job_ids:
        visual_jobs.pop(job_id, None)

    excess_count = len(visual_jobs) - VISUAL_JOB_MAX_ENTRIES
    if excess_count > 0:
        terminal_jobs = sorted(
            (
                (job_id, job)
                for job_id, job in visual_jobs.items()
                if job.get("status") != "pending"
            ),
            key=lambda entry: float(entry[1].get("updatedAt", 0.0)),
        )
        for job_id, _ in terminal_jobs[:excess_count]:
            visual_jobs.pop(job_id, None)


def track_visual_task(coroutine: Coroutine[object, object, None]) -> None:
    task = asyncio.create_task(coroutine)
    visual_tasks.add(task)

    def discard_completed_task(completed_task: asyncio.Task[None]) -> None:
        visual_tasks.discard(completed_task)
        if not completed_task.cancelled():
            completed_task.exception()

    task.add_done_callback(discard_completed_task)


class GenerateRequest(BaseModel):
    userInput: str = Field(..., min_length=1, max_length=4000)


class BlockComponent(BaseModel):
    type: Literal["block"]
    id: str
    heading: str
    description: str


class RoundComponent(BaseModel):
    type: Literal["round"]
    id: str
    heading: str
    description: str


class BlockLineComponent(BaseModel):
    type: Literal["blockLine"]
    id: str
    blocks: list[BlockComponent]


class TreeNode(BaseModel):
    id: str
    heading: str
    description: str
    children: list["TreeNode"]


class VennRegion(BaseModel):
    heading: str
    items: list[str]


class PiePortion(BaseModel):
    heading: str
    proportion: float


class DiagramBase(BaseModel):
    version: Literal[3]
    title: str
    description: str


class FlowchartDiagram(DiagramBase):
    type: Literal["flowchart"]
    lines: list[BlockLineComponent]


class TreeDiagram(DiagramBase):
    type: Literal["tree"]
    root: TreeNode


class VennDiagram(DiagramBase):
    type: Literal["vennDiagram"]
    left: VennRegion
    right: VennRegion
    similar: VennRegion


class PieChartDiagram(DiagramBase):
    type: Literal["pieChart"]
    portions: list[PiePortion]


class MindMapDiagram(DiagramBase):
    type: Literal["mindMap"]
    center: RoundComponent
    surrounding: list[RoundComponent]


StructuredDiagram = Annotated[
    FlowchartDiagram
    | TreeDiagram
    | VennDiagram
    | PieChartDiagram
    | MindMapDiagram,
    Field(discriminator="type"),
]


class GeneratedVisual(BaseModel):
    kind: Literal["diagram", "generated"]
    alt: str
    diagram: StructuredDiagram | None = None
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
    failure_reason: str | None = None
    try:
        visual = await gemini_pipeline.generate_visual(
            visual_strategy,
            visual_prompt,
            visual_alt,
        )
    except GeminiProviderError:
        logger.exception("The AI provider failed visual job %s.", job_id)
        visual = None
        failure_reason = "The AI provider could not complete the visual request."
    except Exception:
        logger.exception("Unexpected failure in visual job %s.", job_id)
        visual = None
        failure_reason = "An unexpected visual-generation error occurred."

    warning = None
    if visual is None:
        warning = "The notes are ready, but the visual could not be generated."
        if failure_reason:
            warning = f"{warning} {failure_reason}"

    cache_payload: tuple[str, dict[str, object]] | None = None
    now = time.monotonic()
    with visual_jobs_lock:
        visual_jobs[job_id] = {
            "status": "complete" if visual is not None else "failed",
            "blockId": block_id,
            "visual": visual,
            "warning": warning,
            "updatedAt": now,
        }
        batch = visual_batches.get(batch_id)
        if batch:
            result = batch.get("result")
            pending_job_ids = batch.get("pendingJobIds")
            batch["updatedAt"] = now
            if visual is None:
                batch["failed"] = True
            if isinstance(result, dict):
                blocks = result.get("blocks")
                if isinstance(blocks, list):
                    for block in blocks:
                        if (
                            isinstance(block, dict)
                            and block.get("blockId") == block_id
                        ):
                            if visual is not None:
                                block["visual"] = visual
                            else:
                                block["visualFailed"] = True
                            block["visualJobId"] = None
                            break
                if warning:
                    result["warning"] = warning
            if isinstance(pending_job_ids, set):
                pending_job_ids.discard(job_id)
                if not pending_job_ids and isinstance(result, dict):
                    if not batch.get("failed"):
                        cache_payload = (user_input, result)
                    visual_batches.pop(batch_id, None)

        sweep_visual_state_locked(now)

    if cache_payload is not None:
        await asyncio.to_thread(
            gemini_pipeline.cache_result,
            cache_payload[0],
            cache_payload[1],
        )


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
            "apiKeyMessage": "Deepgram key validation returned an error.",
        }
    except (TimeoutError, urllib.error.URLError):
        return {
            "apiKeyStatus": "unreachable",
            "apiKeyValid": False,
            "apiKeyMessage": "Deepgram could not be reached for key validation.",
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
        logger.exception("The AI provider failed a generation request.")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not complete the generation request.",
        ) from error
    except Exception as error:
        logger.exception("Unexpected generation failure.")
        raise HTTPException(
            status_code=500,
            detail="The generation request failed unexpectedly.",
        ) from error

    visual_requests = result.pop("_visualRequests", [])
    pending_job_ids: set[str] = set()
    visual_task_arguments: list[tuple[str, str, str, str, str]] = []
    batch_id = uuid.uuid4().hex
    now = time.monotonic()

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
            visual_task_arguments.append(
                (
                    job_id,
                    block_id,
                    str(visual_strategy),
                    visual_prompt,
                    visual_alt,
                )
            )
            blocks = result.get("blocks")
            if isinstance(blocks, list):
                for block in blocks:
                    if (
                        isinstance(block, dict)
                        and block.get("blockId") == block_id
                    ):
                        block["visualJobId"] = job_id
                        break

    if pending_job_ids:
        with visual_jobs_lock:
            sweep_visual_state_locked(now)
            for job_id, block_id, _, _, _ in visual_task_arguments:
                visual_jobs[job_id] = {
                    "status": "pending",
                    "blockId": block_id,
                    "visual": None,
                    "warning": None,
                    "updatedAt": now,
                }
            visual_batches[batch_id] = {
                "userInput": user_input,
                "result": result,
                "pendingJobIds": pending_job_ids,
                "failed": False,
                "updatedAt": now,
            }

        for (
            job_id,
            block_id,
            visual_strategy,
            visual_prompt,
            visual_alt,
        ) in visual_task_arguments:
            track_visual_task(
                run_visual_job(
                    job_id,
                    batch_id,
                    block_id,
                    user_input,
                    visual_strategy,
                    visual_prompt,
                    visual_alt,
                )
            )
    else:
        await asyncio.to_thread(gemini_pipeline.cache_result, user_input, result)

    return GenerateResponse(**result)


@app.get("/api/visual/{job_id}", response_model=VisualJobResponse)
def visual_job_status(job_id: str, request: Request) -> VisualJobResponse:
    client_key = request.client.host if request.client else "unknown"
    if not visual_status_rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=429,
            detail="Too many visual-status requests. Please wait and try again.",
        )
    with visual_jobs_lock:
        sweep_visual_state_locked()
        job = visual_jobs.get(job_id)
        job_snapshot = dict(job) if job is not None else None
    if job_snapshot is None:
        raise HTTPException(status_code=404, detail="Visual job was not found.")
    return VisualJobResponse(**job_snapshot)


@app.get("/api/transcribe/status")
def transcribe_status(
    request: Request,
    checkKey: bool = False,
) -> dict[str, str | bool]:
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
        client_key = request.client.host if request.client else "unknown"
        if not transcription_status_rate_limiter.allow(client_key):
            raise HTTPException(
                status_code=429,
                detail="Too many transcription-key checks. Please wait and try again.",
            )
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
            await websocket.send_json(
                {
                    "type": "Error",
                    "message": "Speech transcription is not configured.",
                }
            )
            await websocket.close(code=1011)
            return

        query = urlencode(get_deepgram_options())

        async def relay_transcription() -> None:
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
                await websocket.send_json(
                    {"type": "Status", "status": "connected"}
                )

                async def browser_to_deepgram() -> None:
                    while True:
                        message = await websocket.receive()

                        audio_chunk = message.get("bytes")
                        if audio_chunk:
                            await deepgram.send(audio_chunk)
                            continue

                        if message.get("text") == "__stop__":
                            await deepgram.send(
                                json.dumps({"type": "CloseStream"})
                            )
                            break

                async def deepgram_to_browser() -> None:
                    async for message in deepgram:
                        await websocket.send_text(message)

                tasks = {
                    asyncio.create_task(browser_to_deepgram()),
                    asyncio.create_task(deepgram_to_browser()),
                }
                try:
                    done, pending = await asyncio.wait(
                        tasks,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in done:
                        task.result()
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)

        try:
            await asyncio.wait_for(
                relay_transcription(),
                timeout=TRANSCRIPTION_SESSION_TIMEOUT_SECONDS,
            )
        except WebSocketDisconnect:
            return
        except TimeoutError:
            await websocket.send_json(
                {
                    "type": "Error",
                    "message": "The transcription session reached its time limit.",
                }
            )
            await websocket.close(code=1000)
        except websockets.exceptions.InvalidStatus:
            logger.exception("Deepgram rejected a websocket handshake.")
            await websocket.send_json(
                {
                    "type": "Error",
                    "message": (
                        "The speech provider rejected the connection. Check "
                        "the API key, account access, and model settings."
                    ),
                }
            )
            await websocket.close(code=1011)
        except Exception:
            logger.exception("Unexpected transcription streaming failure.")
            try:
                await websocket.send_json(
                    {
                        "type": "Error",
                        "message": "Speech transcription failed unexpectedly.",
                    }
                )
            except RuntimeError:
                pass
            try:
                await websocket.close(code=1011)
            except RuntimeError:
                pass
    finally:
        release_transcription_session(client_key)
