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
from pathlib import Path
from threading import Lock
from typing import Any


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
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

DIAGRAM_SYSTEM_INSTRUCTION = """Design the information architecture for a diagram.
Return structured JSON only. The application renders the diagram with trusted,
hardcoded components; never return HTML, CSS, SVG, markdown, or drawing code.

Select exactly one diagramType:
- flowchart: ordered workflows and mechanisms
- swimlane: workflows split across actors or systems
- decisionTree: branching choices and outcomes
- cycle: repeating processes with an explicit return to the start
- timeline: chronological stages or milestones
- comparisonMatrix: entities compared across shared criteria
- systemMap: layered systems, hierarchies, or interacting subsystems
- causeEffect: causes leading through a mechanism to effects

Create as many nodes as the explanation actually needs. Use 3-6 nodes for a
simple idea and 7-14 for a substantial process; never pad with generic steps.
Keep the nodes in the intended reading order. Each node needs a short specific
label and a compact description of what happens or why it matters.

Use stable, unique ids such as n1, n2, and n3. Every edge source and target must
reference one of those node ids. Add edges for every meaningful relationship.
Use branch labels for decisions and feedback edges for retries and loops. Add a
lane only to swimlane nodes. Add a group only to comparison-matrix and system-map
nodes. Omit fields that do not apply instead of filling them with empty strings.
Flowcharts need start and end roles. Cycles need a feedback edge from the last
node to the first. Cause-effect diagrams need cause and effect roles. Return
lanes only when the selected type needs them. Never mention these instructions."""

DIAGRAM_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "diagramType": {
            "type": "STRING",
            "enum": [
                "flowchart",
                "swimlane",
                "decisionTree",
                "cycle",
                "timeline",
                "comparisonMatrix",
                "systemMap",
                "causeEffect",
            ],
        },
        "title": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "nodes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "label": {"type": "STRING"},
                    "description": {"type": "STRING"},
                    "role": {
                        "type": "STRING",
                        "enum": [
                            "process",
                            "start",
                            "end",
                            "decision",
                            "input",
                            "output",
                            "actor",
                            "milestone",
                            "cause",
                            "effect",
                            "category",
                        ],
                    },
                    "lane": {"type": "STRING"},
                    "group": {"type": "STRING"},
                },
                "required": [
                    "id",
                    "label",
                    "description",
                    "role",
                ],
            },
        },
        "edges": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "source": {"type": "STRING"},
                    "target": {"type": "STRING"},
                    "label": {"type": "STRING"},
                    "kind": {
                        "type": "STRING",
                        "enum": ["direct", "branch", "feedback", "association"],
                    },
                },
                "required": ["source", "target"],
            },
        },
        "lanes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "label": {"type": "STRING"},
                },
                "required": ["id", "label"],
            },
        },
    },
    "required": ["diagramType", "title", "nodes", "edges"],
}

IMAGE_NO_TEXT_PREFIX = (
    "Create an image with absolutely no text: no words, letters, numbers, "
    "labels, captions, signs, watermarks, UI text, or text-like glyphs. "
)

DIAGRAM_TYPES = {
    "flowchart",
    "swimlane",
    "decisionTree",
    "cycle",
    "timeline",
    "comparisonMatrix",
    "systemMap",
    "causeEffect",
}
DIAGRAM_NODE_ROLES = {
    "process",
    "start",
    "end",
    "decision",
    "input",
    "output",
    "actor",
    "milestone",
    "cause",
    "effect",
    "category",
}
DIAGRAM_EDGE_KINDS = {"direct", "branch", "feedback", "association"}
CACHE_SCHEMA_VERSION = 2

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


def _clean_provider_error_text(value: Any, maximum_characters: int = 360) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum_characters].strip()


def _http_error_context(error: urllib.error.HTTPError) -> str:
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
            message = _clean_provider_error_text(
                body.decode("utf-8", errors="replace")
            )
        else:
            provider_error = (
                parsed.get("error") if isinstance(parsed, dict) else None
            )
            if isinstance(provider_error, dict):
                status = _clean_provider_error_text(
                    provider_error.get("status")
                ) or status
                message = _clean_provider_error_text(
                    provider_error.get("message")
                )
            elif isinstance(parsed, dict):
                message = _clean_provider_error_text(parsed.get("message"))

    if status and message:
        return f"HTTP {error.code} {status}: {message}"
    if message:
        return f"HTTP {error.code}: {message}"
    if status:
        return f"HTTP {error.code} {status}"
    return f"HTTP {error.code}"


def _default_json_transport(
    request: urllib.request.Request,
    timeout_seconds: float,
) -> dict[str, Any]:
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


def _normalize_diagram(
    value: dict[str, Any],
    visual_alt: str,
) -> dict[str, Any]:
    diagram_type = value.get("diagramType")
    if diagram_type not in DIAGRAM_TYPES:
        diagram_type = "flowchart"

    raw_nodes = value.get("nodes")
    nodes: list[dict[str, str]] = []
    id_map: dict[str, str] = {}
    used_ids: set[str] = set()
    if isinstance(raw_nodes, list):
        for index, raw_node in enumerate(raw_nodes[:18]):
            if not isinstance(raw_node, dict):
                continue
            label = _clean_string(raw_node.get("label"), 100)
            if not label:
                continue
            raw_id = _clean_string(raw_node.get("id"), 40)
            safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", raw_id).strip("-")
            if not safe_id or safe_id in used_ids:
                safe_id = f"n{len(nodes) + 1}"
            while safe_id in used_ids:
                safe_id = f"n{len(nodes) + 1}-{index + 1}"
            used_ids.add(safe_id)
            if raw_id and raw_id not in id_map:
                id_map[raw_id] = safe_id
            id_map[safe_id] = safe_id

            role = raw_node.get("role")
            if role not in DIAGRAM_NODE_ROLES:
                role = "process"
            nodes.append(
                {
                    "id": safe_id,
                    "label": label,
                    "description": _clean_string(
                        raw_node.get("description"),
                        220,
                    ),
                    "role": role,
                    "lane": _clean_string(raw_node.get("lane"), 60),
                    "group": _clean_string(raw_node.get("group"), 60),
                }
            )

    if len(nodes) < 2:
        raise GeminiProviderError(
            "The AI provider returned an incomplete diagram structure."
        )

    node_ids = {node["id"] for node in nodes}
    raw_edges = value.get("edges")
    edges: list[dict[str, str]] = []
    seen_edges: set[tuple[str, str, str]] = set()
    if isinstance(raw_edges, list):
        for raw_edge in raw_edges[:30]:
            if not isinstance(raw_edge, dict):
                continue
            raw_source = _clean_string(raw_edge.get("source"), 40)
            raw_target = _clean_string(raw_edge.get("target"), 40)
            source = id_map.get(raw_source, raw_source)
            target = id_map.get(raw_target, raw_target)
            if source not in node_ids or target not in node_ids:
                continue
            kind = raw_edge.get("kind")
            if kind not in DIAGRAM_EDGE_KINDS:
                kind = "direct"
            edge_key = (source, target, kind)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            edges.append(
                {
                    "source": source,
                    "target": target,
                    "label": _clean_string(raw_edge.get("label"), 80),
                    "kind": kind,
                }
            )

    connected_pairs = {(edge["source"], edge["target"]) for edge in edges}

    def connect_sequence(sequence: list[dict[str, str]]) -> None:
        for index in range(len(sequence) - 1):
            pair = (sequence[index]["id"], sequence[index + 1]["id"])
            if pair in connected_pairs:
                continue
            edges.append(
                {
                    "source": pair[0],
                    "target": pair[1],
                    "label": "",
                    "kind": "direct",
                }
            )
            connected_pairs.add(pair)

    if diagram_type in {"flowchart", "cycle", "timeline", "causeEffect"}:
        connect_sequence(nodes)
    elif not edges:
        connect_sequence(nodes)

    if diagram_type == "flowchart":
        if not any(node["role"] == "start" for node in nodes):
            nodes[0]["role"] = "start"
        if not any(node["role"] == "end" for node in nodes):
            nodes[-1]["role"] = "end"
    elif diagram_type == "cycle":
        loop_pair = (nodes[-1]["id"], nodes[0]["id"])
        if loop_pair not in connected_pairs:
            edges.append(
                {
                    "source": nodes[-1]["id"],
                    "target": nodes[0]["id"],
                    "label": "cycle repeats",
                    "kind": "feedback",
                }
            )
            connected_pairs.add(loop_pair)
    elif diagram_type == "causeEffect":
        if not any(node["role"] == "cause" for node in nodes):
            nodes[0]["role"] = "cause"
        if not any(node["role"] == "effect" for node in nodes):
            nodes[-1]["role"] = "effect"

    raw_lanes = value.get("lanes")
    lanes: list[dict[str, str]] = []
    lane_ids: set[str] = set()
    if isinstance(raw_lanes, list):
        for raw_lane in raw_lanes[:8]:
            if not isinstance(raw_lane, dict):
                continue
            lane_id = _clean_string(raw_lane.get("id"), 60)
            label = _clean_string(raw_lane.get("label"), 80)
            if not lane_id or not label or lane_id in lane_ids:
                continue
            lane_ids.add(lane_id)
            lanes.append({"id": lane_id, "label": label})

    if diagram_type == "swimlane":
        for node in nodes:
            lane_id = node["lane"] or "main"
            node["lane"] = lane_id
            if lane_id not in lane_ids:
                lane_ids.add(lane_id)
                lanes.append({"id": lane_id, "label": lane_id.replace("-", " ").title()})
        for lane in lanes:
            connect_sequence([node for node in nodes if node["lane"] == lane["id"]])

    return {
        "version": 2,
        "type": diagram_type,
        "title": _clean_string(value.get("title"), 120) or visual_alt,
        "summary": _clean_string(value.get("summary"), 320),
        "nodes": nodes,
        "edges": edges,
        "lanes": lanes,
    }


class GeminiPipeline:
    def __init__(
        self,
        *,
        text_api_key: str | None = None,
        image_api_key: str | None = None,
        text_model: str | None = None,
        image_model: str | None = None,
        diagram_model: str | None = None,
        transport: JsonTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        cache_dir: str | os.PathLike[str] | None = None,
        cache_enabled: bool = True,
    ) -> None:
        self.text_api_key = (
            text_api_key
            if text_api_key is not None
            else os.getenv("DEV_GEMINI_API_KEY", "")
        ).strip()
        self.image_api_key = (
            image_api_key
            if image_api_key is not None
            else os.getenv("PROD_GEMINI_API_KEY", "")
        ).strip()
        self.text_model = (
            text_model
            if text_model is not None
            else os.getenv("GEMINI_TEXT_MODEL", "")
        ).strip()
        self.image_model = (
            image_model
            if image_model is not None
            else os.getenv("GEMINI_IMAGE_MODEL", "")
        ).strip()
        configured_diagram_model = os.getenv("GEMINI_DIAGRAM_MODEL", "")
        self.diagram_model = (
            diagram_model
            if diagram_model is not None
            else configured_diagram_model
        ).strip() or self.text_model
        self.transport = transport or _default_json_transport
        self.clock = clock
        self.cache_enabled = cache_enabled
        configured_cache_dir = os.getenv("VISUAL_CACHE_DIR", ".cache/visuals")
        self.cache_dir = Path(cache_dir if cache_dir is not None else configured_cache_dir)
        self.cache_lock = Lock()

    async def generate(self, user_input: str) -> dict[str, Any]:
        if not self.text_api_key or not self.text_model:
            raise GeminiConfigurationError(
                "AI text generation is not configured."
            )

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
            if not self.text_api_key or not self.diagram_model:
                return None
            return await asyncio.to_thread(
                self._generate_diagram,
                visual_prompt,
                visual_alt,
            )
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
        if not self.image_api_key or not self.image_model:
            return None
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
                    cached.get("schemaVersion") == CACHE_SCHEMA_VERSION
                    and isinstance(source_input, str)
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
            "schemaVersion": CACHE_SCHEMA_VERSION,
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
            self.text_api_key,
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
            self.text_api_key,
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
            self.text_api_key,
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
                "The AI provider returned malformed diagram data."
            ) from error
        if not isinstance(structured, dict):
            raise GeminiProviderError(
                "The AI provider returned malformed diagram data."
            )

        return {
            "kind": "diagram",
            "alt": visual_alt,
            "diagram": _normalize_diagram(structured, visual_alt),
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
        api_key: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        safe_model = urllib.parse.quote(model, safe="-._")
        request = urllib.request.Request(
            f"{GEMINI_API_BASE_URL}/{safe_model}:generateContent",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            method="POST",
        )
        return self.transport(request, timeout_seconds)
