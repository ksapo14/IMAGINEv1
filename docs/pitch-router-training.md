# Train the Pitch Mode slide router

The source is the 18-slide deck in `lib/pitch/deck.ts`. The labeled speech data is
`data/pitch-router-examples.psv`: 12 examples for each slide and 119 `no_action`
examples. Every slide has direct requests and harder examples that separate it
from neighboring topics. `no_action` includes continuations on all 18 current
slides and vague transitions that should not move the presentation.

The trainer offers the same slide functions, descriptions, current-slide context,
and developer instruction as `backend.evaluate`. It excludes the already visible
slide from the offered functions. Loss is applied only to the exact function call,
not to the prompt. It will fail if a sample exceeds the configured token limit,
so a slide description or answer is never silently truncated.

## Prepare

Use a Python environment with CUDA-enabled PyTorch compatible with the cluster,
then install `scripts/requirements-pitch-training.txt`. The training script does
not download or install dependencies itself. FunctionGemma is a gated model;
accept its license and authenticate with Hugging Face when obtaining the base
weights, or put a complete snapshot on shared storage and pass `--model` with
that folder. The checked-in data and dry run need neither a GPU nor model access.

```powershell
python scripts/train_pitch_router.py --dry-run
```

On a single eight-GPU H200 node, from the repository root:

```bash
torchrun --standalone --nproc_per_node=8 scripts/train_pitch_router.py \
  --model /shared/models/functiongemma-270m-it --local-files-only \
  --output-dir /shared/outputs/imagineer-pitch-router
```

For multiple nodes, use the cluster launcher's node count, node rank, and
rendezvous address with `torchrun`:

```bash
torchrun --nnodes="$NNODES" --nproc_per_node=8 --node_rank="$NODE_RANK" \
  --master_addr="$MASTER_ADDR" --master_port="$MASTER_PORT" \
  scripts/train_pitch_router.py --model /shared/models/functiongemma-270m-it \
  --local-files-only --output-dir /shared/outputs/imagineer-pitch-router
```

Use the same shared model and output paths on every node. `torchrun` sets the
per-process distributed environment. The model is small enough
for ordinary data parallel training on H200s; the script does not shard model
weights across GPUs. Batch size is per GPU. The defaults keep the effective
batch small because the dataset has only 335 examples; increasing GPU count
without adding data yields fewer optimizer updates per epoch. `--batch-size`,
`--grad-accum`, `--epochs`, and `--learning-rate` can be adjusted without
editing code.

Training makes a fixed, stratified holdout with easy and hard cases for every
destination. It reports evaluation loss and exact function-call accuracy by
difficulty, and saves `held-out-predictions.jsonl` for error review. The holdout
is useful for development, but this small authored dataset is not an independent
measure of real speech accuracy. Test the exported model on fresh speech turns
before relying on it during a presentation.

## Export and load

The final output directory contains full `model.safetensors` weights, config,
and processor/tokenizer files, not an adapter. Checkpoints are also written
during training; use `--resume-from-checkpoint /path/to/checkpoint-N` to resume.
The existing evaluator can load the exported directory with:

```bash
python -m backend.evaluate /shared/outputs/imagineer-pitch-router
```

The Windows desktop launcher currently starts the evaluator without a model
folder argument, so it uses its cached base model unless its launcher is
configured to pass the exported folder. The command above verifies that the
export is in the evaluator's expected format. It starts the evaluator's private
input loop; close standard input to exit.
