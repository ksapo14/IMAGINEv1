"""Training-data and tool-call contract checks; no model or network needed."""

import unittest
from collections import Counter
from unittest.mock import Mock

from backend.services.function_gemma_protocol import parse_function_call
from scripts.train_pitch_router import (
    ToolCallCollator,
    load_examples,
    load_slides,
    split_examples,
    tokenize_case,
    training_case,
)


class PitchRouterTrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.slides = load_slides()
        cls.examples = load_examples(cls.slides)

    def test_all_deck_slides_have_easy_and_hard_examples_and_no_action_context(self) -> None:
        counts = Counter((example.target, example.difficulty) for example in self.examples)
        for slide in self.slides:
            for difficulty in ("easy", "hard"):
                self.assertGreaterEqual(counts[slide["id"], difficulty], 4)
            self.assertTrue(any(example.target == "no_action" and example.current == slide["id"] for example in self.examples))
        self.assertEqual(len(self.slides), 18)

    def test_split_keeps_every_target_and_difficulty_in_train_and_eval(self) -> None:
        train, evaluation = split_examples(self.examples, 42, 0.2)
        self.assertEqual(len(train) + len(evaluation), len(self.examples))
        self.assertFalse(set(train) & set(evaluation))
        self.assertEqual(
            {(example.target, example.difficulty) for example in train},
            {(example.target, example.difficulty) for example in evaluation},
        )

    def test_training_case_matches_live_zero_argument_functions(self) -> None:
        target = next(example for example in self.examples if example.target == "gtm")
        messages, offered, completion = training_case(target, self.slides)
        self.assertEqual(completion, "<start_function_call>call:show_go_to_market{}<end_function_call>")
        self.assertNotIn("show_" + target.current, {function["function"]["name"] for function in offered})
        self.assertEqual(len(offered), len(self.slides))
        self.assertIn('"latest_utterance":', messages[1]["content"])
        self.assertIn('"current_slide":', messages[1]["content"])
        no_action = next(example for example in self.examples if example.target == "no_action")
        self.assertEqual(training_case(no_action, self.slides)[2], "<start_function_call>call:no_action{}<end_function_call>")

    def test_every_labeled_call_is_accepted_by_live_parser(self) -> None:
        for example in self.examples:
            with self.subTest(example=example.utterance):
                _, offered, completion = training_case(example, self.slides)
                candidates = [slide for slide in self.slides if slide["id"] != example.current]
                available = {function["function"]["name"]: slide["id"] for function, slide in zip(offered, candidates)}
                decision = parse_function_call(completion, available)
                self.assertEqual("no_action" if decision["action"] == "no_action" else decision["slide_id"], example.target)

    def test_only_tool_call_tokens_receive_loss(self) -> None:
        example = next(example for example in self.examples if example.target == "financials")
        processor = Mock()
        processor.apply_chat_template.return_value = {"input_ids": [Mock(tolist=Mock(return_value=[11, 12]))]}
        processor.tokenizer.encode.return_value = [21, 22, 23]
        processor.decode.return_value = training_case(example, self.slides)[2]
        row = tokenize_case(processor, example, self.slides, 10)
        self.assertEqual(row["input_ids"], [11, 12, 21, 22, 23])
        self.assertEqual(row["labels"], [-100, -100, 21, 22, 23])
        self.assertEqual(row["attention_mask"], [1] * 5)
        with self.assertRaisesRegex(ValueError, "above --max-length"):
            tokenize_case(processor, example, self.slides, 4)

    def test_collator_masks_padding(self) -> None:
        collator = ToolCallCollator(0)
        batch = collator([
            {"input_ids": [1, 2], "attention_mask": [1, 1], "labels": [-100, 2]},
            {"input_ids": [3], "attention_mask": [1], "labels": [3]},
        ])
        self.assertEqual(batch["input_ids"].tolist(), [[1, 2], [3, 0]])
        self.assertEqual(batch["attention_mask"].tolist(), [[1, 1], [1, 0]])
        self.assertEqual(batch["labels"].tolist(), [[-100, 2], [3, -100]])


if __name__ == "__main__":
    unittest.main()
