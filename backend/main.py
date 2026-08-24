import asyncio
import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Callable, Coroutine
from threading import Lock
from typing import Literal
from urllib.parse import urlencode
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationInfo, model_validator
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
from .services.whiteboard_grid import FOOTPRINTS, promote_footprint
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
        limit: int = 50,
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


generation_rate_limiter = SlidingWindowRateLimiter(limit=50)
visual_status_rate_limiter = SlidingWindowRateLimiter(limit=480)
transcription_status_rate_limiter = SlidingWindowRateLimiter(limit=50)
transcription_connection_rate_limiter = SlidingWindowRateLimiter(limit=50)
visual_jobs: dict[str, dict[str, object]] = {}
visual_jobs_lock = Lock()
visual_tasks: set[asyncio.Task[None]] = set()
image_job_semaphore = asyncio.Semaphore(2)
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

    for job in visual_jobs.values():
        updated_at = job.get("updatedAt")
        if (
            job.get("status") == "pending"
            and isinstance(updated_at, (int, float))
            and updated_at <= cutoff
        ):
            job.update(
                {
                    "status": "failed",
                    "generatedAsset": None,
                    "warning": "The optional image request expired.",
                    "updatedAt": current_time,
                }
            )

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
    mode: Literal["live", "prepare"] = "live"
    turnSequence: int = Field(default=0, ge=0)
    lessonContext: "LessonContext" = Field(default_factory=lambda: LessonContext())
    recentTurns: list["RecentTurn"] = Field(default_factory=list, max_length=6)
    concepts: list["ConceptContext"] = Field(default_factory=list, max_length=24)
    board: "BoardContext" = Field(default_factory=lambda: BoardContext())

    @model_validator(mode="after")
    def validate_recent_turn_budget(self) -> "GenerateRequest":
        total = sum(
            len(turn.userInput) + len(turn.conceptKey) + len(turn.summary)
            for turn in self.recentTurns
        )
        if total > 2400:
            raise ValueError("recentTurns may contain at most 2400 characters.")
        return self


class LessonContext(BaseModel):
    title: str = Field(default="", max_length=160)
    subject: str = Field(default="", max_length=120)
    source: str = Field(default="", max_length=3600)


class RecentTurn(BaseModel):
    turnSequence: int = Field(default=0, ge=0)
    userInput: str = Field(default="", max_length=2400)
    action: Literal["hold", "create", "update"] = "hold"
    conceptKey: str = Field(default="", max_length=80)
    summary: str = Field(default="", max_length=320)


class ConceptContext(BaseModel):
    conceptKey: str = Field(..., min_length=1, max_length=80)
    title: str = Field(default="", max_length=120)
    summary: str = Field(default="", max_length=320)
    sceneId: str = Field(default="", max_length=80)


class BoardPlacement(BaseModel):
    page: int = Field(..., ge=1, le=48)
    column: int = Field(..., ge=0, le=23)
    row: int = Field(..., ge=0, le=13)
    width: int = Field(..., ge=1, le=24)
    height: int = Field(..., ge=1, le=14)

    @model_validator(mode="after")
    def validate_bounds(self) -> "BoardPlacement":
        if self.column + self.width > 24 or self.row + self.height > 14:
            raise ValueError("Scene placement must remain inside the board grid.")
        if (self.width, self.height) not in FOOTPRINTS.values():
            raise ValueError("Scene placement must use a presentation footprint.")
        return self


class BoardSceneContext(BaseModel):
    sceneId: str = Field(..., min_length=1, max_length=80)
    conceptKey: str = Field(default="", max_length=80)
    title: str = Field(default="", max_length=120)
    headingMode: Literal["show", "inheritPrimary"] = "show"
    contentModes: list[Literal["visual", "notes", "diagram"]] = Field(
        min_length=1,
        max_length=3,
    )
    placement: BoardPlacement

    @model_validator(mode="after")
    def validate_modes(self) -> "BoardSceneContext":
        if len(set(self.contentModes)) != len(self.contentModes):
            raise ValueError("contentModes must be unique and ordered.")
        return self


class BoardContext(BaseModel):
    version: int = Field(default=0, ge=0)
    currentPage: int = Field(default=1, ge=1, le=48)
    columns: Literal[24] = 24
    rows: Literal[14] = 14
    scenes: list[BoardSceneContext] = Field(default_factory=list, max_length=48)

    @model_validator(mode="after")
    def validate_scene_reservations(self) -> "BoardContext":
        scene_ids = [scene.sceneId for scene in self.scenes]
        if len(set(scene_ids)) != len(scene_ids):
            raise ValueError("Board scene IDs must be unique.")
        for index, scene in enumerate(self.scenes):
            for sibling in self.scenes[index + 1:]:
                first = scene.placement
                second = sibling.placement
                if first.page != second.page:
                    continue
                separated = (
                    first.column + first.width < second.column
                    or second.column + second.width < first.column
                    or first.row + first.height < second.row
                    or second.row + second.height < first.row
                )
                if not separated:
                    raise ValueError("Board scene placements must not overlap.")
        return self


class StickEntity(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    type: Literal["stickFigure", "circle", "rectangle"]
    x: int = Field(..., ge=0, le=11)
    y: int = Field(..., ge=0, le=7)
    width: int = Field(..., ge=1, le=12)
    height: int = Field(..., ge=1, le=8)
    label: str = Field(default="", max_length=32)
    pose: Literal["neutral", "pointing", "walking", "holding", "raisedArms"]
    facing: Literal["left", "right", "front"]

    @model_validator(mode="after")
    def validate_geometry_and_identity(self) -> "StickEntity":
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", self.id):
            raise ValueError("Stick entity IDs must be safe identifiers.")
        if self.x + self.width > 12 or self.y + self.height > 8:
            raise ValueError("Stick entities must remain inside the 12 by 8 grid.")
        return self


class StickConnection(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    fromId: str = Field(..., min_length=1, max_length=40)
    toId: str = Field(..., min_length=1, max_length=40)
    label: str = Field(default="", max_length=28)
    direction: Literal["forward", "backward", "both", "none"]

    @model_validator(mode="after")
    def validate_identity(self) -> "StickConnection":
        for identifier in (self.id, self.fromId, self.toId):
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", identifier):
                raise ValueError("Stick connection IDs must be safe identifiers.")
        return self


class StickScene(BaseModel):
    version: Literal[1]
    columns: Literal[12]
    rows: Literal[8]
    entities: list[StickEntity] = Field(min_length=1, max_length=6)
    connections: list[StickConnection] = Field(max_length=6)

    @model_validator(mode="after")
    def validate_scene_graph(self) -> "StickScene":
        entity_ids = [entity.id for entity in self.entities]
        if len(set(entity_ids)) != len(entity_ids):
            raise ValueError("Stick entity IDs must be unique.")
        for index, entity in enumerate(self.entities):
            for sibling in self.entities[index + 1:]:
                separated = (
                    entity.x + entity.width <= sibling.x
                    or sibling.x + sibling.width <= entity.x
                    or entity.y + entity.height <= sibling.y
                    or sibling.y + sibling.height <= entity.y
                )
                if not separated:
                    raise ValueError("Stick entities must not overlap.")

        connection_ids = [connection.id for connection in self.connections]
        if len(set(connection_ids)) != len(connection_ids):
            raise ValueError("Stick connection IDs must be unique.")
        retained_ids = set(entity_ids)
        for connection in self.connections:
            if (
                connection.fromId == connection.toId
                or connection.fromId not in retained_ids
                or connection.toId not in retained_ids
            ):
                raise ValueError("Stick connections must reference two retained entities.")
        return self


class GeneratedAsset(BaseModel):
    dataUrl: str = Field(min_length=1, max_length=20_000_100)
    mimeType: Literal["image/jpeg", "image/png", "image/webp"]
    alt: str = Field(min_length=1, max_length=320)

    @model_validator(mode="after")
    def validate_data_url(self) -> "GeneratedAsset":
        prefix = f"data:{self.mimeType};base64,"
        payload = self.dataUrl[len(prefix):] if self.dataUrl.startswith(prefix) else ""
        if (
            not payload
            or len(payload) % 4 != 0
            or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", payload)
        ):
            raise ValueError("Generated assets must use a bounded base64 data URL.")
        if not self.alt.strip():
            raise ValueError("Generated assets require descriptive alternative text.")
        return self


class GenerateResponse(BaseModel):
    boardVersion: int = Field(ge=0)
    turnSequence: int = Field(ge=0)
    boardStrategy: Literal["integrate", "reset"]
    action: Literal["create", "update"]
    conceptKey: str = Field(max_length=80)
    title: str = Field(max_length=100)
    headingMode: Literal["show", "inheritPrimary"]
    summaryBullets: list[str] = Field(max_length=4)
    summary: str = Field(max_length=320)
    contentModes: list[Literal["visual", "notes", "diagram"]] = Field(max_length=3)
    confidence: float = Field(ge=0, le=1)
    sceneId: str = Field(min_length=1, max_length=80)
    targetSceneId: str | None = Field(max_length=80)
    requestedFootprint: Literal["small", "medium", "wide", "full"]
    placement: BoardPlacement
    stickScene: StickScene | None
    renderMode: Literal["structured", "generatedAsset"]
    generatedAsset: GeneratedAsset | None = None
    visualJobId: str | None = None
    warning: str | None = Field(default=None, max_length=360)

    @model_validator(mode="before")
    @classmethod
    def validate_internal_image_fields(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> object:
        """Inspect internal/extra image prompt fields before Pydantic drops them."""
        if (
            isinstance(value, dict)
            and info.context
            and info.context.get("allow_internal_image_request")
        ):
            image_request = value.get("_imageRequest")
            needs_request = (
                value.get("renderMode") == "generatedAsset"
                and value.get("generatedAsset") is None
                and value.get("visualJobId") is None
            )
            if needs_request:
                if not isinstance(image_request, dict) or set(image_request) != {
                    "imagePrompt",
                    "visualAlt",
                }:
                    raise ValueError("Internal generated visuals require a complete image request.")
                image_prompt = image_request.get("imagePrompt")
                visual_alt = image_request.get("visualAlt")
                if (
                    not isinstance(image_prompt, str)
                    or not image_prompt.strip()
                    or image_prompt != image_prompt.strip()
                    or len(image_prompt) > 800
                    or not isinstance(visual_alt, str)
                    or not visual_alt.strip()
                    or visual_alt != visual_alt.strip()
                    or len(visual_alt) > 320
                ):
                    raise ValueError("Internal image prompts and alt text must be trimmed and bounded.")
            elif image_request is not None:
                raise ValueError("Only pending generated visuals may include an internal image request.")
        return value

    @model_validator(mode="after")
    def validate_action_contract(self, info: ValidationInfo) -> "GenerateResponse":
        """Reject incomplete or contradictory decisions at the API boundary."""
        if self.boardStrategy == "reset" and (
            self.action != "create"
            or self.targetSceneId is not None
            or self.placement.page != 1
            or self.headingMode != "show"
        ):
            raise ValueError("RESET must create one headed, untargeted scene on board page 1.")
        if (
            not re.fullmatch(r"[a-z0-9_-]+", self.conceptKey)
            or not self.title.strip()
            or not self.summary.strip()
        ):
            raise ValueError("CREATE and UPDATE require a title and summary metadata.")
        if not self.contentModes or len(set(self.contentModes)) != len(self.contentModes):
            raise ValueError("contentModes must be a unique non-empty ordered list.")
        has_notes = "notes" in self.contentModes
        if has_notes != bool(self.summaryBullets):
            raise ValueError("summaryBullets are required exactly when notes mode is selected.")
        if any(
            not bullet.strip()
            or bullet != bullet.strip()
            or len(bullet) > 120
            for bullet in self.summaryBullets
        ):
            raise ValueError("summaryBullets must contain 1 to 4 concise items.")
        has_diagram = "diagram" in self.contentModes
        has_structured_visual = (
            "visual" in self.contentModes and self.renderMode == "structured"
        )
        if (has_diagram or has_structured_visual) != (self.stickScene is not None):
            raise ValueError(
                "stickScene is required for diagrams and structured visuals only."
            )
        if self.stickScene is not None and not self.stickScene.entities:
            raise ValueError("Diagram mode requires a non-empty StickScene.")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", self.sceneId):
            raise ValueError("sceneId must be a safe bounded identifier.")
        if self.action == "create" and self.targetSceneId is not None:
            raise ValueError("CREATE cannot target an existing scene.")
        if self.action == "update" and (
            self.targetSceneId is None
            or self.targetSceneId != self.sceneId
            or not re.fullmatch(r"[a-zA-Z0-9_-]+", self.targetSceneId)
        ):
            raise ValueError("UPDATE must preserve and target the same scene identity.")
        effective = promote_footprint(self.requestedFootprint, self.contentModes)
        if effective != self.requestedFootprint or (
            self.placement.width,
            self.placement.height,
        ) != FOOTPRINTS[effective]:
            raise ValueError("The placement must match the effective content footprint.")
        if "visual" not in self.contentModes and (
            self.renderMode != "structured"
            or self.generatedAsset is not None
            or self.visualJobId is not None
        ):
            raise ValueError("Only visual mode may request or retain image work.")
        if "visual" in self.contentModes and self.renderMode == "structured" and (
            self.generatedAsset is not None or self.visualJobId is not None
        ):
            raise ValueError("Structured visual mode cannot retain image work.")
        if {"visual", "diagram"}.issubset(set(self.contentModes)) and self.renderMode != "generatedAsset":
            raise ValueError("Combined visual and diagram scenes require a generated visual asset.")
        if self.visualJobId is not None and (
            len(self.visualJobId) > 80
            or not re.fullmatch(r"[a-zA-Z0-9_-]+", self.visualJobId)
        ):
            raise ValueError("visualJobId must be a safe bounded identifier.")
        if self.renderMode == "generatedAsset":
            has_asset = self.generatedAsset is not None
            has_job = self.visualJobId is not None
            allow_internal = bool(
                info.context and info.context.get("allow_internal_image_request")
            )
            if has_asset and has_job:
                raise ValueError("Generated visual responses cannot contain both an asset and a job.")
            if not has_asset and not has_job and not allow_internal:
                raise ValueError("Generated visual responses require one asset or visual job.")
        return self


class VisualJobResponse(BaseModel):
    status: Literal["pending", "complete", "failed"]
    sceneId: str
    generatedAsset: GeneratedAsset | None = None
    warning: str | None = None


async def run_visual_job(
    job_id: str,
    scene_id: str,
    image_prompt: str,
    visual_alt: str,
) -> None:
    """Run bounded image work without allowing failure to undo a scene decision."""
    try:
        async with image_job_semaphore:
            asset = await gemini_pipeline.generate_visual(
                "image",
                image_prompt,
                visual_alt,
            )
    except Exception:
        logger.exception("The AI provider failed visual job %s.", job_id)
        asset = None

    warning = None
    if asset is None:
        warning = "The structured scene is ready, but its optional image could not be generated."
    now = time.monotonic()
    with visual_jobs_lock:
        visual_jobs[job_id] = {
            "status": "complete" if asset is not None else "failed",
            "sceneId": scene_id,
            "generatedAsset": asset,
            "warning": warning,
            "updatedAt": now,
        }
        sweep_visual_state_locked(now)


async def schedule_visual_generation(result: dict[str, object]) -> None:
    """Reserve the job after board placement exists and before work is started."""
    image_request = result.pop("_imageRequest", None)
    if (
        not isinstance(image_request, dict)
        or not isinstance(result.get("placement"), dict)
        or "visual" not in result.get("contentModes", [])
    ):
        return
    image_prompt = image_request.get("imagePrompt")
    visual_alt = image_request.get("visualAlt")
    scene_id = result.get("sceneId")
    if not all(isinstance(value, str) and value for value in (image_prompt, visual_alt, scene_id)):
        return

    job_id = uuid.uuid4().hex
    now = time.monotonic()
    with visual_jobs_lock:
        sweep_visual_state_locked(now)
        visual_jobs[job_id] = {
            "status": "pending",
            "sceneId": scene_id,
            "generatedAsset": None,
            "warning": None,
            "updatedAt": now,
        }
    result["visualJobId"] = job_id
    track_visual_task(run_visual_job(job_id, scene_id, image_prompt, visual_alt))


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
    """Direct one teaching turn and schedule its optional image fallback."""
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
        result = await gemini_pipeline.generate(
            user_input,
            payload.mode,
            payload.model_dump(exclude={"userInput", "mode"}, mode="json"),
        )
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

    GenerateResponse.model_validate(
        result,
        context={"allow_internal_image_request": True},
    )
    await schedule_visual_generation(result)
    return GenerateResponse(**result)


def encode_generation_event(event: dict[str, object]) -> str:
    return json.dumps(event, separators=(",", ":")) + "\n"


async def stream_generation_events(
    user_input: str,
    mode: Literal["live", "prepare"] = "live",
    context: dict[str, object] | None = None,
) -> AsyncIterator[str]:
    try:
        async for event in gemini_pipeline.generate_stream(user_input, mode, context):
            if event.get("type") == "result":
                raw_result = event.get("result")
                if not isinstance(raw_result, dict):
                    raise GeminiProviderError(
                        "The AI provider returned an unexpected response."
                    )
                GenerateResponse.model_validate(
                    raw_result,
                    context={"allow_internal_image_request": True},
                )
                await schedule_visual_generation(raw_result)
                response = GenerateResponse(**raw_result)
                yield encode_generation_event(
                    {
                        "type": "result",
                        "result": response.model_dump(mode="json"),
                    }
                )
                yield encode_generation_event({"type": "done"})
                return
            if event.get("type") == "text_delta":
                if mode == "prepare":
                    continue
                text_delta = event.get("text")
                if isinstance(text_delta, str) and text_delta:
                    yield encode_generation_event(
                        {"type": "text_delta", "text": text_delta}
                    )
    except GeminiConfigurationError:
        yield encode_generation_event(
            {
                "type": "error",
                "message": "AI text generation is not configured.",
            }
        )
    except GeminiProviderError:
        logger.exception("The AI provider failed a streaming generation request.")
        yield encode_generation_event(
            {
                "type": "error",
                "message": (
                    "The AI provider could not complete the generation request."
                ),
            }
        )
    except Exception:
        logger.exception("Unexpected streaming generation failure.")
        yield encode_generation_event(
            {
                "type": "error",
                "message": "The generation request failed unexpectedly.",
            }
        )


@app.post("/api/generate/stream")
async def generate_content_stream(
    payload: GenerateRequest,
    request: Request,
) -> StreamingResponse:
    """Return the atomic whiteboard decision through the NDJSON endpoint."""
    user_input = payload.userInput.strip()
    if not user_input:
        raise HTTPException(status_code=422, detail="Input cannot be empty.")

    client_key = request.client.host if request.client else "unknown"
    if not generation_rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=429,
            detail="Too many generation requests. Please wait and try again.",
        )

    return StreamingResponse(
        stream_generation_events(
            user_input,
            payload.mode,
            payload.model_dump(exclude={"userInput", "mode"}, mode="json"),
        ),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"},
    )


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
