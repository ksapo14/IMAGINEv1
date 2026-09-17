"""Bounded Iconify lookups for animation objects that lack a local SVG."""

import asyncio
import base64
import json
import re
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as element_tree
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


ICONIFY_API_BASE_URL = "https://api.iconify.design"
ALLOWED_PREFIXES = ("lucide", "tabler")
COLLECTION_ATTRIBUTION = {
    "lucide": "Lucide Icons · ISC · lucide.dev",
    "tabler": "Tabler Icons · MIT · tabler.io/icons",
}
SUCCESS_CACHE_TTL_SECONDS = 24 * 60 * 60
MISS_CACHE_TTL_SECONDS = 5 * 60
MAX_CACHE_ENTRIES = 256
RESOLVE_TIMEOUT_SECONDS = 1.5
MAX_CONCURRENT_FETCHES = 3


@dataclass(frozen=True)
class ResolvedAnimationAsset:
    """A safe image data URL plus the source identifier used for attribution."""

    term: str
    icon_id: str
    data_url: str
    attribution: str


@dataclass(frozen=True)
class _CacheEntry:
    value: ResolvedAnimationAsset | None
    expires_at: float


def _read_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read(50_001)
    if len(payload) > 50_000:
        return {}
    parsed = json.loads(payload.decode("utf-8"))
    return parsed if isinstance(parsed, dict) else {}


def _read_svg(url: str, timeout: float) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "image/svg+xml"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(50_001)


def sanitize_svg(svg: bytes) -> bytes | None:
    """Allow a small static SVG subset before data is rendered as an image source."""
    if not svg or len(svg) > 50_000 or b"<!" in svg or b"<?" in svg:
        return None
    try:
        root = element_tree.fromstring(svg)
    except element_tree.ParseError:
        return None
    if root.tag.rsplit("}", 1)[-1] != "svg":
        return None
    allowed_tags = {"svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect"}
    common_attributes = {
        "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width",
        "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "transform",
    }
    element_attributes = {
        "svg": {"viewBox", "width", "height", "preserveAspectRatio", "xmlns"},
        "path": {"d"},
        "circle": {"cx", "cy", "r"},
        "ellipse": {"cx", "cy", "rx", "ry"},
        "line": {"x1", "x2", "y1", "y2"},
        "polyline": {"points"},
        "polygon": {"points"},
        "rect": {"x", "y", "width", "height", "rx", "ry"},
        "g": set(),
    }
    for node in root.iter():
        node_name = node.tag.rsplit("}", 1)[-1]
        if node_name not in allowed_tags or (node.text and node.text.strip()) or (node.tail and node.tail.strip()):
            return None
        for name, value in node.attrib.items():
            local_name = name.rsplit("}", 1)[-1].lower()
            lowered = value.lower().strip()
            if local_name not in common_attributes | {attribute.lower() for attribute in element_attributes[node_name]}:
                return None
            if "url(" in lowered or "@import" in lowered or "javascript:" in lowered or ";" in lowered:
                return None
    return element_tree.tostring(root, encoding="utf-8", method="xml")


class AnimationAssetResolver:
    """Resolve up to six terms within one deadline while sharing a small cache."""

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        json_reader: Callable[[str, float], dict[str, Any]] = _read_json,
        svg_reader: Callable[[str, float], bytes] = _read_svg,
    ) -> None:
        self.clock = clock
        self.json_reader = json_reader
        self.svg_reader = svg_reader
        self.cache: OrderedDict[str, _CacheEntry] = OrderedDict()
        self.in_flight: dict[str, asyncio.Task[ResolvedAnimationAsset | None]] = {}
        self.lock = asyncio.Lock()
        # This lock lives inside worker threads, so timeout cancellation cannot
        # accidentally start more provider calls than the process allows.
        self.request_semaphore = threading.BoundedSemaphore(MAX_CONCURRENT_FETCHES)

    async def resolve(self, terms: list[str]) -> tuple[list[ResolvedAnimationAsset], list[str]]:
        """Return cached or fetched assets without allowing a slow icon to delay playback."""
        unique_terms = list(dict.fromkeys(terms))
        deadline = self.clock() + RESOLVE_TIMEOUT_SECONDS
        tasks = [asyncio.create_task(self._resolve_term(term, deadline)) for term in unique_terms]
        done, pending = await asyncio.wait(tasks, timeout=max(0.0, deadline - self.clock()))
        for task in pending:
            task.cancel()
        resolved_by_term: dict[str, ResolvedAnimationAsset] = {}
        for task in done:
            try:
                asset = task.result()
            except (asyncio.CancelledError, Exception):
                asset = None
            if asset is not None:
                resolved_by_term[asset.term] = asset
        assets = [resolved_by_term[term] for term in unique_terms if term in resolved_by_term]
        unresolved = [term for term in unique_terms if term not in resolved_by_term]
        return assets, unresolved

    async def _resolve_term(self, term: str, deadline: float) -> ResolvedAnimationAsset | None:
        async with self.lock:
            now = self.clock()
            cached = self.cache.get(term)
            if cached and cached.expires_at > now:
                self.cache.move_to_end(term)
                return cached.value
            if cached:
                self.cache.pop(term, None)
            task = self.in_flight.get(term)
            if task is None:
                task = asyncio.create_task(self._fetch_and_cache(term, deadline))
                self.in_flight[term] = task
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=max(0.0, deadline - self.clock()))
        except (asyncio.TimeoutError, asyncio.CancelledError):
            return None

    async def _fetch_and_cache(self, term: str, deadline: float) -> ResolvedAnimationAsset | None:
        try:
            asset = await asyncio.to_thread(self._fetch, term, deadline)
        except Exception:
            asset = None
        async with self.lock:
            ttl = SUCCESS_CACHE_TTL_SECONDS if asset is not None else MISS_CACHE_TTL_SECONDS
            self.cache[term] = _CacheEntry(asset, self.clock() + ttl)
            self.cache.move_to_end(term)
            while len(self.cache) > MAX_CACHE_ENTRIES:
                self.cache.popitem(last=False)
            self.in_flight.pop(term, None)
        return asset

    def _fetch(self, term: str, deadline: float) -> ResolvedAnimationAsset | None:
        # Every HTTP request acquires the process-wide cap, including requests
        # whose coroutine has timed out but whose worker thread is still ending.
        with self.request_semaphore:
            for prefix in ALLOWED_PREFIXES:
                remaining = deadline - self.clock()
                if remaining <= 0:
                    return None
                query = urllib.parse.urlencode({"query": term, "prefix": prefix})
                search = self.json_reader(f"{ICONIFY_API_BASE_URL}/search?{query}", remaining)
                icons = search.get("icons")
                icon_id = f"{prefix}:{term}" if isinstance(icons, list) and f"{prefix}:{term}" in icons else None
                if not icon_id:
                    continue
                remaining = deadline - self.clock()
                if remaining <= 0:
                    return None
                _, name = icon_id.split(":", 1)
                svg = sanitize_svg(self.svg_reader(f"{ICONIFY_API_BASE_URL}/{prefix}/{name}.svg", remaining))
                if svg is None:
                    continue
                data_url = "data:image/svg+xml;base64," + base64.b64encode(svg).decode("ascii")
                return ResolvedAnimationAsset(
                    term=term,
                    icon_id=icon_id,
                    data_url=data_url,
                    attribution=f"Iconify · {icon_id} · {COLLECTION_ATTRIBUTION[prefix]}",
                )
        return None
