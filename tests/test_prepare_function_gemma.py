"""Offline checks for the one-time FunctionGemma setup command."""

import contextlib
import io
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.prepare_function_gemma import main


class PrepareFunctionGemmaTests(unittest.TestCase):
    def test_cached_snapshot_runs_existing_smoke_test(self) -> None:
        folder = str(Path(__file__).parent / "imaginary-model")
        with patch("scripts.prepare_function_gemma.snapshot_download", return_value=folder) as download, patch(
            "scripts.prepare_function_gemma.complete_snapshot", return_value=True
        ), patch("scripts.prepare_function_gemma.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()):
            run.return_value.returncode = 0
            self.assertEqual(main(["--offline"]), 0)
        self.assertTrue(download.call_args.kwargs["local_files_only"])
        self.assertEqual(run.call_args.args[0][2], folder)

    def test_incomplete_snapshot_does_not_start_inference(self) -> None:
        with patch("scripts.prepare_function_gemma.snapshot_download", return_value="imaginary-model"), patch(
            "scripts.prepare_function_gemma.complete_snapshot", return_value=False
        ), patch("scripts.prepare_function_gemma.subprocess.run") as run, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main([]), 1)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
