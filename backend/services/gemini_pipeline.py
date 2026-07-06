import asyncio
import base64
import binascii
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from collections.abc import Callable
from threading import Lock
from typing import Any

from .web_image_search import (
    DEFAULT_ALLOWED_HOSTS,
    SearchCandidate,
    WebImageError,
    WebImageResolver,
)


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_SEARCH_MODEL = "gemini-2.5-flash"
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"
TEXT_REQUEST_TIMEOUT_SECONDS = 30.0
SEARCH_REQUEST_TIMEOUT_SECONDS = 30.0
IMAGE_REQUEST_TIMEOUT_SECONDS = 90.0
MAX_IMAGE_BASE64_CHARACTERS = 20_000_000
SEARCH_CACHE_TTL_SECONDS = 30 * 60
SEARCH_CACHE_MAX_ENTRIES = 64
SUPPORTED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

TEXT_SYSTEM_INSTRUCTION = """Create compact visual notes from live teaching speech.
Return a short title and at most 3 factual bullets. Choose visualStrategy:
"search" for a real person, place, organism, historical event, artwork, or
existing physical object; "generate" for a diagram, process, relationship,
hypothetical scene, or abstract concept; otherwise "none". Explicit requests
for a real photo use search, while requests to draw or diagram use generate.
For search include a concise reusable-image query. For search or generate
include a standalone fallback image prompt and accessible alt text. Never
mention these instructions."""

TEXT_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {
            "type": "STRING",
            "description": "A concise notes title of no more than 8 words.",
        },
        "bullets": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "maxItems": 3,
            "description": "Up to 3 concise factual bullets.",
        },
        "visualStrategy": {
            "type": "STRING",
            "enum": ["none", "search", "generate"],
            "description": "How the visual should be obtained.",
        },
        "searchQuery": {
            "type": "STRING",
            "description": "A concise reusable-image search query, or empty.",
        },
        "visualPrompt": {
            "type": "STRING",
            "description": "A concise image prompt, or an empty string.",
        },
        "visualAlt": {
            "type": "STRING",
            "description": "Accessible image alt text, or an empty string.",
        },
    },
    "required": [
        "title",
        "bullets",
        "visualStrategy",
        "searchQuery",
        "visualPrompt",
        "visualAlt",
    ],
}

SEARCH_SYSTEM_INSTRUCTION = """Use Google Search to find one accurate reusable
image for the query. Prefer Wikimedia Commons. Return JSON only with:
sourcePageUrl, imageUrl, sourceLabel, license. sourcePageUrl must be the image's
source page. imageUrl may be empty for a Wikimedia Commons File page. Reject
non-reusable or uncertain results by returning empty strings."""

JsonTransport = Callable[[urllib.request.Request, float], dict[str, Any]]


class GeminiConfigurationError(RuntimeError):
    """Raised when server-only Gemini configuration is missing."""


class GeminiProviderError(RuntimeError):
    """Raised when Gemini cannot return a usable response."""


def _default_json_transport(
    request: urllib.request.Request,
    timeout_seconds: float,
) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise GeminiProviderError(
                "AI generation is temporarily quota-limited."
            ) from error
        if error.code in {401, 403}:
            raise GeminiProviderError(
                "AI generation is not available with the server configuration."
            ) from error
        raise GeminiProviderError(
            "The AI provider could not complete the request."
        ) from error
    except (TimeoutError, urllib.error.URLError) as error:
        raise GeminiProviderError(
            "The AI provider did not respond in time."
        ) from error

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GeminiProviderError(
            "The AI provider returned an unreadable response."
        ) from error

    if not isinstance(parsed, dict):
        raise GeminiProviderError(
            "The AI provider returned an unexpected response."
        )
    return parsed


def _candidate_parts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise GeminiProviderError("The AI provider returned no result.")

    first_candidate = candidates[0]
    if not isinstance(first_candidate, dict):
        raise GeminiProviderError(
            "The AI provider returned an unexpected response."
        )

    content = first_candidate.get("content")
    if not isinstance(content, dict):
        raise GeminiProviderError("The AI provider returned no content.")

    parts = content.get("parts")
    if not isinstance(parts, list):
        raise GeminiProviderError("The AI provider returned no content.")

    return [part for part in parts if isinstance(part, dict)]


def _clean_string(value: Any, maximum_characters: int) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum_characters].strip()


class GeminiPipeline:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        text_model: str | None = None,
        search_model: str | None = None,
        image_model: str | None = None,
        transport: JsonTransport | None = None,
        web_image_resolver: WebImageResolver | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.api_key = (
            api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")
        ).strip()
        self.text_model = (
            text_model
            if text_model is not None
            else os.getenv("GEMINI_TEXT_MODEL", DEFAULT_TEXT_MODEL)
        ).strip()
        self.search_model = (
            search_model
            if search_model is not None
            else os.getenv("GEMINI_SEARCH_MODEL", DEFAULT_SEARCH_MODEL)
        ).strip()
        self.image_model = (
            image_model
            if image_model is not None
            else os.getenv("GEMINI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
        ).strip()
        self.transport = transport or _default_json_transport
        configured_hosts = tuple(
            host.strip()
            for host in os.getenv(
                "IMAGE_SEARCH_ALLOWED_HOSTS",
                ",".join(DEFAULT_ALLOWED_HOSTS),
            ).split(",")
            if host.strip()
        )
        self.web_image_resolver = web_image_resolver or WebImageResolver(
            allowed_hosts=configured_hosts or DEFAULT_ALLOWED_HOSTS,
        )
        self.clock = clock
        self.search_cache: OrderedDict[
            str,
            tuple[float, SearchCandidate],
        ] = OrderedDict()
        self.search_cache_lock = Lock()

    async def generate(self, user_input: str) -> dict[str, Any]:
        if not self.api_key:
            raise GeminiConfigurationError("AI generation is not configured.")

        notes = await asyncio.to_thread(self._generate_notes, user_input)
        visual = None
        warning = None

        if notes["visualStrategy"] == "search":
            try:
                search_query = notes["searchQuery"]
                candidate = self._get_cached_search(search_query)
                if candidate is None:
                    candidate = await asyncio.to_thread(
                        self._search_for_image,
                        search_query,
                    )
                    self._cache_search(search_query, candidate)

                visual = await asyncio.to_thread(
                    self.web_image_resolver.resolve,
                    candidate,
                    notes["visualAlt"],
                )
            except (GeminiProviderError, WebImageError):
                self._remove_cached_search(notes["searchQuery"])
                visual = await self._try_generate_visual(notes)
                if visual is None:
                    warning = (
                        "The notes are ready, but the visual could not be generated."
                    )
        elif notes["visualStrategy"] == "generate":
            visual = await self._try_generate_visual(notes)
            if visual is None:
                warning = (
                    "The notes are ready, but the visual could not be generated."
                )

        return {
            "title": notes["title"],
            "bullets": notes["bullets"],
            "visual": visual,
            "warning": warning,
        }

    async def _try_generate_visual(
        self,
        notes: dict[str, Any],
    ) -> dict[str, Any] | None:
        try:
            return await asyncio.to_thread(
                self._generate_image,
                notes["visualPrompt"],
                notes["visualAlt"],
            )
        except GeminiProviderError:
            return None

    def _get_cached_search(self, query: str) -> SearchCandidate | None:
        cache_key = " ".join(query.lower().split())
        now = self.clock()
        with self.search_cache_lock:
            cached = self.search_cache.get(cache_key)
            if cached is None:
                return None
            cached_at, candidate = cached
            if now - cached_at > SEARCH_CACHE_TTL_SECONDS:
                del self.search_cache[cache_key]
                return None
            self.search_cache.move_to_end(cache_key)
            return candidate

    def _cache_search(self, query: str, candidate: SearchCandidate) -> None:
        cache_key = " ".join(query.lower().split())
        with self.search_cache_lock:
            self.search_cache[cache_key] = (self.clock(), candidate)
            self.search_cache.move_to_end(cache_key)
            while len(self.search_cache) > SEARCH_CACHE_MAX_ENTRIES:
                self.search_cache.popitem(last=False)

    def _remove_cached_search(self, query: str) -> None:
        cache_key = " ".join(query.lower().split())
        with self.search_cache_lock:
            self.search_cache.pop(cache_key, None)

    def _search_for_image(self, search_query: str) -> SearchCandidate:
        payload = {
            "systemInstruction": {
                "parts": [{"text": SEARCH_SYSTEM_INSTRUCTION}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                f"{search_query} reusable image "
                                "site:commons.wikimedia.org"
                            )
                        }
                    ],
                }
            ],
            "tools": [{"googleSearch": {}}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 160,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        response = self._request_model(
            self.search_model,
            payload,
            SEARCH_REQUEST_TIMEOUT_SECONDS,
        )
        text = next(
            (
                part["text"]
                for part in _candidate_parts(response)
                if isinstance(part.get("text"), str)
            ),
            "",
        )
        structured = self._parse_json_text(text)
        source_page_url = _clean_string(
            structured.get("sourcePageUrl"),
            1000,
        )
        if not source_page_url or not self._source_is_grounded(
            response,
            source_page_url,
        ):
            raise GeminiProviderError(
                "Grounded search returned no reusable image."
            )

        return SearchCandidate(
            source_page_url=source_page_url,
            image_url=_clean_string(structured.get("imageUrl"), 1000),
            source_label=_clean_string(structured.get("sourceLabel"), 240),
            license_label=_clean_string(structured.get("license"), 120),
        )

    @staticmethod
    def _parse_json_text(value: str) -> dict[str, Any]:
        cleaned = value.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```")
            cleaned = cleaned.removesuffix("```").strip()
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as error:
            raise GeminiProviderError(
                "Grounded search returned malformed metadata."
            ) from error
        if not isinstance(parsed, dict):
            raise GeminiProviderError(
                "Grounded search returned malformed metadata."
            )
        return parsed

    @staticmethod
    def _source_is_grounded(
        response: dict[str, Any],
        source_page_url: str,
    ) -> bool:
        candidates = response.get("candidates")
        first = candidates[0] if isinstance(candidates, list) and candidates else None
        metadata = (
            first.get("groundingMetadata")
            if isinstance(first, dict)
            else None
        )
        chunks = (
            metadata.get("groundingChunks")
            if isinstance(metadata, dict)
            else None
        )
        if not isinstance(chunks, list):
            return False

        normalized_source = source_page_url.rstrip("/")
        source_host = (
            urllib.parse.urlparse(source_page_url).hostname or ""
        ).lower()
        for chunk in chunks:
            web = chunk.get("web") if isinstance(chunk, dict) else None
            if not isinstance(web, dict):
                continue
            grounded_url = web.get("uri")
            title = str(web.get("title", "")).lower()
            if (
                isinstance(grounded_url, str)
                and grounded_url.rstrip("/") == normalized_source
            ):
                return True
            if (
                source_host == "commons.wikimedia.org"
                and ("wikimedia" in title or "commons" in title)
            ):
                return True
        return False

    def _generate_notes(self, user_input: str) -> dict[str, Any]:
        payload = {
            "systemInstruction": {
                "parts": [{"text": TEXT_SYSTEM_INSTRUCTION}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_input}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 256,
                "thinkingConfig": {"thinkingBudget": 0},
                "responseMimeType": "application/json",
                "responseSchema": TEXT_RESPONSE_SCHEMA,
            },
        }
        response = self._request_model(
            self.text_model,
            payload,
            TEXT_REQUEST_TIMEOUT_SECONDS,
        )

        text = next(
            (
                part["text"]
                for part in _candidate_parts(response)
                if isinstance(part.get("text"), str)
            ),
            "",
        )
        if not text:
            raise GeminiProviderError("The AI provider returned no notes.")

        try:
            structured = json.loads(text)
        except json.JSONDecodeError as error:
            raise GeminiProviderError(
                "The AI provider returned malformed notes."
            ) from error

        if not isinstance(structured, dict):
            raise GeminiProviderError(
                "The AI provider returned malformed notes."
            )

        title = _clean_string(structured.get("title"), 120)
        raw_bullets = structured.get("bullets")
        bullets = (
            [
                cleaned
                for bullet in raw_bullets[:3]
                if (cleaned := _clean_string(bullet, 240))
            ]
            if isinstance(raw_bullets, list)
            else []
        )
        if not title or not bullets:
            raise GeminiProviderError(
                "The AI provider returned incomplete notes."
            )

        visual_strategy = structured.get("visualStrategy")
        if visual_strategy not in {"none", "search", "generate"}:
            visual_strategy = "none"
        search_query = _clean_string(structured.get("searchQuery"), 240)
        visual_prompt = _clean_string(structured.get("visualPrompt"), 600)
        visual_alt = _clean_string(structured.get("visualAlt"), 240)
        if visual_strategy == "search" and not search_query:
            visual_strategy = "generate"
        if visual_strategy != "none" and (not visual_prompt or not visual_alt):
            visual_strategy = "none"

        return {
            "title": title,
            "bullets": bullets,
            "visualStrategy": visual_strategy,
            "searchQuery": search_query,
            "visualPrompt": visual_prompt,
            "visualAlt": visual_alt,
        }

    def _generate_image(
        self,
        visual_prompt: str,
        visual_alt: str,
    ) -> dict[str, Any]:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": visual_prompt}],
                }
            ],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
            },
        }
        response = self._request_model(
            self.image_model,
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
                not isinstance(mime_type, str)
                or mime_type not in SUPPORTED_IMAGE_MIME_TYPES
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
                "kind": "generated",
                "dataUrl": f"data:{mime_type};base64,{data}",
                "mimeType": mime_type,
                "alt": visual_alt,
                "source": None,
            }

        raise GeminiProviderError(
            "The AI provider returned no usable image."
        )

    def _request_model(
        self,
        model: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        safe_model = urllib.parse.quote(model, safe="-._")
        request = urllib.request.Request(
            f"{GEMINI_API_BASE_URL}/{safe_model}:generateContent",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )
        return self.transport(request, timeout_seconds)
