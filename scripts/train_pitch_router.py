"""Fine-tune FunctionGemma for the exact tool calls used by Pitch Mode.

Run ``python scripts/train_pitch_router.py --dry-run`` to validate data without
model dependencies. Run with ``torchrun`` for one or more H200 GPUs.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.evaluate import MODEL_ID, PITCH_DIRECTOR_INSTRUCTION, tools  # noqa: E402
from backend.services.function_gemma_protocol import ProtocolError, parse_function_call  # noqa: E402

DATA_PATH = ROOT / "data" / "pitch-router-examples.psv"
DECK_PATH = ROOT / "lib" / "pitch" / "deck.ts"
SLIDE_PATTERN = re.compile(r'\{\s*id: "([a-z0-9_-]+)", title: "([^"]+)", description: "([^"]+)"\s*\}')


@dataclass(frozen=True)
class Example:
    target: str
    current: str
    difficulty: str
    utterance: str


def load_slides(path: Path = DECK_PATH) -> list[dict[str, str]]:
    """Read the app's own slide metadata, avoiding a second training-only deck."""
    source = path.read_text(encoding="utf-8")
    slides = [dict(zip(("id", "title", "description"), match)) for match in SLIDE_PATTERN.findall(source)]
    if len(slides) != 18 or len({slide["id"] for slide in slides}) != len(slides):
        raise ValueError(f"Expected the 18 unique pitch slides in {path}; review the deck or parser.")
    return slides


def load_examples(slides: list[dict[str, str]], path: Path = DATA_PATH) -> list[Example]:
    slide_ids = {slide["id"] for slide in slides}
    examples: list[Example] = []
    seen: set[str] = set()
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="|")
        if reader.fieldnames != ["target", "current", "difficulty", "utterance"]:
            raise ValueError("Training data needs target|current|difficulty|utterance columns.")
        for line_number, row in enumerate(reader, 2):
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed training row at line {line_number}.")
            example = Example(**{key: value.strip() for key, value in row.items()})
            if (example.target not in slide_ids | {"no_action"} or example.current not in slide_ids
                    or example.difficulty not in {"easy", "hard"} or not example.utterance
                    or example.target == example.current):
                raise ValueError(f"Invalid target, current slide, difficulty, or text at line {line_number}.")
            normalized = " ".join(example.utterance.casefold().split())
            if normalized in seen:
                raise ValueError(f"Duplicate utterance at line {line_number}.")
            seen.add(normalized)
            examples.append(example)
    counts = Counter((example.target, example.difficulty) for example in examples)
    missing = [(slide["id"], difficulty) for slide in slides for difficulty in ("easy", "hard")
               if counts[slide["id"], difficulty] < 4]
    if missing:
        raise ValueError(f"At least four easy and four hard examples are required for every slide: {missing}")
    no_action_contexts = Counter(example.current for example in examples if example.target == "no_action")
    if any(no_action_contexts[slide_id] < 5 for slide_id in slide_ids) or counts["no_action", "easy"] < 4 or counts["no_action", "hard"] < 4:
        raise ValueError("no_action needs easy and hard examples and at least five for every current slide.")
    return examples


def split_examples(examples: list[Example], seed: int, eval_fraction: float) -> tuple[list[Example], list[Example]]:
    """Reserve examples for every slide and both difficulty levels."""
    if not 0 < eval_fraction < 0.5:
        raise ValueError("--eval-fraction must be greater than 0 and less than 0.5.")
    groups: dict[tuple[str, str], list[Example]] = defaultdict(list)
    for example in examples:
        groups[example.target, example.difficulty].append(example)
    rng = random.Random(seed)
    train: list[Example] = []
    evaluation: list[Example] = []
    for key in sorted(groups):
        group = groups[key].copy()
        rng.shuffle(group)
        eval_count = max(1, min(len(group) - 1, math.floor(len(group) * eval_fraction)))
        evaluation.extend(group[:eval_count])
        train.extend(group[eval_count:])
    rng.shuffle(train)
    rng.shuffle(evaluation)
    return train, evaluation


def training_case(example: Example, slides: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, Any]], str]:
    """Mirror backend.evaluate's current-slide prompt and offered functions."""
    current_slide = next(slide for slide in slides if slide["id"] == example.current)
    candidates = [slide for slide in slides if slide["id"] != example.current]
    offered = tools(candidates)
    names = {slide["id"]: function["function"]["name"] for slide, function in zip(candidates, offered)}
    name = "no_action" if example.target == "no_action" else names[example.target]
    prompt_input = {
        "latest_utterance": example.utterance,
        "current_slide": {"title": current_slide["title"], "description": current_slide["description"]},
    }
    messages = [
        {"role": "developer", "content": PITCH_DIRECTOR_INSTRUCTION},
        {"role": "user", "content": json.dumps(prompt_input, separators=(",", ":"))},
    ]
    completion = f"<start_function_call>call:{name}{{}}<end_function_call>"
    return messages, offered, completion


def tokenize_case(processor: Any, example: Example, slides: list[dict[str, str]], max_length: int) -> dict[str, list[int]]:
    messages, offered, completion = training_case(example, slides)
    encoded = processor.apply_chat_template(
        messages, tools=offered, add_generation_prompt=True, tokenize=True,
        return_dict=True, return_tensors="pt",
    )
    prompt_ids = encoded["input_ids"][0].tolist()
    tokenizer = getattr(processor, "tokenizer", processor)
    completion_ids = tokenizer.encode(completion, add_special_tokens=False)
    if processor.decode(completion_ids, skip_special_tokens=False) != completion:
        raise ValueError("FunctionGemma tokenizer did not round-trip the required tool call.")
    input_ids = prompt_ids + completion_ids
    if len(input_ids) > max_length:
        raise ValueError(
            f"{example.target}/{example.difficulty} needs {len(input_ids)} tokens, above --max-length {max_length}. "
            "Increase the limit; truncating could remove a slide or the answer."
        )
    return {"input_ids": input_ids, "attention_mask": [1] * len(input_ids),
            "labels": [-100] * len(prompt_ids) + completion_ids}


class TokenizedCases:
    def __init__(self, rows: list[dict[str, list[int]]]) -> None:
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, list[int]]:
        return self.rows[index]


class ToolCallCollator:
    def __init__(self, pad_token_id: int) -> None:
        self.pad_token_id = pad_token_id

    def __call__(self, batch: list[dict[str, list[int]]]) -> dict[str, Any]:
        import torch

        width = max(len(row["input_ids"]) for row in batch)
        return {
            "input_ids": torch.tensor([row["input_ids"] + [self.pad_token_id] * (width - len(row["input_ids"])) for row in batch]),
            "attention_mask": torch.tensor([row["attention_mask"] + [0] * (width - len(row["attention_mask"])) for row in batch]),
            "labels": torch.tensor([row["labels"] + [-100] * (width - len(row["labels"])) for row in batch]),
        }


def evaluate_tool_calls(processor: Any, model: Any, examples: list[Example], slides: list[dict[str, str]], output_dir: Path) -> None:
    """Measure actual exact-call accuracy in addition to token loss."""
    import torch
    from transformers import StoppingCriteria, StoppingCriteriaList

    tokenizer = getattr(processor, "tokenizer", processor)
    end_token = tokenizer.convert_tokens_to_ids("<end_function_call>")

    class StopAtEndFunctionCall(StoppingCriteria):
        def __call__(self, input_ids: Any, _: Any, **__: Any) -> bool:
            return isinstance(end_token, int) and input_ids[0, -1].item() == end_token

    model.eval()
    results = []
    for example in examples:
        messages, offered, _ = training_case(example, slides)
        candidates = [slide for slide in slides if slide["id"] != example.current]
        available = {function["function"]["name"]: slide["id"] for function, slide in zip(offered, candidates)}
        inputs = processor.apply_chat_template(
            messages, tools=offered, add_generation_prompt=True, tokenize=True,
            return_dict=True, return_tensors="pt",
        ).to(model.device)
        with torch.inference_mode():
            output = model.generate(
                **inputs, max_new_tokens=96, do_sample=False,
                stopping_criteria=StoppingCriteriaList([StopAtEndFunctionCall()]),
            )
        generated = processor.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=False)
        try:
            decision = parse_function_call(generated, available)
            predicted = "no_action" if decision["action"] == "no_action" else decision["slide_id"]
        except ProtocolError:
            predicted = "invalid_call"
        results.append({"target": example.target, "predicted": predicted, "current": example.current,
                        "difficulty": example.difficulty, "utterance": example.utterance})
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "held-out-predictions.jsonl").write_text(
        "".join(json.dumps(result, ensure_ascii=False) + "\n" for result in results), encoding="utf-8"
    )
    for difficulty in ("easy", "hard"):
        subset = [result for result in results if result["difficulty"] == difficulty]
        correct = sum(result["target"] == result["predicted"] for result in subset)
        print(f"Held-out {difficulty} exact-call accuracy: {correct}/{len(subset)}")
    print(f"Held-out predictions saved to {output_dir / 'held-out-predictions.jsonl'}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Validate slide/data coverage and split without loading a model")
    parser.add_argument("--model", default=MODEL_ID, help="Base model ID or local model folder")
    parser.add_argument("--local-files-only", action="store_true", help="Require a cached base model")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs" / "pitch-router-weights")
    parser.add_argument("--epochs", type=float, default=5)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--batch-size", type=int, default=1, help="Per-GPU train and evaluation batch size")
    parser.add_argument("--grad-accum", type=int, default=1)
    parser.add_argument("--max-length", type=int, default=4096)
    parser.add_argument("--eval-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--resume-from-checkpoint", default=None)
    parser.add_argument("--skip-generation-eval", action="store_true", help="Skip exact-call generation on held-out examples")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.epochs <= 0 or args.learning_rate <= 0 or args.batch_size < 1 or args.grad_accum < 1 or args.max_length < 1:
        raise ValueError("Epochs, learning rate, batch size, gradient accumulation, and max length must be positive.")
    slides = load_slides()
    examples = load_examples(slides)
    train_examples, eval_examples = split_examples(examples, args.seed, args.eval_fraction)
    counts = Counter(example.target for example in examples)
    print(f"Deck: {len(slides)} slides; data: {len(examples)} examples ({len(train_examples)} train, {len(eval_examples)} eval)")
    for slide in slides:
        print(f"  {slide['id']}: {counts[slide['id']]}")
    print(f"  no_action: {counts['no_action']}")
    if args.dry_run:
        return 0

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor, Trainer, TrainingArguments
    except ImportError as error:
        raise RuntimeError("Training needs CUDA PyTorch, Transformers, and Accelerate; see docs/pitch-router-training.md") from error

    processor = AutoProcessor.from_pretrained(args.model, local_files_only=args.local_files_only, trust_remote_code=False)
    tokenizer = getattr(processor, "tokenizer", processor)
    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id
    if pad_id is None:
        raise ValueError("The model tokenizer has no pad or EOS token.")
    train_rows = [tokenize_case(processor, example, slides, args.max_length) for example in train_examples]
    eval_rows = [tokenize_case(processor, example, slides, args.max_length) for example in eval_examples]
    print(f"Longest training row: {max(map(lambda row: len(row['input_ids']), train_rows))} tokens")
    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    model = AutoModelForCausalLM.from_pretrained(
        args.model, local_files_only=args.local_files_only, trust_remote_code=False, dtype=torch.float32,
    )
    training_args = TrainingArguments(
        output_dir=str(args.output_dir), num_train_epochs=args.epochs, learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size, per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum, eval_strategy="epoch", save_strategy="epoch",
        save_total_limit=2, logging_steps=10, warmup_ratio=0.05, lr_scheduler_type="linear",
        optim="adamw_torch", bf16=bf16, tf32=bool(torch.cuda.is_available()),
        ddp_find_unused_parameters=False, save_safetensors=True, report_to="none", seed=args.seed,
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model, args=training_args, train_dataset=TokenizedCases(train_rows),
        eval_dataset=TokenizedCases(eval_rows), data_collator=ToolCallCollator(pad_id),
        processing_class=tokenizer,
    )
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    metrics = trainer.evaluate()
    print(f"Held-out evaluation loss: {metrics['eval_loss']:.4f}")
    trainer.save_model(str(args.output_dir))
    if trainer.is_world_process_zero():
        processor.save_pretrained(str(args.output_dir))
        print(f"Full safetensors weights and processor saved to {args.output_dir.resolve()}")
        if not args.skip_generation_eval:
            evaluate_tool_calls(processor, model, eval_examples, slides, args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
