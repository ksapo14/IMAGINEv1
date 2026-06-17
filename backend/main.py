import asyncio
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlencode

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
import websockets
from dotenv import load_dotenv

from .services.ai_pipeline import ImaginePipeline

load_dotenv()

app = FastAPI(title="IMAGINEv1 AI Backend")

# Frontend and backend run on separate local ports during development.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = ImaginePipeline()
DEEPGRAM_AUTH_TOKEN_URL = "https://api.deepgram.com/v1/auth/token"
DEEPGRAM_FLUX_LISTEN_URL = "wss://api.deepgram.com/v2/listen"


class GenerateRequest(BaseModel):
    teacherSpeech: str = Field(..., min_length=1, max_length=4000)
    textOnly: bool = False


class GenerateResponse(BaseModel):
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str


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


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_frame(request: GenerateRequest) -> GenerateResponse:
    """Process one teacher input chunk into one classroom output frame."""
    clean_input = request.teacherSpeech.strip()

    if not clean_input:
        raise HTTPException(status_code=400, detail="teacherSpeech is required.")

    try:
        result = await pipeline.generate(clean_input, text_only=request.textOnly)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return GenerateResponse(**result)


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
