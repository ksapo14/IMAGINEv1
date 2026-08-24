import unittest

from backend.services.whiteboard_grid import allocate_placement, promote_footprint, repair_stick_scene


class WhiteboardAllocatorTests(unittest.TestCase):
    def test_create_scans_left_to_right_with_one_cell_gutter(self) -> None:
        board = {"currentPage": 1, "scenes": [{
            "sceneId": "one",
            "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5},
        }]}
        footprint, placement = allocate_placement(board, "small")
        self.assertEqual(footprint, "small")
        self.assertEqual((placement["column"], placement["row"]), (9, 0))

    def test_requested_size_is_tried_on_blank_overflow_page(self) -> None:
        board = {"currentPage": 1, "scenes": [{
            "sceneId": "full",
            "placement": {"page": 1, "column": 0, "row": 0, "width": 24, "height": 10},
        }]}
        footprint, placement = allocate_placement(board, "wide")
        self.assertEqual(footprint, "wide")
        self.assertEqual(placement["page"], 2)
        self.assertEqual((placement["width"], placement["height"]), (16, 7))

    def test_backward_navigation_overflows_after_all_occupied_pages(self) -> None:
        board = {
            "currentPage": 1,
            "scenes": [
                {
                    "sceneId": f"full-{page}",
                    "placement": {
                        "page": page,
                        "column": 0,
                        "row": 0,
                        "width": 24,
                        "height": 10,
                    },
                }
                for page in (1, 2, 3)
            ],
        }

        footprint, placement = allocate_placement(board, "wide")

        self.assertEqual(footprint, "wide")
        self.assertEqual(placement["page"], 4)

    def test_update_resizes_at_origin_when_the_exact_size_fits(self) -> None:
        expected = {"page": 2, "column": 0, "row": 0, "width": 12, "height": 6}
        footprint, placement = allocate_placement(
            {"scenes": [{"sceneId": "target", "placement": expected}]},
            "wide", target_scene_id="target",
        )
        self.assertEqual(footprint, "wide")
        self.assertEqual(placement, {"page": 2, "column": 0, "row": 0, "width": 16, "height": 7})

    def test_invalid_occupied_placement_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid placement"):
            allocate_placement(
                {"scenes": [{
                    "sceneId": "bad",
                    "placement": {"page": 1, "column": 23, "row": 0, "width": 8, "height": 5},
                }]},
                "small",
            )

    def test_mode_minimums_promote_only_undersized_requests(self) -> None:
        self.assertEqual(promote_footprint("small", ["visual"]), "medium")
        self.assertEqual(promote_footprint("small", ["notes"]), "small")
        self.assertEqual(promote_footprint("small", ["diagram"]), "medium")
        self.assertEqual(promote_footprint("small", ["visual", "notes"]), "medium")
        self.assertEqual(promote_footprint("medium", ["visual", "diagram"]), "full")
        self.assertEqual(promote_footprint("medium", ["visual", "notes", "diagram"]), "full")
        self.assertEqual(promote_footprint("full", ["notes"]), "full")

    def test_exact_size_exhaustion_raises_instead_of_shrinking_or_overlapping(self) -> None:
        board = {
            "currentPage": 1,
            "scenes": [{
                "sceneId": f"full-{page}",
                "placement": {"page": page, "column": 0, "row": 0, "width": 24, "height": 10},
            } for page in range(1, 49)],
        }
        with self.assertRaisesRegex(ValueError, "exact-size"):
            allocate_placement(board, "small")

    def test_update_relocates_without_moving_an_unrelated_scene(self) -> None:
        blocker = {"page": 1, "column": 9, "row": 0, "width": 12, "height": 6}
        board = {"currentPage": 1, "scenes": [
            {"sceneId": "target", "placement": {"page": 1, "column": 0, "row": 0, "width": 8, "height": 5}},
            {"sceneId": "blocker", "placement": blocker},
        ]}
        _, placement = allocate_placement(board, "full", target_scene_id="target")
        self.assertEqual(placement["page"], 2)
        self.assertEqual(board["scenes"][1]["placement"], blocker)

    def test_internal_scene_repairs_collisions_and_drops_bad_connections(self) -> None:
        entity = {
            "type": "circle", "x": 0, "y": 0, "width": 2, "height": 2,
            "label": "A", "pose": "neutral", "facing": "front",
        }
        scene = repair_stick_scene({
            "entities": [dict(entity, id="a"), dict(entity, id="b")],
            "connections": [{
                "id": "bad", "fromId": "a", "toId": "missing",
                "label": "", "direction": "forward",
            }],
        })
        self.assertNotEqual(
            (scene["entities"][0]["x"], scene["entities"][0]["y"]),
            (scene["entities"][1]["x"], scene["entities"][1]["y"]),
        )
        self.assertEqual(scene["connections"], [])

    def test_duplicate_entity_and_connection_ids_remain_unique(self) -> None:
        entity = {
            "type": "circle", "y": 0, "width": 2, "height": 2,
            "label": "", "pose": "neutral", "facing": "front",
        }
        scene = repair_stick_scene({
            "entities": [
                dict(entity, id="entity-2", x=0),
                dict(entity, id="entity-2", x=3),
                dict(entity, id="other", x=6),
            ],
            "connections": [
                {
                    "id": "connection-2", "fromId": "entity-2", "toId": "other",
                    "label": "", "direction": "forward",
                },
                {
                    "id": "connection-2", "fromId": "other", "toId": "entity-2",
                    "label": "", "direction": "backward",
                },
            ],
        })

        entity_ids = [entity["id"] for entity in scene["entities"]]
        connection_ids = [connection["id"] for connection in scene["connections"]]
        self.assertEqual(len(entity_ids), len(set(entity_ids)))
        self.assertEqual(len(connection_ids), len(set(connection_ids)))
        self.assertTrue(all(
            connection["fromId"] in entity_ids and connection["toId"] in entity_ids
            for connection in scene["connections"]
        ))

    def test_model_coordinates_and_sizes_are_ignored_during_trusted_packing(self) -> None:
        full_entity = {
            "type": "rectangle", "x": 0, "y": 0, "width": 12, "height": 8,
            "label": "", "pose": "neutral", "facing": "front",
        }
        scene = repair_stick_scene({
            "entities": [
                dict(full_entity, id="retained"),
                dict(full_entity, id="dropped"),
            ],
            "connections": [{
                "id": "dangling", "fromId": "dropped", "toId": "retained",
                "label": "", "direction": "forward",
            }],
        })

        self.assertEqual([entity["id"] for entity in scene["entities"]], ["retained", "dropped"])
        self.assertEqual(
            [(entity["x"], entity["y"], entity["width"], entity["height"]) for entity in scene["entities"]],
            [(0, 2, 3, 2), (3, 2, 3, 2)],
        )
        self.assertEqual(len(scene["connections"]), 1)

    def test_scene_layouts_produce_distinct_valid_packings(self) -> None:
        raw = {
            "entities": [
                {
                    "id": f"part-{index}", "type": "circle", "label": str(index),
                    "pose": "neutral", "facing": "front",
                }
                for index in range(5)
            ],
            "connections": [],
        }
        packings = {
            layout: repair_stick_scene(raw, layout)["entities"]
            for layout in ("flow", "cycle", "comparison", "hierarchy", "hub")
        }
        signatures = {
            tuple((entity["x"], entity["y"]) for entity in entities)
            for entities in packings.values()
        }
        self.assertGreaterEqual(len(signatures), 4)
        for entities in packings.values():
            self.assertEqual(len(entities), 5)
            for index, entity in enumerate(entities):
                self.assertLessEqual(entity["x"] + entity["width"], 12)
                self.assertLessEqual(entity["y"] + entity["height"], 8)
                for sibling in entities[index + 1:]:
                    separated = (
                        entity["x"] + entity["width"] <= sibling["x"]
                        or sibling["x"] + sibling["width"] <= entity["x"]
                        or entity["y"] + entity["height"] <= sibling["y"]
                        or sibling["y"] + sibling["height"] <= entity["y"]
                    )
                    self.assertTrue(separated)


if __name__ == "__main__":
    unittest.main()
