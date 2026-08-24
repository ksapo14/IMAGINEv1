"""Server-only Gemini transport and the cumulative whiteboard decision pipeline."""

import asyncio
import base64
import binascii
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import AsyncIterator, Callable
from typing import Any

from .visual_director_prompt import (
    VISUAL_DIRECTOR_RESPONSE_SCHEMA,
    VISUAL_DIRECTOR_SYSTEM_INSTRUCTION,
)
from .whiteboard_intent import WhiteboardIntent, classify_whiteboard_intent
from .whiteboard_grid import allocate_placement, promote_footprint, repair_stick_scene


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TEXT_MODEL = "gemini-3.7-flash"
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"
TEXT_REQUEST_TIMEOUT_SECONDS = 30.0
IMAGE_REQUEST_TIMEOUT_SECONDS = 90.0
MAX_IMAGE_BASE64_CHARACTERS = 20_000_000
MAX_BOARD_SCENES = 48
SUPPORTED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
GENERATION_MODES = {"live", "prepare"}
IMAGE_STYLE_PREFIX = (
    "Create a sparse monochrome black or neutral outline drawing grounded only "
    "in the supplied facts, on a white or transparent background. Use simple "
    "stick figures when people are needed. Use no color fills, gradients, "
    "decorative density, embedded text, words, letters, numbers, labels, "
    "captions, signs, watermarks, text-like marks, or photorealism. "
)

JsonTransport = Callable[[urllib.request.Request, float], dict[str, Any]]


def _environment_model(name: str, default: str) -> str:
    """Use a nonblank model override or the stable production default."""
    return os.getenv(name, "").strip() or default


class GeminiConfigurationError(RuntimeError):
    """Raised when server-only Gemini configuration is missing."""


class GeminiProviderError(RuntimeError):
    """Raised when Gemini cannot return a usable response."""


def _clean_provider_error_text(value: Any, maximum_characters: int = 360) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum_characters].strip()


def _http_error_context(error: urllib.error.HTTPError) -> str:
    """Extract a bounded diagnostic for server logs without exposing keys."""
    status = _clean_provider_error_text(getattr(error, "reason", ""))
    message = ""
    try:
        body = error.read(4096)
    except (OSError, ValueError):
        body = b""

    if body:
        try:
            parsed = json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            message = _clean_provider_error_text(body.decode("utf-8", errors="replace"))
        else:
            provider_error = parsed.get("error") if isinstance(parsed, dict) else None
            if isinstance(provider_error, dict):
                status = _clean_provider_error_text(provider_error.get("status")) or status
                message = _clean_provider_error_text(provider_error.get("message"))
            elif isinstance(parsed, dict):
                message = _clean_provider_error_text(parsed.get("message"))

    details = f"HTTP {error.code}"
    if status:
        details += f" {status}"
    if message:
        details += f": {message}"
    return details


def _default_json_transport(
    request: urllib.request.Request,
    timeout_seconds: float,
) -> dict[str, Any]:
    """Perform one Gemini REST request and normalize provider failures."""
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        context = _http_error_context(error)
        if error.code == 429:
            raise GeminiProviderError(
                f"AI generation is temporarily quota-limited. {context}."
            ) from error
        if error.code in {401, 403}:
            raise GeminiProviderError(
                "AI generation is not available with the server configuration. "
                f"{context}."
            ) from error
        raise GeminiProviderError(
            f"The AI provider could not complete the request. {context}."
        ) from error
    except (TimeoutError, urllib.error.URLError) as error:
        raise GeminiProviderError("The AI provider did not respond in time.") from error

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GeminiProviderError(
            "The AI provider returned an unreadable response."
        ) from error
    if not isinstance(parsed, dict):
        raise GeminiProviderError("The AI provider returned an unexpected response.")
    return parsed


def _candidate_parts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Read candidate parts from both text and image Gemini responses."""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise GeminiProviderError("The AI provider returned no result.")
    candidate = candidates[0]
    content = candidate.get("content") if isinstance(candidate, dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise GeminiProviderError("The AI provider returned no content.")
    return [part for part in parts if isinstance(part, dict)]


def _parse_json_object(text: str, subject: str) -> dict[str, Any]:
    """Parse JSON-only output while tolerating a provider-added JSON fence."""
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, flags=re.DOTALL)
    if fenced:
        stripped = fenced.group(1)
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as error:
        raise GeminiProviderError(
            f"The AI provider returned malformed {subject}."
        ) from error
    if not isinstance(parsed, dict):
        raise GeminiProviderError(f"The AI provider returned malformed {subject}.")
    return parsed


def _clean_string(value: Any, maximum_characters: int) -> str:
    """Collapse whitespace and bound all model-authored strings."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum_characters].strip()


def _concept_key(value: Any, fallback: str = "") -> str:
    cleaned = _clean_string(value, 80).lower().replace(" ", "-")
    cleaned = re.sub(r"[^a-z0-9_-]+", "", cleaned)
    return cleaned or fallback


def _bounded_summary_bullets(value: Any) -> list[str]:
    """Normalize the first-class notes payload without deriving missing copy."""
    if not isinstance(value, list) or len(value) > 4:
        return []
    bullets = [_clean_string(item, 120) for item in value]
    return bullets if all(bullets) else []


def _content_modes(value: Any) -> list[str]:
    """Accept only a non-empty ordered subset with no repeated modes."""
    if not isinstance(value, list) or not 1 <= len(value) <= 3:
        raise GeminiProviderError("The AI provider returned invalid content modes.")
    allowed = {"visual", "notes", "diagram"}
    if any(mode not in allowed for mode in value) or len(set(value)) != len(value):
        raise GeminiProviderError("The AI provider returned invalid content modes.")
    return list(value)


def _bounded_context(context: Any) -> dict[str, Any]:
    """Apply API limits again for direct pipeline callers and stable prompts."""
    source = context if isinstance(context, dict) else {}
    lesson = source.get("lessonContext")
    lesson_data = lesson if isinstance(lesson, dict) else {}
    bounded_lesson = {
        "title": _clean_string(lesson_data.get("title"), 160),
        "subject": _clean_string(lesson_data.get("subject"), 120),
        "source": _clean_string(lesson_data.get("source"), 3600),
    }

    recent_turns: list[dict[str, Any]] = []
    remaining_turn_characters = 2400
    raw_turns = source.get("recentTurns")
    for raw_turn in (raw_turns[-6:] if isinstance(raw_turns, list) else []):
        if not isinstance(raw_turn, dict) or remaining_turn_characters <= 0:
            continue
        text = _clean_string(raw_turn.get("userInput"), remaining_turn_characters)
        remaining_turn_characters -= len(text)
        concept_key = _concept_key(raw_turn.get("conceptKey"))[:remaining_turn_characters]
        remaining_turn_characters -= len(concept_key)
        summary = _clean_string(raw_turn.get("summary"), remaining_turn_characters)
        remaining_turn_characters -= len(summary)
        recent_turns.append(
            {
                "turnSequence": max(0, _as_int(raw_turn.get("turnSequence"), 0)),
                "userInput": text,
                "action": raw_turn.get("action")
                if raw_turn.get("action") in {"hold", "create", "update"}
                else "hold",
                "conceptKey": concept_key,
                "summary": summary,
            }
        )

    concepts: list[dict[str, Any]] = []
    raw_concepts = source.get("concepts")
    for raw in (raw_concepts[:24] if isinstance(raw_concepts, list) else []):
        if not isinstance(raw, dict):
            continue
        concepts.append(
            {
                "conceptKey": _concept_key(raw.get("conceptKey")),
                "title": _clean_string(raw.get("title"), 120),
                "summary": _clean_string(raw.get("summary"), 320),
                "sceneId": _clean_string(raw.get("sceneId"), 80),
            }
        )

    board = source.get("board")
    board_data = board if isinstance(board, dict) else {}
    scenes: list[dict[str, Any]] = []
    raw_scenes = board_data.get("scenes")
    for raw in (raw_scenes[:48] if isinstance(raw_scenes, list) else []):
        if not isinstance(raw, dict):
            continue
        placement = raw.get("placement")
        if not isinstance(placement, dict):
            continue
        scenes.append(
            {
                "sceneId": _clean_string(raw.get("sceneId"), 80),
                "conceptKey": _concept_key(raw.get("conceptKey")),
                "title": _clean_string(raw.get("title"), 120),
                "headingMode": raw.get("headingMode")
                if raw.get("headingMode") in {"show", "inheritPrimary"}
                else "show",
                "contentModes": [
                    mode for mode in raw.get("contentModes", [])
                    if mode in {"visual", "notes", "diagram"}
                ] if isinstance(raw.get("contentModes"), list) else [],
                "placement": {
                    "page": _as_int(placement.get("page"), 0),
                    "column": _as_int(placement.get("column"), -1),
                    "row": _as_int(placement.get("row"), -1),
                    "width": _as_int(placement.get("width"), 0),
                    "height": _as_int(placement.get("height"), 0),
                },
            }
        )

    return {
        "turnSequence": max(0, _as_int(source.get("turnSequence"), 0)),
        "lessonContext": bounded_lesson,
        "recentTurns": recent_turns,
        "concepts": concepts,
        "board": {
            "version": max(0, _as_int(board_data.get("version"), 0)),
            "currentPage": min(48, max(1, _as_int(board_data.get("currentPage"), 1))),
            "columns": 24,
            "rows": 14,
            "scenes": scenes,
        },
    }


def _as_int(value: Any, fallback: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else fallback


class GeminiPipeline:
    """Make one Visual Director decision, plus an optional independent image."""

    def __init__(
        self,
        *,
        text_api_key: str | None = None,
        image_api_key: str | None = None,
        text_model: str | None = None,
        image_model: str | None = None,
        transport: JsonTransport | None = None,
        **_: Any,
    ) -> None:
        self.text_api_key = (
            text_api_key if text_api_key is not None else os.getenv("PROD_GEMINI_API_KEY", "")
        ).strip()
        self.image_api_key = (
            image_api_key if image_api_key is not None else os.getenv("PROD_GEMINI_API_KEY", "")
        ).strip()
        self.text_model = (
            text_model
            if text_model is not None
            else _environment_model("GEMINI_TEXT_MODEL", DEFAULT_TEXT_MODEL)
        ).strip()
        self.image_model = (
            image_model
            if image_model is not None
            else _environment_model("GEMINI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
        ).strip()
        self.transport = transport or _default_json_transport

    async def generate(
        self,
        user_input: str,
        mode: str = "live",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return a normalized decision with collision-free placement."""
        self._ensure_text_configuration()
        self._ensure_generation_mode(mode)
        bounded = _bounded_context(context)
        explicit_intent = classify_whiteboard_intent(user_input)
        return await asyncio.to_thread(
            self._generate_decision,
            user_input,
            bounded,
            explicit_intent,
        )

    async def generate_stream(
        self,
        user_input: str,
        mode: str = "live",
        context: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Preserve NDJSON behavior; structured decisions are emitted atomically."""
        result = await self.generate(user_input, mode, context)
        yield {"type": "result", "result": result}

    async def generate_visual(
        self,
        visual_strategy: str,
        visual_prompt: str,
        visual_alt: str,
    ) -> dict[str, Any] | None:
        """Generate an optional server-side image; structured scenes need no job."""
        if visual_strategy != "image" or not self.image_api_key or not self.image_model:
            return None
        try:
            return await asyncio.to_thread(
                self._generate_image,
                visual_prompt,
                visual_alt,
            )
        except GeminiProviderError:
            return None

    def cache_result(self, *_: Any, **__: Any) -> None:
        """Compatibility no-op: contextual live decisions must never be cached."""

    def _ensure_text_configuration(self) -> None:
        if not self.text_api_key or not self.text_model:
            raise GeminiConfigurationError("AI text generation is not configured.")

    @staticmethod
    def _ensure_generation_mode(mode: str) -> None:
        if mode not in GENERATION_MODES:
            raise ValueError(f"Unsupported generation mode: {mode}")

    def _generate_decision(
        self,
        user_input: str,
        context: dict[str, Any],
        explicit_intent: WhiteboardIntent,
    ) -> dict[str, Any]:
        payload = {
            "systemInstruction": {
                "parts": [{"text": VISUAL_DIRECTOR_SYSTEM_INSTRUCTION}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "userInput": _clean_string(user_input, 4000),
                                    "explicitIntent": explicit_intent.prompt_contract(),
                                    **context,
                                },
                                separators=(",", ":"),
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 2400,
                "thinkingConfig": {"thinkingLevel": "medium"},
                "responseMimeType": "application/json",
                "responseSchema": VISUAL_DIRECTOR_RESPONSE_SCHEMA,
            },
        }
        response = self._request_model(
            self.text_model,
            self.text_api_key,
            payload,
            TEXT_REQUEST_TIMEOUT_SECONDS,
        )
        text = "".join(
            part.get("text", "")
            for part in _candidate_parts(response)
            if isinstance(part.get("text"), str)
        )
        if not text:
            raise GeminiProviderError("The AI provider returned no decision.")
        return self._normalize_decision(
            _parse_json_object(text, "Visual Director data"),
            context,
            explicit_intent,
        )

    def _normalize_decision(
        self,
        raw: dict[str, Any],
        context: dict[str, Any],
        explicit_intent: WhiteboardIntent,
    ) -> dict[str, Any]:
        model_board_strategy = raw.get("boardStrategy")
        if model_board_strategy not in {"integrate", "reset"}:
            raise GeminiProviderError("The AI provider returned an invalid board strategy.")
        model_action = raw.get("action")
        if model_action not in {"create", "update"}:
            raise GeminiProviderError("The AI provider returned an invalid action.")
        board = context["board"]
        turn_sequence = context["turnSequence"]
        board_version = board["version"]

        # Explicit create/update cues are educator-owned commands. Otherwise a
        # model-selected reset resolves identity and placement against a blank
        # effective board while the durable version remains monotonic.
        board_strategy = (
            "integrate" if explicit_intent.action is not None else model_board_strategy
        )
        effective_board = board if board_strategy == "integrate" else {
            "version": board_version,
            "currentPage": 1,
            "columns": 24,
            "rows": 14,
            "scenes": [],
        }
        effective_concepts = context["concepts"] if board_strategy == "integrate" else []
        effective_recent_turns = context["recentTurns"] if board_strategy == "integrate" else []

        concept_key = _concept_key(raw.get("conceptKey"))
        title = _clean_string(raw.get("title"), 100)
        summary = _clean_string(raw.get("summary"), 320)
        model_modes = _content_modes(raw.get("contentModes"))
        if explicit_intent.required_modes:
            content_modes = list(explicit_intent.required_modes)
        else:
            content_modes = [
                mode for mode in model_modes
                if mode not in explicit_intent.forbidden_modes
            ]
        if not content_modes:
            available_bullets = _bounded_summary_bullets(raw.get("summaryBullets"))
            if "visual" not in explicit_intent.forbidden_modes:
                content_modes = ["visual"]
            elif "notes" not in explicit_intent.forbidden_modes and available_bullets:
                content_modes = ["notes"]
            else:
                raise GeminiProviderError(
                    "The AI provider did not return a mode allowed by the explicit request."
                )
        modes_adjusted = content_modes != model_modes
        summary_bullets = _bounded_summary_bullets(raw.get("summaryBullets"))
        if "notes" in content_modes:
            if not 1 <= len(summary_bullets) <= 4:
                raise GeminiProviderError(
                    "The AI provider returned incomplete summary bullets."
                )
        else:
            if summary_bullets and not modes_adjusted:
                raise GeminiProviderError(
                    "The AI provider returned unselected summary bullets."
                )
            summary_bullets = []
        confidence = raw.get("confidence")
        if (
            not concept_key
            or not title
            or not summary
            or not isinstance(confidence, (int, float))
        ):
            raise GeminiProviderError("The AI provider returned incomplete decision data.")
        confidence_value = min(1.0, max(0.0, float(confidence)))
        requested = raw.get("requestedFootprint")
        if requested not in {"small", "medium", "wide", "full"}:
            raise GeminiProviderError("The AI provider returned an invalid footprint.")
        requested = promote_footprint(requested, content_modes)
        model_heading_mode = raw.get("headingMode")
        if model_heading_mode not in {"show", "inheritPrimary"}:
            raise GeminiProviderError("The AI provider returned an invalid heading mode.")
        scene_layout = raw.get("sceneLayout")
        if scene_layout not in {"flow", "cycle", "comparison", "hierarchy", "hub"}:
            raise GeminiProviderError("The AI provider returned an invalid scene layout.")

        requested_target_scene_id = _clean_string(raw.get("targetSceneId"), 80)
        requested_target = next(
            (
                scene
                for scene in effective_board["scenes"]
                if scene.get("sceneId") == requested_target_scene_id
            ),
            None,
        )
        matching_scene = next(
            (
                scene
                for scene in effective_board["scenes"]
                if scene.get("conceptKey") == concept_key
            ),
            None,
        )
        if matching_scene is None:
            matching_concept = next(
                (
                    concept
                    for concept in effective_concepts
                    if concept.get("conceptKey") == concept_key
                ),
                None,
            )
            known_scene_id = (
                matching_concept.get("sceneId")
                if isinstance(matching_concept, dict)
                else ""
            )
            matching_scene = next(
                (
                    scene
                    for scene in effective_board["scenes"]
                    if scene.get("sceneId") == known_scene_id
                ),
                None,
            )
        recent_target = None
        if explicit_intent.action == "update":
            for turn in reversed(effective_recent_turns):
                recent_key = turn.get("conceptKey")
                recent_target = next(
                    (
                        scene for scene in effective_board["scenes"]
                        if recent_key and scene.get("conceptKey") == recent_key
                    ),
                    None,
                )
                if recent_target:
                    break

        target_scene = None
        if board_strategy == "reset":
            action = "create"
        elif explicit_intent.action == "update":
            # Correction wins over additive language, but never overwrites an
            # unrelated scene when no target can be resolved safely.
            target_scene = matching_scene or requested_target or recent_target
            if target_scene is None and len(effective_board["scenes"]) == 1:
                target_scene = effective_board["scenes"][0]
            action = "update" if target_scene is not None else "create"
        elif explicit_intent.action == "create":
            action = "create"
        else:
            action = model_action
            target_scene = requested_target if action == "update" else None
            if action == "create" and matching_scene:
                action = "update"
                target_scene = matching_scene
            elif action == "update" and matching_scene is not None:
                # Exact concept ownership wins over a stale-but-valid model target.
                target_scene = matching_scene
            if action == "update" and target_scene is None:
                # A stale model target is recoverable as new work, never a silent no-op.
                action = "create"

        target_scene_id = (
            str(target_scene.get("sceneId", ""))
            if action == "update" and target_scene
            else ""
        )
        if target_scene:
            # An update may change content, but not the scene's stable identity.
            stored_concept_key = _concept_key(target_scene.get("conceptKey"))
            if stored_concept_key:
                concept_key = stored_concept_key
        elif explicit_intent.action == "create":
            # Explicit additions retain their own stable identity even when the
            # model reuses the existing topic's concept key.
            occupied_concepts = {
                _concept_key(scene.get("conceptKey")) for scene in effective_board["scenes"]
            }
            if concept_key in occupied_concepts:
                suffix = f"-addition-{turn_sequence}"
                base = concept_key[:80 - len(suffix)]
                candidate = f"{base}{suffix}"
                counter = 2
                while candidate in occupied_concepts:
                    counter_suffix = f"-{counter}"
                    candidate = f"{base[:80 - len(suffix) - len(counter_suffix)]}{suffix}{counter_suffix}"
                    counter += 1
                concept_key = candidate

        # The primary heading remains singular. Resets and genuinely empty
        # boards always display it; updates retain the scene's previous choice.
        if board_strategy == "reset" or not effective_board["scenes"]:
            heading_mode = "show"
        elif action == "update" and target_scene:
            stored_heading_mode = target_scene.get("headingMode")
            heading_mode = (
                stored_heading_mode
                if stored_heading_mode in {"show", "inheritPrimary"}
                else "show"
            )
        else:
            heading_mode = model_heading_mode

        # Existing scenes remain editable after the board reaches its hard cap.
        if action == "create" and len(effective_board["scenes"]) >= MAX_BOARD_SCENES:
            raise GeminiProviderError("The board has reached its 48-scene limit.")

        if action == "update":
            scene_id = target_scene_id
        else:
            scene_base = f"scene-{turn_sequence}-{concept_key}"[:80]
            scene_id = scene_base
            suffix = 2
            existing_scene_ids = {
                str(scene.get("sceneId", "")) for scene in effective_board["scenes"]
            }
            while scene_id in existing_scene_ids:
                suffix_text = f"-{suffix}"
                scene_id = f"{scene_base[:80 - len(suffix_text)]}{suffix_text}"
                suffix += 1
        try:
            footprint, placement = allocate_placement(
                effective_board,
                requested,
                target_scene_id=target_scene_id or None,
            )
        except ValueError as error:
            raise GeminiProviderError(
                "No collision-free space remains for that presentation block."
            ) from error

        render_mode = raw.get("renderMode")
        image_prompt = _clean_string(raw.get("imagePrompt"), 800)
        if "visual" not in content_modes:
            if (render_mode != "structured" or image_prompt) and not modes_adjusted:
                raise GeminiProviderError("The AI provider requested an unselected visual.")
            render_mode = "structured"
            image_prompt = ""
        elif render_mode == "generatedAsset":
            if not image_prompt:
                raise GeminiProviderError("The AI provider returned an empty image prompt.")
        elif render_mode == "structured":
            if image_prompt:
                raise GeminiProviderError("Structured visual mode cannot request an image.")
        else:
            raise GeminiProviderError("The AI provider returned an invalid render mode.")
        if {"visual", "diagram"}.issubset(set(content_modes)) and render_mode != "generatedAsset":
            raise GeminiProviderError(
                "A combined visual and diagram requires a generated visual asset."
            )

        raw_scene = raw.get("scene")
        requires_stick_scene = "diagram" in content_modes or (
            "visual" in content_modes and render_mode == "structured"
        )
        if requires_stick_scene:
            stick_scene = repair_stick_scene(raw_scene, scene_layout)
            if not stick_scene["entities"]:
                raise GeminiProviderError("The AI provider returned an empty StickScene.")
        else:
            # Generated visuals do not consume structured entities. Providers
            # may still populate the schema-required scene object, so discard
            # it instead of failing an otherwise valid image request.
            stick_scene = None

        return {
            "boardVersion": board_version + 1,
            "turnSequence": turn_sequence,
            "boardStrategy": board_strategy,
            "action": action,
            "conceptKey": concept_key,
            "title": title,
            "headingMode": heading_mode,
            "summaryBullets": summary_bullets,
            "summary": summary,
            "contentModes": content_modes,
            "confidence": confidence_value,
            "sceneId": scene_id,
            "targetSceneId": target_scene_id or None,
            "requestedFootprint": requested,
            "placement": placement,
            "stickScene": stick_scene,
            "renderMode": render_mode,
            "generatedAsset": None,
            "visualJobId": None,
            "warning": None,
            "_imageRequest": (
                {"imagePrompt": image_prompt, "visualAlt": summary}
                if render_mode == "generatedAsset"
                else None
            ),
        }

    def _generate_image(self, visual_prompt: str, visual_alt: str) -> dict[str, Any]:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{IMAGE_STYLE_PREFIX}{visual_prompt}"}],
                }
            ],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }
        response = self._request_model(
            self.image_model,
            self.image_api_key,
            payload,
            IMAGE_REQUEST_TIMEOUT_SECONDS,
        )
        for part in _candidate_parts(response):
            inline_data = part.get("inlineData")
            if not isinstance(inline_data, dict):
                continue
            mime_type = inline_data.get("mimeType")
            data = inline_data.get("data")
            if (
                mime_type not in SUPPORTED_IMAGE_MIME_TYPES
                or not isinstance(data, str)
                or not data
                or len(data) > MAX_IMAGE_BASE64_CHARACTERS
            ):
                continue
            try:
                base64.b64decode(data, validate=True)
            except (ValueError, binascii.Error):
                continue
            return {
                "dataUrl": f"data:{mime_type};base64,{data}",
                "mimeType": mime_type,
                "alt": _clean_string(visual_alt, 320),
            }
        raise GeminiProviderError("The AI provider returned no usable image.")

    def _request_model(
        self,
        model: str,
        api_key: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Keep API credentials in a server-side header, never a URL or payload."""
        safe_model = urllib.parse.quote(model, safe="-._")
        request = urllib.request.Request(
            f"{GEMINI_API_BASE_URL}/{safe_model}:generateContent",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        return self.transport(request, timeout_seconds)
