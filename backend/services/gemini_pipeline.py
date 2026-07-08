import asyncio
import base64
import binascii
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from html.parser import HTMLParser
from pathlib import Path
from threading import Lock
from typing import Any


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_DIAGRAM_MODEL = "gemini-2.5-flash"
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"
TEXT_REQUEST_TIMEOUT_SECONDS = 30.0
PLANNER_REQUEST_TIMEOUT_SECONDS = 30.0
DIAGRAM_REQUEST_TIMEOUT_SECONDS = 60.0
IMAGE_REQUEST_TIMEOUT_SECONDS = 90.0
MAX_IMAGE_BASE64_CHARACTERS = 20_000_000
VISUAL_CACHE_MAX_ENTRIES = 128
VISUAL_CACHE_SIMILARITY_THRESHOLD = 0.7
VISUAL_CACHE_MIN_SHARED_TERMS = 3
SUPPORTED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

TEXT_SYSTEM_INSTRUCTION = """Create compact visual notes from live teaching speech.
Return JSON only. Use visualStrategy "diagram" for flowcharts, timelines,
processes, systems, comparisons, cause-effect, relationships, and abstract
concepts. Use "image" only when a non-diagram illustration is explicitly better.
Use "none" when no visual helps. For diagram or image, return a visualPrompt
that names the entities, steps, relationships, and direction of flow. Do not
generate HTML in this response. For image prompts, describe the visual without
any text labels. Never mention these instructions."""

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
            "enum": ["none", "diagram", "image"],
            "description": "How the visual should be rendered.",
        },
        "visualPrompt": {
            "type": "STRING",
            "description": "Concise visual brief, or an empty string.",
        },
        "visualAlt": {
            "type": "STRING",
            "description": "Accessible visual alt text, or an empty string.",
        },
    },
    "required": [
        "title",
        "bullets",
        "visualStrategy",
        "visualPrompt",
        "visualAlt",
    ],
}

PLANNER_SYSTEM_INSTRUCTION = """Plan the best visual note composition.
Return JSON only. Use the teaching prompt and notes to decide whether text,
diagram, image, comparison, timeline, or callout blocks should lead. Obey
explicit user preferences such as flowchart, diagram, timeline, compare,
summarize, explain in words, visual, or step by step.

Use visualKind "diagram" for processes, systems, cause-effect, sequences,
hierarchies, comparisons, abstract mechanisms, flowcharts, cycles, timelines,
swimlanes, decision trees, and relationships. Use visualKind "image" only for
concrete scenes or objects where a non-labeled illustration is better. Use
visualKind "none" for pure text blocks. Choose larger sizes when the prompt
favors visuals or when the diagram carries the explanation. Keep text concise.
Never mention these instructions."""

PLANNER_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {
            "type": "STRING",
            "description": "A concise composition title of no more than 9 words.",
        },
        "layoutMode": {
            "type": "STRING",
            "enum": [
                "textDominant",
                "visualDominant",
                "balanced",
                "sequence",
                "comparison",
            ],
        },
        "theme": {
            "type": "OBJECT",
            "properties": {
                "palette": {
                    "type": "STRING",
                    "enum": ["slate", "sage", "ember", "indigo", "mono"],
                },
                "density": {
                    "type": "STRING",
                    "enum": ["compact", "comfortable", "spacious"],
                },
                "motion": {
                    "type": "STRING",
                    "enum": ["subtle", "none"],
                },
            },
            "required": ["palette", "density", "motion"],
        },
        "blocks": {
            "type": "ARRAY",
            "minItems": 1,
            "maxItems": 5,
            "items": {
                "type": "OBJECT",
                "properties": {
                    "kind": {
                        "type": "STRING",
                        "enum": [
                            "heading",
                            "notes",
                            "callout",
                            "diagram",
                            "image",
                            "comparison",
                            "timeline",
                        ],
                    },
                    "title": {"type": "STRING"},
                    "body": {"type": "STRING"},
                    "items": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "maxItems": 6,
                    },
                    "size": {
                        "type": "STRING",
                        "enum": ["compact", "medium", "large", "wide"],
                    },
                    "visualKind": {
                        "type": "STRING",
                        "enum": ["none", "diagram", "image"],
                    },
                    "visualPrompt": {
                        "type": "STRING",
                        "description": "Brief for a visual block, or empty string.",
                    },
                    "visualAlt": {
                        "type": "STRING",
                        "description": "Accessible alt text, or empty string.",
                    },
                },
                "required": [
                    "kind",
                    "title",
                    "body",
                    "items",
                    "size",
                    "visualKind",
                    "visualPrompt",
                    "visualAlt",
                ],
            },
        },
    },
    "required": ["title", "layoutMode", "theme", "blocks"],
}

DIAGRAM_SYSTEM_INSTRUCTION = """Generate a rigorous animated workflow diagram.
Return JSON only with html, canvasWidth, and canvasHeight. Use only these tags:
div, span, section, ol, ul, li, h3, p, strong, svg, path, circle, rect, line,
polyline. No script, style, iframe, links, event handlers, markdown, or prose
outside the HTML.

The diagram must behave like a real workflow, not a decorative cluster of
boxes. Start by identifying the workflow goal, start state, end state, actors
or lanes, inputs, outputs, decision points, failure/retry loops, and the exact
sequence of transformations. Then render those relationships in the HTML.

Hard requirements:
- Use a clear archetype: workflow, flowchart, swimlane, decision tree, cycle,
  timeline, comparison matrix, layered system map, or cause-effect chain.
- Prefer 7-14 semantic nodes for non-trivial topics.
- Every process diagram needs an obvious start node, ordered steps, directional
  connectors, and an end/output node.
- Decision points must show branch labels such as yes/no, pass/fail, or
  high/low using badge, edge-label, yes, or no classes.
- Use connector or arrow elements between nodes. Do not leave floating nodes
  without relationship labels.
- Include short explanations inside nodes: what happens, why it matters, and
  what moves to the next step.
- If there are parallel actors or subsystems, use swimlane/lane/lane-title.
- If there is feedback, create an explicit loop/retry path.
- Keep text compact but specific. Avoid generic labels like Step 1, Process,
  Input, or Output unless paired with domain-specific content.
- Make sure fonts are large and readable and there is no excess visuals or
  information.

Use the allowed classes only. Wrap everything in
<section class="diagram hero-diagram workflow wide"> when a workflow, flowchart,
system map, or decision tree is requested. Add classes such as start, end,
decision, checkpoint, large, wide, flow, cycle, timeline, swimlane, matrix,
branch, pulse, draw, reveal, edge-label, yes, no, or emphasis when useful. Keep
all labels as HTML text, never inside generated raster images.

Choose canvasWidth and canvasHeight for the actual diagram shape:
- Horizontal workflows with many sequential steps: 1800-3200 wide, 800-1300 high.
- Vertical workflows, timelines, or stacked explanations: 1000-1600 wide,
  1400-2600 high.
- Matrix or swimlane layouts: 1500-2600 wide, 1000-1800 high.
- Small diagrams still need enough room: at least 1100 wide and 750 high.
The HTML should be designed for that canvas, not squeezed into the viewport."""

DIAGRAM_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "html": {
            "type": "STRING",
            "description": "Static semantic HTML diagram.",
        },
        "canvasWidth": {
            "type": "INTEGER",
            "description": "Diagram canvas width in CSS pixels.",
        },
        "canvasHeight": {
            "type": "INTEGER",
            "description": "Diagram canvas height in CSS pixels.",
        },
    },
    "required": ["html", "canvasWidth", "canvasHeight"],
}

IMAGE_NO_TEXT_PREFIX = (
    "Create an image with absolutely no text: no words, letters, numbers, "
    "labels, captions, signs, watermarks, UI text, or text-like glyphs. "
)

ALLOWED_DIAGRAM_TAGS = {
    "div",
    "span",
    "section",
    "ol",
    "ul",
    "li",
    "h3",
    "p",
    "strong",
    "svg",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
}
ALLOWED_GLOBAL_ATTRIBUTES = {"class", "aria-label", "role"}
ALLOWED_SVG_ATTRIBUTES = {
    "viewbox",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "d",
    "cx",
    "cy",
    "r",
    "x",
    "y",
    "width",
    "height",
    "x1",
    "x2",
    "y1",
    "y2",
    "points",
}
ALLOWED_DIAGRAM_CLASSES = {
    "diagram",
    "hero-diagram",
    "workflow",
    "flow",
    "stack",
    "row",
    "grid",
    "node",
    "node-primary",
    "node-secondary",
    "node-accent",
    "node-muted",
    "arrow",
    "connector",
    "lane",
    "badge",
    "caption",
    "lane-title",
    "compact",
    "medium",
    "large",
    "wide",
    "title",
    "label",
    "detail",
    "note",
    "branch",
    "loop",
    "retry",
    "split",
    "merge",
    "decision",
    "checkpoint",
    "start",
    "end",
    "phase",
    "cause",
    "effect",
    "input",
    "output",
    "evidence",
    "warning",
    "step",
    "step-number",
    "tier",
    "matrix",
    "axis",
    "timeline",
    "timeline-track",
    "swimlane",
    "cycle",
    "card",
    "callout",
    "pulse",
    "draw",
    "reveal",
    "emphasis",
    "edge-label",
    "yes",
    "no",
}

LAYOUT_MODES = {
    "textDominant",
    "visualDominant",
    "balanced",
    "sequence",
    "comparison",
}
THEME_PALETTES = {"slate", "sage", "ember", "indigo", "mono"}
THEME_DENSITIES = {"compact", "comfortable", "spacious"}
THEME_MOTIONS = {"subtle", "none"}
COMPOSITION_BLOCK_KINDS = {
    "heading",
    "notes",
    "callout",
    "diagram",
    "image",
    "comparison",
    "timeline",
}
BLOCK_SIZES = {"compact", "medium", "large", "wide"}
VISUAL_KINDS = {"none", "diagram", "image"}

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


def _clean_int(value: Any, minimum: int, maximum: int, default: int) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return min(max(value, minimum), maximum)
    if isinstance(value, float):
        return min(max(int(value), minimum), maximum)
    if isinstance(value, str):
        try:
            parsed = int(float(value.strip()))
        except ValueError:
            return default
        return min(max(parsed, minimum), maximum)
    return default


def _stable_block_id(kind: str, index: int) -> str:
    safe_kind = re.sub(r"[^a-z0-9]+", "-", kind.lower()).strip("-") or "block"
    return f"{safe_kind}-{index + 1}"


def _cache_terms(value: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", value.lower())
    return {word for word in words if len(word) > 2}


def _cache_key(value: str) -> str:
    normalized = " ".join(re.findall(r"[a-z0-9]+", value.lower()))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _similar_enough(left: str, right: str) -> bool:
    left_terms = _cache_terms(left)
    right_terms = _cache_terms(right)
    if not left_terms or not right_terms:
        return False
    shared = left_terms & right_terms
    if len(shared) < VISUAL_CACHE_MIN_SHARED_TERMS:
        return False
    return len(shared) / len(left_terms | right_terms) >= VISUAL_CACHE_SIMILARITY_THRESHOLD


def _is_composed_result(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("title"), str)
        and value.get("layoutMode") in LAYOUT_MODES
        and isinstance(value.get("theme"), dict)
        and isinstance(value.get("blocks"), list)
    )


class DiagramSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.output: list[str] = []
        self.tag_stack: list[str] = []
        self.skip_depth = 0

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        tag = tag.lower()
        if tag not in ALLOWED_DIAGRAM_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return

        clean_attrs = self._clean_attrs(tag, attrs)
        attr_text = "".join(
            f' {name}="{self._escape(value)}"'
            for name, value in clean_attrs
        )
        self.output.append(f"<{tag}{attr_text}>")
        self.tag_stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag not in ALLOWED_DIAGRAM_TAGS:
            if self.skip_depth:
                self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag in self.tag_stack:
            while self.tag_stack:
                open_tag = self.tag_stack.pop()
                self.output.append(f"</{open_tag}>")
                if open_tag == tag:
                    break

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.output.append(self._escape(data[:500]))

    def get_html(self) -> str:
        while self.tag_stack:
            self.output.append(f"</{self.tag_stack.pop()}>")
        return "".join(self.output).strip()[:16000]

    def _clean_attrs(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> list[tuple[str, str]]:
        clean_attrs: list[tuple[str, str]] = []
        allowed = ALLOWED_GLOBAL_ATTRIBUTES | (
            ALLOWED_SVG_ATTRIBUTES if tag in {"svg", "path", "circle", "rect", "line", "polyline"} else set()
        )
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            value = "" if raw_value is None else raw_value.strip()
            if name.startswith("on") or name not in allowed:
                continue
            if name == "class":
                classes = [
                    item
                    for item in value.split()
                    if item in ALLOWED_DIAGRAM_CLASSES
                ]
                if classes:
                    clean_attrs.append((name, " ".join(classes)))
                continue
            if name == "role" and value not in {"img", "list", "group"}:
                continue
            if re.search(r"javascript:|data:|url\(", value, re.IGNORECASE):
                continue
            clean_attrs.append((name, value[:500]))
        return clean_attrs

    @staticmethod
    def _escape(value: str) -> str:
        return (
            value.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )


def sanitize_diagram_html(value: str) -> str:
    parser = DiagramSanitizer()
    parser.feed(value)
    parser.close()
    return parser.get_html()


class GeminiPipeline:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        text_model: str | None = None,
        image_model: str | None = None,
        diagram_model: str | None = None,
        transport: JsonTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        cache_dir: str | os.PathLike[str] | None = None,
        cache_enabled: bool = True,
    ) -> None:
        self.api_key = (
            api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")
        ).strip()
        self.text_model = (
            text_model
            if text_model is not None
            else os.getenv("GEMINI_TEXT_MODEL", DEFAULT_TEXT_MODEL)
        ).strip()
        self.image_model = (
            image_model
            if image_model is not None
            else os.getenv("GEMINI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
        ).strip()
        self.diagram_model = (
            diagram_model
            if diagram_model is not None
            else os.getenv("GEMINI_DIAGRAM_MODEL", DEFAULT_DIAGRAM_MODEL)
        ).strip()
        self.transport = transport or _default_json_transport
        self.clock = clock
        self.cache_enabled = cache_enabled
        configured_cache_dir = os.getenv("VISUAL_CACHE_DIR", ".cache/visuals")
        self.cache_dir = Path(cache_dir if cache_dir is not None else configured_cache_dir)
        self.cache_lock = Lock()

    async def generate(self, user_input: str) -> dict[str, Any]:
        if not self.api_key:
            raise GeminiConfigurationError("AI generation is not configured.")

        cached = self._get_cached_result(user_input)
        if cached is not None:
            return cached

        notes = await asyncio.to_thread(self._generate_notes, user_input)
        composition = await asyncio.to_thread(
            self._generate_composition,
            user_input,
            notes,
        )
        return composition

    async def generate_visual(
        self,
        visual_strategy: str,
        visual_prompt: str,
        visual_alt: str,
    ) -> dict[str, Any] | None:
        if visual_strategy == "diagram":
            try:
                return await asyncio.to_thread(
                    self._generate_diagram,
                    visual_prompt,
                    visual_alt,
                )
            except GeminiProviderError:
                return None
        if visual_strategy == "image":
            return await self._try_generate_visual(
                {
                    "visualPrompt": visual_prompt,
                    "visualAlt": visual_alt,
                }
            )
        return None

    def cache_result(self, user_input: str, result: dict[str, Any]) -> None:
        self._cache_result(user_input, result)

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

    def _get_cached_result(self, user_input: str) -> dict[str, Any] | None:
        if not self.cache_enabled:
            return None
        with self.cache_lock:
            try:
                entries = sorted(
                    self.cache_dir.glob("*.json"),
                    key=lambda path: path.stat().st_mtime,
                    reverse=True,
                )
            except OSError:
                return None

            for path in entries:
                try:
                    cached = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if not isinstance(cached, dict):
                    continue
                source_input = cached.get("input")
                result = cached.get("result")
                if (
                    isinstance(source_input, str)
                    and isinstance(result, dict)
                    and _is_composed_result(result)
                    and _similar_enough(user_input, source_input)
                ):
                    return result
        return None

    def _cache_result(self, user_input: str, result: dict[str, Any]) -> None:
        if not self.cache_enabled:
            return
        payload = {
            "input": user_input,
            "createdAt": self.clock(),
            "result": result,
        }
        with self.cache_lock:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                path = self.cache_dir / f"{_cache_key(user_input)}.json"
                path.write_text(
                    json.dumps(payload, separators=(",", ":")),
                    encoding="utf-8",
                )
                entries = sorted(
                    self.cache_dir.glob("*.json"),
                    key=lambda item: item.stat().st_mtime,
                    reverse=True,
                )
                for stale_path in entries[VISUAL_CACHE_MAX_ENTRIES:]:
                    stale_path.unlink(missing_ok=True)
            except OSError:
                return

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
        if visual_strategy not in {"none", "diagram", "image"}:
            visual_strategy = "none"
        visual_prompt = _clean_string(structured.get("visualPrompt"), 800)
        visual_alt = _clean_string(structured.get("visualAlt"), 240)

        if visual_strategy != "none" and (not visual_prompt or not visual_alt):
            visual_strategy = "none"

        return {
            "title": title,
            "bullets": bullets,
            "visualStrategy": visual_strategy,
            "visualPrompt": visual_prompt,
            "visualAlt": visual_alt,
        }

    def _generate_composition(
        self,
        user_input: str,
        notes: dict[str, Any],
    ) -> dict[str, Any]:
        planner_input = {
            "userPrompt": user_input,
            "notes": {
                "title": notes["title"],
                "bullets": notes["bullets"],
                "suggestedVisualStrategy": notes["visualStrategy"],
                "suggestedVisualPrompt": notes["visualPrompt"],
                "suggestedVisualAlt": notes["visualAlt"],
            },
        }
        payload = {
            "systemInstruction": {
                "parts": [{"text": PLANNER_SYSTEM_INSTRUCTION}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": json.dumps(
                                planner_input,
                                separators=(",", ":"),
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.25,
                "maxOutputTokens": 900,
                "thinkingConfig": {"thinkingBudget": 0},
                "responseMimeType": "application/json",
                "responseSchema": PLANNER_RESPONSE_SCHEMA,
            },
        }
        response = self._request_model(
            self.text_model,
            payload,
            PLANNER_REQUEST_TIMEOUT_SECONDS,
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
            raise GeminiProviderError("The AI provider returned no composition.")

        try:
            structured = json.loads(text)
        except json.JSONDecodeError as error:
            raise GeminiProviderError(
                "The AI provider returned a malformed composition."
            ) from error

        if not isinstance(structured, dict):
            raise GeminiProviderError(
                "The AI provider returned a malformed composition."
            )

        return self._normalize_composition(structured, notes)

    def _normalize_composition(
        self,
        structured: dict[str, Any],
        notes: dict[str, Any],
    ) -> dict[str, Any]:
        title = _clean_string(structured.get("title"), 120) or notes["title"]
        layout_mode = structured.get("layoutMode")
        if layout_mode not in LAYOUT_MODES:
            layout_mode = (
                "visualDominant"
                if notes["visualStrategy"] in {"diagram", "image"}
                else "textDominant"
            )

        raw_theme = structured.get("theme")
        theme = raw_theme if isinstance(raw_theme, dict) else {}
        palette = theme.get("palette")
        density = theme.get("density")
        motion = theme.get("motion")
        normalized_theme = {
            "palette": palette if palette in THEME_PALETTES else "slate",
            "density": density if density in THEME_DENSITIES else "comfortable",
            "motion": motion if motion in THEME_MOTIONS else "subtle",
        }

        raw_blocks = structured.get("blocks")
        blocks: list[dict[str, Any]] = []
        visual_requests: list[dict[str, str]] = []

        if isinstance(raw_blocks, list):
            for index, raw_block in enumerate(raw_blocks[:5]):
                if not isinstance(raw_block, dict):
                    continue
                block = self._normalize_block(raw_block, index)
                if block is None:
                    continue
                blocks.append(block)
                visual_kind = block.pop("_visualKind")
                visual_prompt = block.pop("_visualPrompt")
                visual_alt = block.pop("_visualAlt")
                if visual_kind in {"diagram", "image"} and visual_prompt and visual_alt:
                    visual_requests.append(
                        {
                            "blockId": block["blockId"],
                            "visualStrategy": visual_kind,
                            "visualPrompt": visual_prompt,
                            "visualAlt": visual_alt,
                        }
                    )

        if not blocks:
            blocks = [
                {
                    "blockId": "notes-1",
                    "kind": "notes",
                    "title": notes["title"],
                    "body": "",
                    "items": notes["bullets"],
                    "size": "medium",
                    "visual": None,
                    "visualJobId": None,
                }
            ]
            if notes["visualStrategy"] in {"diagram", "image"}:
                visual_block = {
                    "blockId": f"{notes['visualStrategy']}-2",
                    "kind": notes["visualStrategy"],
                    "title": "Visual model",
                    "body": "",
                    "items": [],
                    "size": "large",
                    "visual": None,
                    "visualJobId": None,
                }
                blocks.append(visual_block)
                visual_requests.append(
                    {
                        "blockId": visual_block["blockId"],
                        "visualStrategy": notes["visualStrategy"],
                        "visualPrompt": notes["visualPrompt"],
                        "visualAlt": notes["visualAlt"],
                    }
                )

        return {
            "title": title,
            "layoutMode": layout_mode,
            "theme": normalized_theme,
            "blocks": blocks,
            "warning": None,
            "_visualRequests": visual_requests,
        }

    def _normalize_block(
        self,
        raw_block: dict[str, Any],
        index: int,
    ) -> dict[str, Any] | None:
        kind = raw_block.get("kind")
        if kind not in COMPOSITION_BLOCK_KINDS:
            kind = "notes"

        title = _clean_string(raw_block.get("title"), 120)
        body = _clean_string(raw_block.get("body"), 360)
        raw_items = raw_block.get("items")
        items = (
            [
                cleaned
                for item in raw_items[:6]
                if (cleaned := _clean_string(item, 220))
            ]
            if isinstance(raw_items, list)
            else []
        )
        if not title and not body and not items:
            return None

        size = raw_block.get("size")
        if size not in BLOCK_SIZES:
            size = "medium"

        visual_kind = raw_block.get("visualKind")
        if visual_kind not in VISUAL_KINDS:
            visual_kind = "none"

        visual_prompt = _clean_string(raw_block.get("visualPrompt"), 1000)
        visual_alt = _clean_string(raw_block.get("visualAlt"), 240)
        if visual_kind != "none" and (not visual_prompt or not visual_alt):
            visual_kind = "none"
        if kind == "diagram" or visual_kind == "diagram":
            size = "wide"

        return {
            "blockId": _stable_block_id(kind, index),
            "kind": kind,
            "title": title,
            "body": body,
            "items": items,
            "size": size,
            "visual": None,
            "visualJobId": None,
            "_visualKind": visual_kind,
            "_visualPrompt": visual_prompt,
            "_visualAlt": visual_alt,
        }

    def _generate_diagram(
        self,
        visual_prompt: str,
        visual_alt: str,
    ) -> dict[str, Any]:
        payload = {
            "systemInstruction": {
                "parts": [{"text": DIAGRAM_SYSTEM_INSTRUCTION}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": visual_prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.28,
                "maxOutputTokens": 4200,
                "thinkingConfig": {"thinkingBudget": 0},
                "responseMimeType": "application/json",
                "responseSchema": DIAGRAM_RESPONSE_SCHEMA,
            },
        }
        response = self._request_model(
            self.diagram_model,
            payload,
            DIAGRAM_REQUEST_TIMEOUT_SECONDS,
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
            raise GeminiProviderError("The AI provider returned no diagram.")

        try:
            structured = json.loads(text)
        except json.JSONDecodeError as error:
            raise GeminiProviderError(
                "The AI provider returned malformed diagram HTML."
            ) from error
        if not isinstance(structured, dict):
            raise GeminiProviderError(
                "The AI provider returned malformed diagram HTML."
            )

        html = sanitize_diagram_html(_clean_string(structured.get("html"), 18000))
        if not html:
            raise GeminiProviderError("The AI provider returned no diagram.")
        canvas_width = _clean_int(
            structured.get("canvasWidth"),
            900,
            3600,
            1600,
        )
        canvas_height = _clean_int(
            structured.get("canvasHeight"),
            600,
            2800,
            1000,
        )
        return {
            "kind": "diagram",
            "html": html,
            "alt": visual_alt,
            "canvasWidth": canvas_width,
            "canvasHeight": canvas_height,
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
                    "parts": [{"text": f"{IMAGE_NO_TEXT_PREFIX}{visual_prompt}"}],
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
