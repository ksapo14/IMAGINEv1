"""Find the official FunctionGemma snapshot and verify local CPU inference."""

import argparse
import subprocess
import sys
from pathlib import Path

from huggingface_hub import snapshot_download
from huggingface_hub.errors import GatedRepoError, HfHubHTTPError, LocalEntryNotFoundError


MODEL_ID = "google/functiongemma-270m-it"
MODEL_URL = f"https://huggingface.co/{MODEL_ID}"
MODEL_FILES = ["*.json", "*.jinja", "*.model", "*.safetensors"]


def complete_snapshot(folder: Path) -> bool:
    """Check the files the offline worker needs before starting a model load."""
    return (
        (folder / "config.json").is_file()
        and any(folder.glob("*.safetensors"))
        and ((folder / "tokenizer.json").is_file() or (folder / "tokenizer.model").is_file())
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prepare FunctionGemma, then run the offline evaluator smoke test.")
    parser.add_argument("--offline", action="store_true", help="Use only a previously cached snapshot")
    parser.add_argument("--skip-smoke", action="store_true", help="Only prepare and print the model folder")
    args = parser.parse_args(argv)

    try:
        folder = Path(snapshot_download(
            repo_id=MODEL_ID,
            allow_patterns=MODEL_FILES,
            local_files_only=args.offline,
        ))
    except GatedRepoError:
        print(f"FunctionGemma access is gated. Accept the license at {MODEL_URL} and authenticate with Hugging Face, then rerun this script.", file=sys.stderr)
        return 2
    except (HfHubHTTPError, LocalEntryNotFoundError, OSError) as error:
        print(f"Could not prepare FunctionGemma ({type(error).__name__}). Check network access and Hugging Face authentication, or retry with --offline after caching it.", file=sys.stderr)
        return 2

    if not complete_snapshot(folder):
        print(f"The cached FunctionGemma snapshot is incomplete: {folder}", file=sys.stderr)
        return 1

    print(f"FunctionGemma model folder: {folder}", flush=True)
    print("The desktop app will load this cached model automatically.", flush=True)
    if args.skip_smoke:
        return 0

    smoke_script = Path(__file__).with_name("function_gemma_smoke.py")
    command = [sys.executable, str(smoke_script), str(folder)]
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
