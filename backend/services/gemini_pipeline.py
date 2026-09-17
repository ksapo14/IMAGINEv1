"""Server-only Gemini transport and the cumulative whiteboard decision pipeline."""

import asyncio
import base64
import binascii
import json
import logging
import os
import random
import re
import threading
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
from .whiteboard_intent import (
    WhiteboardIntent,
    allows_topic_continuity,
    classify_whiteboard_intent,
    resolve_topic_continuity,
)
from .whiteboard_grid import FOOTPRINTS, allocate_placement, promote_footprint, repair_stick_scene


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TEXT_MODEL = "gemini-3.7-flash"
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"
DEFAULT_TEXT_FALLBACK_MODEL = "gemini-3.6-flash"
DEFAULT_IMAGE_FALLBACK_MODEL = "gemini-2.5-flash-image"
TEXT_REQUEST_TIMEOUT_SECONDS = 30.0
IMAGE_REQUEST_TIMEOUT_SECONDS = 90.0
GEMINI_RETRY_DELAYS_SECONDS = (0.5, 1.0)
GEMINI_RETRY_JITTER_SECONDS = 0.25
GEMINI_COOLDOWN_SECONDS = 30.0
GEMINI_FALLBACK_BUDGETS_SECONDS = {
    "text": (10.0, 20.0, 5.0),
    "image": (30.0, 60.0, 15.0),
}
MAX_IMAGE_BASE64_CHARACTERS = 20_000_000
MAX_BOARD_SCENES = 48
SUPPORTED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
GENERATION_MODES = {"live", "prepare"}
IMAGE_GENERATOR_SYSTEM_INSTRUCTION = """You are Imagine's educational image generator. Create one clear raster visual from the factual content brief in the user message.

EVIDENCE AND SAFETY
- Depict only subjects, actions, and relationships stated in the brief. Do not invent facts, relationships, measurements, symbols, or unsupported details.
- Do not embed text, words, letters, numbers, labels, captions, signs, watermarks, or text-like marks anywhere in the image.
- Use a clean two-dimensional educational illustration or diagram style. Do not use photorealism.

COMPOSITION AND ROUTING
- Keep all boxes, nodes, figures, and objects distinct and non-overlapping.
- Anchor every connector to a node edge and route it around all content, never through a node or object. Keep crossings minimal, and make any unavoidable crossing unambiguous.
- Provide generous internal padding, clear gutters between elements, and comfortable outer margins. Never crowd the canvas edges.
- Use a balanced scale and composition that fills the canvas without making elements cramped, tiny, oversized, or visually lopsided.
- Use restrained, consistent stroke weights and arrowheads. Avoid heavy outlines, oversized arrows, and competing visual emphasis.

COLOR AND ACCESSIBILITY
- Use a restrained, accessible educational color palette with a small set of harmonious colors and sufficient foreground/background contrast.
- Never make meaning depend on color alone. Reinforce distinctions and direction with shape, position, pattern, silhouette, or connector style as non-color cues.
- Prefer a clean white or lightly tinted background and avoid decorative clutter or distracting effects.
"""
DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION = """You are Imagine's educational diagram generator. Create one actual diagram from the factual content brief, not a scene, photograph, or photorealistic illustration.

EVIDENCE AND RELATIONSHIPS
- Include only entities and relationships supported by the brief. Do not invent facts, nodes, measurements, symbols, or decorative objects.
- Draw an arrow only when the brief supports that relationship. Never invent arrows, and preserve the correct direction for every directed relationship.
- Do not embed text, words, letters, numbers, labels, captions, signs, watermarks, or text-like marks anywhere in the diagram.

LAYOUT AND ROUTING
- Keep every node and object distinct and non-overlapping.
- Anchor connectors to node edges and route them around all content, never through a node or object. Keep crossings minimal and make unavoidable crossings unambiguous.
- Use generous internal padding, clear gutters, and comfortable outer margins. Keep all content fully visible with no cropping.
- Use a balanced scale that fills the canvas without cramped, tiny, oversized, or lopsided elements.
- Use restrained, consistent stroke weights and arrowheads so no connector overwhelms the teaching content.

COLOR AND ACCESSIBILITY
- Use a restrained, accessible educational color palette with sufficient foreground/background contrast.
- Never make meaning depend on color alone. Reinforce distinctions and direction with shape, position, pattern, silhouette, or connector style as non-color cues.
- Avoid clutter, distracting decoration, watermarks, text-like marks, and photorealism.
"""

JsonTransport = Callable[[urllib.request.Request, float], dict[str, Any]]
logger = logging.getLogger(__name__)


def _environment_model(name: str, default: str) -> str:
    """Use a nonblank model override or the stable production default."""
    return os.getenv(name, "").strip() or default


def _environment_fallback_model(name: str, default: str) -> str:
    """Use the fallback default only when its environment variable is absent."""
    value = os.getenv(name)
    return default if value is None else value.strip()


class GeminiConfigurationError(RuntimeError):
    """Raised when server-only Gemini configuration is missing."""


class GeminiProviderError(RuntimeError):
    """Raised when Gemini cannot return a usable response."""


class GeminiTransientError(GeminiProviderError):
    """Raised for provider transport failures that are safe to retry briefly."""


def _http_error_context(error: urllib.error.HTTPError) -> str:
    """Return only the safe HTTP status; provider text may contain private content."""
    return f"HTTP {error.code}"


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
        if error.code in {408, 500, 502, 503, 504}:
            raise GeminiTransientError(
                f"The AI provider could not complete the request. {context}."
            ) from None
        if error.code == 429:
            raise GeminiProviderError(
                f"AI generation is temporarily quota-limited. {context}."
            ) from None
        if error.code in {401, 403}:
            raise GeminiProviderError(
                "AI generation is not available with the server configuration. "
                f"{context}."
            ) from None
        raise GeminiProviderError(
            f"The AI provider could not complete the request. {context}."
        ) from None
    except (TimeoutError, urllib.error.URLError):
        raise GeminiTransientError("The AI provider did not respond in time.") from None

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise GeminiProviderError(
            "The AI provider returned an unreadable response."
        ) from None
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
                "renderMode": (
                    raw.get("renderMode")
                    if raw.get("renderMode") in {"structured", "generatedAsset"}
                    else (
                        "generatedAsset"
                        if isinstance(raw.get("contentModes"), list)
                        and "diagram" in raw.get("contentModes", [])
                        else "structured"
                    )
                ),
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
    """Make one Live Assistant decision, plus an optional independent image."""

    def __init__(
        self,
        *,
        text_api_key: str | None = None,
        image_api_key: str | None = None,
        text_model: str | None = None,
        image_model: str | None = None,
        text_fallback_model: str | None = None,
        image_fallback_model: str | None = None,
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
        self.text_fallback_model = (
            text_fallback_model
            if text_fallback_model is not None
            else _environment_fallback_model(
                "GEMINI_TEXT_FALLBACK_MODEL", DEFAULT_TEXT_FALLBACK_MODEL
            )
        ).strip()
        self.image_fallback_model = (
            image_fallback_model
            if image_fallback_model is not None
            else _environment_fallback_model(
                "GEMINI_IMAGE_FALLBACK_MODEL", DEFAULT_IMAGE_FALLBACK_MODEL
            )
        ).strip()
        self.transport = transport or _default_json_transport
        self._cooldown_lock = threading.Lock()
        self._cooldowns: dict[tuple[str, str], float] = {}

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
        image_kind: str = "visual",
    ) -> dict[str, Any] | None:
        """Generate a server-side visual or diagram with its trusted instruction."""
        instructions = {
            "visual": IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
            "diagram": DIAGRAM_IMAGE_GENERATOR_SYSTEM_INSTRUCTION,
        }
        system_instruction = instructions.get(image_kind)
        if (
            visual_strategy != "image"
            or system_instruction is None
            or not self.image_api_key
            or not self.image_model
        ):
            return None
        try:
            return await asyncio.to_thread(
                self._generate_image,
                visual_prompt,
                visual_alt,
                system_instruction,
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
            channel="text",
            fallback_model=self.text_fallback_model,
        )
        text = "".join(
            part.get("text", "")
            for part in _candidate_parts(response)
            if isinstance(part.get("text"), str)
        )
        if not text:
            raise GeminiProviderError("The AI provider returned no decision.")
        return self._normalize_decision(
            _parse_json_object(text, "Live Assistant data"),
            context,
            explicit_intent,
            user_input,
        )

    def _normalize_decision(
        self,
        raw: dict[str, Any],
        context: dict[str, Any],
        explicit_intent: WhiteboardIntent,
        user_input: str,
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
        continuity_target = resolve_topic_continuity(user_input, context, explicit_intent)

        # Explicit corrections and additions retain the board. Additions still
        # leave semantic CREATE versus UPDATE ownership with Gemini.
        board_strategy = (
            "integrate"
            if explicit_intent.action is not None or explicit_intent.force_integrate
            or continuity_target is not None
            else model_board_strategy
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
            requested_content_modes = list(explicit_intent.required_modes)
        else:
            requested_content_modes = [
                mode for mode in model_modes
                if mode not in explicit_intent.forbidden_modes
            ]
        if not requested_content_modes:
            available_bullets = _bounded_summary_bullets(raw.get("summaryBullets"))
            if "visual" not in explicit_intent.forbidden_modes:
                requested_content_modes = ["visual"]
            elif "notes" not in explicit_intent.forbidden_modes and available_bullets:
                requested_content_modes = ["notes"]
            else:
                raise GeminiProviderError(
                    "The AI provider did not return a mode allowed by the explicit request."
                )
        modes_adjusted = requested_content_modes != model_modes
        summary_bullets = _bounded_summary_bullets(raw.get("summaryBullets"))
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
        model_heading_mode = raw.get("headingMode")
        if model_heading_mode not in {"show", "inheritPrimary"}:
            raise GeminiProviderError("The AI provider returned an invalid heading mode.")
        scene_layout = raw.get("sceneLayout")
        if scene_layout not in {"flow", "cycle", "comparison", "hierarchy", "hub"}:
            raise GeminiProviderError("The AI provider returned an invalid scene layout.")
        model_merge_behavior = raw.get("mergeBehavior")
        if model_merge_behavior not in {"replace", "expand"}:
            raise GeminiProviderError("The AI provider returned an invalid merge behavior.")

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
        elif continuity_target is not None:
            action = "update"
            target_scene = continuity_target
        elif explicit_intent.action == "update":
            # Correction wins over additive language, but never overwrites an
            # unrelated scene when no target can be resolved safely.
            target_scene = matching_scene or requested_target or recent_target
            if target_scene is None and len(effective_board["scenes"]) == 1:
                target_scene = effective_board["scenes"][0]
            action = "update" if target_scene is not None else "create"
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

        target_modes = (
            [
                mode for mode in target_scene.get("contentModes", [])
                if mode in {"visual", "notes", "diagram"}
            ]
            if target_scene and isinstance(target_scene.get("contentModes"), list)
            else []
        )
        if len(set(target_modes)) != len(target_modes):
            target_modes = []
        new_modes = [
            mode for mode in requested_content_modes if mode not in target_modes
        ]
        forbidden_conflict = any(
            mode in explicit_intent.forbidden_modes for mode in target_modes
        )
        retained_visual_is_structured = (
            "visual" not in target_modes
            or "diagram" in target_modes
            or target_scene.get("renderMode") == "structured"
        )
        # A resolved model target can recognize synonyms that the conservative
        # subject matcher cannot. Explicit new modes still complement that scene.
        semantic_continuation = bool(explicit_intent.required_modes) and (
            target_scene is not None
            and (target_scene is matching_scene or target_scene is requested_target)
        )
        merge_behavior = (
            "expand"
            if (
                (model_merge_behavior == "expand" or continuity_target is not None or semantic_continuation)
                and action == "update"
                and target_scene is not None
                and target_modes
                and new_modes
                and allows_topic_continuity(user_input, explicit_intent)
                and not forbidden_conflict
                and retained_visual_is_structured
            )
            else "replace"
        )
        content_modes = (
            [*target_modes, *new_modes]
            if merge_behavior == "expand"
            else requested_content_modes
        )
        modes_adjusted = modes_adjusted or content_modes != model_modes
        preserves_notes = merge_behavior == "expand" and "notes" in target_modes
        if preserves_notes:
            # Empty bullets are an explicit marker; the accepting client copies
            # the exact retained notes only after revalidating the target.
            summary_bullets = []
        elif "notes" in content_modes:
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
        requested = promote_footprint(requested, content_modes)
        if (
            merge_behavior == "expand"
            and "diagram" in target_modes
            and new_modes == ["notes"]
        ):
            # Notes share the diagram's reserved space. Keep its legal size so
            # a model's larger request cannot push this continuation off-page.
            prior_placement = target_scene["placement"]
            prior_footprint = next((name for name, size in FOOTPRINTS.items()
                                    if size == (prior_placement["width"], prior_placement["height"])), None)
            if prior_footprint and promote_footprint(prior_footprint, content_modes) == prior_footprint:
                requested = prior_footprint

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
        has_diagram = "diagram" in content_modes
        preserves_diagram = merge_behavior == "expand" and "diagram" in target_modes
        preserves_structured_visual = (
            merge_behavior == "expand" and "visual" in target_modes
        )
        if has_diagram:
            # An expanded diagram keeps its prior asset/job state on the client;
            # a new or replaced diagram requests exactly one raster job.
            render_mode = "generatedAsset"
            image_prompt = "" if preserves_diagram else image_prompt or summary
        elif preserves_structured_visual:
            render_mode = "structured"
            image_prompt = ""
        elif "visual" not in content_modes:
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
        raw_scene = raw.get("scene")
        has_visual = "visual" in content_modes
        requires_stick_scene = has_visual and (
            has_diagram or render_mode == "structured"
        )
        if requires_stick_scene and preserves_structured_visual:
            # Null is the retained-visual marker. The client accepts it only
            # when the resolved target owns a complete structured StickScene.
            stick_scene = None
        elif requires_stick_scene:
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
            "mergeBehavior": merge_behavior,
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
                if render_mode == "generatedAsset" and not preserves_diagram
                else None
            ),
        }

    def _generate_image(
        self,
        visual_prompt: str,
        visual_alt: str,
        system_instruction: str,
    ) -> dict[str, Any]:
        """Request one raster asset under the server-selected image contract."""
        payload = {
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": visual_prompt}],
                }
            ],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }
        response = self._request_model(
            self.image_model,
            self.image_api_key,
            payload,
            IMAGE_REQUEST_TIMEOUT_SECONDS,
            channel="image",
            fallback_model=self.image_fallback_model,
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
        *,
        channel: str = "text",
        fallback_model: str = "",
    ) -> dict[str, Any]:
        """Retry transient primary failures, then try one stable fallback model."""
        deadline = time.monotonic() + timeout_seconds
        usable_fallback = bool(fallback_model and fallback_model != model)
        cooldown_key = (channel, model)
        if usable_fallback and self._in_cooldown(cooldown_key):
            logger.warning("Gemini %s cooldown active; trying fallback", channel)
            return self._send_model_request(
                fallback_model,
                api_key,
                payload,
                self._remaining_timeout(deadline),
            )

        if not usable_fallback:
            return self._request_primary_only(
                model,
                api_key,
                payload,
                deadline,
                channel,
            )

        reserve, primary_cap, minimum_retry = GEMINI_FALLBACK_BUDGETS_SECONDS[channel]
        last_transient_error: GeminiTransientError | None = None
        for attempt in range(3):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                if last_transient_error is not None:
                    return self._fallback_after_primary_failure(
                        fallback_model,
                        api_key,
                        payload,
                        deadline,
                        channel,
                        cooldown_key,
                        last_transient_error,
                    )
                return self._send_model_request(
                    fallback_model,
                    api_key,
                    payload,
                    self._remaining_timeout(deadline),
                )
            retry_too_short = (
                last_transient_error is not None
                and remaining < reserve + minimum_retry
            )
            if remaining <= reserve or retry_too_short:
                if last_transient_error is None:
                    logger.warning(
                        "Gemini %s primary skipped; fallback reserve reached", channel
                    )
                    return self._send_model_request(
                        fallback_model,
                        api_key,
                        payload,
                        remaining,
                    )
                logger.warning(
                    "Gemini %s retry skipped; remaining budget reserved for fallback",
                    channel,
                )
                return self._fallback_after_primary_failure(
                    fallback_model,
                    api_key,
                    payload,
                    deadline,
                    channel,
                    cooldown_key,
                    last_transient_error,
                )

            try:
                return self._send_model_request(
                    model,
                    api_key,
                    payload,
                    min(primary_cap, remaining - reserve),
                )
            except GeminiTransientError as error:
                last_transient_error = error
                if attempt == 2:
                    break
                delay = GEMINI_RETRY_DELAYS_SECONDS[attempt] + random.uniform(
                    0.0, GEMINI_RETRY_JITTER_SECONDS
                )
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                if remaining < delay + reserve + minimum_retry:
                    logger.warning(
                        "Gemini %s retry skipped; remaining budget reserved for fallback",
                        channel,
                    )
                    break
                logger.warning(
                    "Gemini %s retry %d/2 in %.3fs", channel, attempt + 1, delay
                )
                time.sleep(delay)

        assert last_transient_error is not None
        return self._fallback_after_primary_failure(
            fallback_model,
            api_key,
            payload,
            deadline,
            channel,
            cooldown_key,
            last_transient_error,
        )

    def _request_primary_only(
        self,
        model: str,
        api_key: str,
        payload: dict[str, Any],
        deadline: float,
        channel: str,
    ) -> dict[str, Any]:
        """Keep the original uncapped retry path when no fallback is usable."""
        last_transient_error: GeminiTransientError | None = None
        for attempt in range(3):
            try:
                return self._send_model_request(
                    model,
                    api_key,
                    payload,
                    self._remaining_timeout(deadline, last_transient_error),
                )
            except GeminiTransientError as error:
                last_transient_error = error
                if attempt == 2:
                    break
                delay = GEMINI_RETRY_DELAYS_SECONDS[attempt] + random.uniform(
                    0.0, GEMINI_RETRY_JITTER_SECONDS
                )
                remaining = self._remaining_timeout(deadline, error)
                if delay >= remaining:
                    raise error
                logger.warning(
                    "Gemini %s retry %d/2 in %.3fs", channel, attempt + 1, delay
                )
                time.sleep(delay)

        assert last_transient_error is not None
        raise last_transient_error

    def _fallback_after_primary_failure(
        self,
        fallback_model: str,
        api_key: str,
        payload: dict[str, Any],
        deadline: float,
        channel: str,
        cooldown_key: tuple[str, str],
        last_error: GeminiTransientError,
    ) -> dict[str, Any]:
        """Start cooldown, then spend any positive remaining budget on fallback."""
        self._start_cooldown(cooldown_key)
        try:
            remaining = self._remaining_timeout(deadline, last_error)
        except GeminiTransientError:
            logger.warning(
                "Gemini %s primary exhausted; cooldown started but deadline prevents fallback",
                channel,
            )
            raise
        logger.warning(
            "Gemini %s primary exhausted; cooldown started and fallback selected",
            channel,
        )
        return self._send_model_request(
            fallback_model,
            api_key,
            payload,
            remaining,
        )

    def _send_model_request(
        self,
        model: str,
        api_key: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Build one model-specific request without placing credentials in its URL."""
        safe_model = urllib.parse.quote(model, safe="-._")
        request = urllib.request.Request(
            f"{GEMINI_API_BASE_URL}/{safe_model}:generateContent",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        return self.transport(request, timeout_seconds)

    @staticmethod
    def _remaining_timeout(
        deadline: float,
        last_error: GeminiTransientError | None = None,
    ) -> float:
        """Return positive time inside the shared deadline or preserve the last failure."""
        remaining = deadline - time.monotonic()
        if remaining > 0:
            return remaining
        if last_error is not None:
            raise last_error
        raise GeminiTransientError("The AI provider did not respond in time.")

    def _in_cooldown(self, key: tuple[str, str]) -> bool:
        """Read and naturally expire one channel/model cooldown under a lock."""
        now = time.monotonic()
        with self._cooldown_lock:
            expires_at = self._cooldowns.get(key)
            if expires_at is None:
                return False
            if now >= expires_at:
                del self._cooldowns[key]
                return False
            return True

    def _start_cooldown(self, key: tuple[str, str]) -> None:
        """Record primary exhaustion without shortening a concurrent cooldown."""
        expires_at = time.monotonic() + GEMINI_COOLDOWN_SECONDS
        with self._cooldown_lock:
            self._cooldowns[key] = max(self._cooldowns.get(key, 0.0), expires_at)
