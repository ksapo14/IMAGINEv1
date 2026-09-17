"""Pure, deterministic placement for board scenes and local stick primitives."""

from typing import Any


BOARD_COLUMNS = 24
BOARD_ROWS = 14
SCENE_COLUMNS = 12
SCENE_ROWS = 8
FOOTPRINTS: dict[str, tuple[int, int]] = {
    "small": (8, 5),
    "medium": (12, 6),
    "wide": (16, 7),
    "full": (24, 10),
}
FOOTPRINT_ORDER = ("small", "medium", "wide", "full")
MAX_BOARD_PAGES = 48


def _integer(value: Any, fallback: int) -> int:
    """Return an integer without accepting booleans as coordinates."""
    return value if isinstance(value, int) and not isinstance(value, bool) else fallback


def valid_placement(value: Any) -> bool:
    """Check one named presentation footprint against the fixed board."""
    if not isinstance(value, dict):
        return False
    page = _integer(value.get("page"), 0)
    column = _integer(value.get("column"), -1)
    row = _integer(value.get("row"), -1)
    width = _integer(value.get("width"), 0)
    height = _integer(value.get("height"), 0)
    return (
        1 <= page <= MAX_BOARD_PAGES
        and column >= 0
        and row >= 0
        and (width, height) in FOOTPRINTS.values()
        and column + width <= BOARD_COLUMNS
        and row + height <= BOARD_ROWS
    )


def _conflicts(candidate: dict[str, int], occupied: dict[str, int]) -> bool:
    """Treat touching scene edges as occupied to provide a one-cell gutter."""
    if candidate["page"] != occupied["page"]:
        return False
    return not (
        candidate["column"] + candidate["width"] < occupied["column"]
        or occupied["column"] + occupied["width"] < candidate["column"]
        or candidate["row"] + candidate["height"] < occupied["row"]
        or occupied["row"] + occupied["height"] < candidate["row"]
    )


def allocate_placement(
    board: dict[str, Any],
    requested_footprint: str,
    *,
    target_scene_id: str | None = None,
) -> tuple[str, dict[str, int]]:
    """Allocate the exact requested size without moving unrelated scenes.

    CREATE searches the current page, then the remaining bounded pages. UPDATE
    first tests the target's origin at the new size, then performs the same
    row-major search while excluding the target from collision checks.
    """
    scenes = board.get("scenes") if isinstance(board, dict) else []
    scene_list = scenes if isinstance(scenes, list) else []

    occupied: list[dict[str, int]] = []
    target_placement: dict[str, int] | None = None
    for scene in scene_list:
        if not isinstance(scene, dict):
            raise ValueError("Board scenes must be objects.")
        placement = scene.get("placement")
        if not valid_placement(placement):
            raise ValueError("An occupied scene has an invalid placement.")
        if target_scene_id and scene.get("sceneId") == target_scene_id:
            if target_placement is not None:
                raise ValueError("The target scene is duplicated on the board.")
            target_placement = dict(placement)
            continue
        occupied.append(dict(placement))
    if target_scene_id and target_placement is None:
        raise ValueError("The target scene is not present on the board.")
    if requested_footprint not in FOOTPRINTS:
        raise ValueError("The requested footprint is invalid.")

    width, height = FOOTPRINTS[requested_footprint]
    current_page = min(MAX_BOARD_PAGES, max(1, _integer(board.get("currentPage"), 1)))

    if target_placement is not None:
        origin = {
            **target_placement,
            "width": width,
            "height": height,
        }
        if valid_placement(origin) and not any(
            _conflicts(origin, item) for item in occupied
        ):
            return requested_footprint, origin
        preferred_page = target_placement["page"]
    else:
        preferred_page = current_page

    pages = (preferred_page, *(
        page for page in range(1, MAX_BOARD_PAGES + 1) if page != preferred_page
    ))
    for page in pages:
        for row in range(BOARD_ROWS - height + 1):
            for column in range(BOARD_COLUMNS - width + 1):
                candidate = {
                    "page": page,
                    "column": column,
                    "row": row,
                    "width": width,
                    "height": height,
                }
                if not any(_conflicts(candidate, item) for item in occupied):
                    return requested_footprint, candidate

    raise ValueError("No legal exact-size placement is available.")


def promote_footprint(requested_footprint: str, content_modes: list[str]) -> str:
    """Promote only undersized requests to the minimum legible mode footprint."""
    if requested_footprint not in FOOTPRINTS:
        raise ValueError("The requested footprint is invalid.")
    if not content_modes:
        raise ValueError("At least one content mode is required.")
    mode_set = set(content_modes)
    minimum = "full" if (
        len(content_modes) == 3 or {"visual", "diagram"}.issubset(mode_set)
    ) else (
        "medium" if len(content_modes) == 2 or "diagram" in mode_set or content_modes == ["visual"]
        else "small"
    )
    return FOOTPRINT_ORDER[max(
        FOOTPRINT_ORDER.index(requested_footprint),
        FOOTPRINT_ORDER.index(minimum),
    )]


def _overlaps(first: dict[str, Any], second: dict[str, Any]) -> bool:
    return not (
        first["x"] + first["width"] <= second["x"]
        or second["x"] + second["width"] <= first["x"]
        or first["y"] + first["height"] <= second["y"]
        or second["y"] + second["height"] <= first["y"]
    )


def _safe_identifier(value: Any, fallback: str) -> str:
    """Keep identifiers data-only and stable for connection references."""
    if not isinstance(value, str):
        return fallback
    identifier = "".join(character for character in value if character.isalnum() or character in "_-")
    return identifier[:40] or fallback


def _unique_identifier(value: Any, fallback: str, used_ids: set[str]) -> str:
    """Choose a bounded identifier that cannot collide with a retained item."""
    identifier = _safe_identifier(value, fallback)
    if identifier not in used_ids:
        return identifier

    base = _safe_identifier(fallback, "item")
    suffix = 2
    while True:
        suffix_text = f"-{suffix}"
        candidate = f"{base[:40 - len(suffix_text)]}{suffix_text}"
        if candidate not in used_ids:
            return candidate
        suffix += 1


SCENE_LAYOUTS = ("flow", "cycle", "comparison", "hierarchy", "hub")


def repair_stick_scene(raw_scene: Any, scene_layout: str = "flow") -> dict[str, Any]:
    """Normalize and pack a 12 by 8 scene using one trusted teaching layout."""
    source = raw_scene if isinstance(raw_scene, dict) else {}
    layout = scene_layout if scene_layout in SCENE_LAYOUTS else "flow"
    raw_entities = source.get("entities")
    entities: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    for index, raw in enumerate(raw_entities[:6] if isinstance(raw_entities, list) else []):
        if not isinstance(raw, dict):
            continue
        entity_type = raw.get("type")
        if entity_type not in {"stickFigure", "circle", "rectangle"}:
            continue
        identifier = _unique_identifier(
            raw.get("id"),
            f"entity-{index + 1}",
            used_ids,
        )
        width, height = (2, 3) if entity_type == "stickFigure" else (
            (3, 2) if entity_type == "rectangle" else (2, 2)
        )
        position = _first_open_position(
            width,
            height,
            entities,
            layout,
            len(entities),
        )
        if position is None:
            continue
        entity = {
            "id": identifier,
            "type": entity_type,
            "x": position[0],
            "y": position[1],
            "width": width,
            "height": height,
            "label": _short_text(raw.get("label"), 32),
            "pose": raw.get("pose")
            if raw.get("pose") in {"neutral", "pointing", "walking", "holding", "raisedArms"}
            else "neutral",
            "facing": raw.get("facing")
            if raw.get("facing") in {"left", "right", "front"}
            else "front",
        }
        entities.append(entity)
        used_ids.add(identifier)

    connections: list[dict[str, Any]] = []
    connection_ids: set[str] = set()
    retained_entity_ids = {entity["id"] for entity in entities}
    raw_connections = source.get("connections")
    for index, raw in enumerate(
        raw_connections[:6] if isinstance(raw_connections, list) else []
    ):
        if not isinstance(raw, dict):
            continue
        from_id = _safe_identifier(raw.get("fromId"), "")
        to_id = _safe_identifier(raw.get("toId"), "")
        if (
            from_id not in retained_entity_ids
            or to_id not in retained_entity_ids
            or from_id == to_id
        ):
            continue
        identifier = _unique_identifier(
            raw.get("id"),
            f"connection-{index + 1}",
            connection_ids,
        )
        connections.append(
            {
                "id": identifier,
                "fromId": from_id,
                "toId": to_id,
                "label": _short_text(raw.get("label"), 28),
                "direction": raw.get("direction")
                if raw.get("direction") in {"forward", "backward", "both", "none"}
                else "forward",
            }
        )
        connection_ids.add(identifier)

    return {
        "version": 1,
        "columns": SCENE_COLUMNS,
        "rows": SCENE_ROWS,
        "entities": entities,
        "connections": connections,
    }


def _first_open_position(
    width: int,
    height: int,
    entities: list[dict[str, Any]],
    scene_layout: str = "flow",
    entity_index: int = 0,
) -> tuple[int, int] | None:
    """Find the closest free cell to a layout-specific semantic anchor."""
    anchors = {
        "flow": ((0, 2), (3, 2), (6, 2), (9, 2), (3, 5), (7, 5)),
        "cycle": ((5, 0), (9, 1), (9, 5), (5, 5), (0, 5), (0, 1)),
        "comparison": ((1, 0), (8, 0), (1, 3), (8, 3), (1, 6), (8, 6)),
        "hierarchy": ((5, 0), (1, 3), (5, 3), (9, 3), (3, 6), (7, 6)),
        "hub": ((5, 3), (0, 0), (9, 0), (0, 5), (9, 5), (5, 6)),
    }
    anchor_x, anchor_y = anchors[scene_layout][entity_index % 6]
    candidates = [
        (x, y)
        for y in range(SCENE_ROWS - height + 1)
        for x in range(SCENE_COLUMNS - width + 1)
    ]
    candidates.sort(
        key=lambda position: (
            (position[0] - anchor_x) ** 2 + (position[1] - anchor_y) ** 2,
            position[1],
            position[0],
        )
    )
    for x, y in candidates:
        candidate = {"x": x, "y": y, "width": width, "height": height}
        if not any(_overlaps(candidate, entity) for entity in entities):
            return x, y
    return None


def _short_text(value: Any, maximum: int) -> str:
    return " ".join(value.split())[:maximum].strip() if isinstance(value, str) else ""
