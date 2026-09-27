# Windows Pitch Mode development

`desktop/` is the Tauri 2 shell for the 18-slide Pitch Mode. The React/Vite WebView uses the deck and controller in `components/pitch/` and `lib/pitch/`. [DOCS.md](../DOCS.md) explains the full project and the request flow.

## Requirements

- Windows with WebView2, Node.js 22, Rust with the matching Windows MSVC target, and this repository's npm dependencies.
- A local Python environment with the packages in `backend/requirements.txt`. The known working environment is `backend/.venv/Scripts/python.exe`. The evaluator runs PyTorch on the CPU.
- A complete cached snapshot of [google/functiongemma-270m-it](https://huggingface.co/google/functiongemma-270m-it), including `config.json`, tokenizer, and weight files. PyTorch and Transformers do not include model weights. Accept the model license and authenticate when obtaining the snapshot. Model acquisition is separate from app startup.

The desktop process uses `backend/.venv/Scripts/python.exe` by default. Set `IMAGINE_PYTHON` in its launch environment to point to another existing interpreter. Relative overrides resolve from the repository root. Start Tauri from this checkout because it locates `backend/evaluate.py` using its project path. No Python service or model server is needed.

## Local start

From the repository root, start the Vite UI in one terminal:

```powershell
npm run dev:desktop-ui
```

In another terminal, launch Tauri:

```powershell
Push-Location desktop
..\node_modules\.bin\tauri.cmd dev
Pop-Location
```

Set `DEEPGRAM_API_KEY` in the second terminal before launch if live microphone transcription is needed. Tauri reads that key; React and Python do not receive it. Optional Deepgram variables are in `.env.example`. The app does not load `.env` automatically. Typed evaluation and manual slide navigation work without a Deepgram key.

**Transcript & test → Evaluate** submits typed text without selecting a model folder. **Start mic** sends completed speech turns for evaluation. The Python evaluator loads FunctionGemma from the local Hugging Face cache on the first evaluation and remains in one background process. Rust gives startup 300 seconds and inference 120 seconds; the React controller allows 435 seconds overall. A failed or stale decision leaves the current slide visible.

The current slide is saved in the WebView's local storage. Audio and transcript text are not persisted. A previously saved model-folder setting is ignored.

## Offline model check

`scripts/prepare_function_gemma.py --offline` finds an existing cached snapshot and runs a two-request CPU smoke test. The smoke test checks a financial-slide navigation and a stay-put request. It reports model-choice mismatches separately from protocol failures. It does not download anything with `--offline`. If the cache is empty, obtain the gated model separately using the setup command without `--offline` when network access is available.

```powershell
backend\.venv\Scripts\python scripts\prepare_function_gemma.py --offline
```

To test the same automatic cache loading path as the desktop app, use `backend\.venv\Scripts\python scripts\function_gemma_smoke.py`. The model is loaded only once for both requests. The [Google FunctionGemma guide](https://ai.google.dev/gemma/docs/functiongemma/function-calling-with-hf) describes the Python tool-calling format used here.

## Checks

These checks do not start app servers or contact Deepgram:

```powershell
backend\.venv\Scripts\python -m unittest discover -s tests
npm run test:frontend
.\node_modules\.bin\tsc.cmd --noEmit
npm run check:desktop
npm run lint
npm run build
npm run build:desktop-ui
cargo fmt --manifest-path desktop\src-tauri\Cargo.toml --check
cargo test --manifest-path desktop\src-tauri\Cargo.toml --offline
git diff --check
```

The Tauri installer bundle is disabled in this local development version. A standalone installer would need a new runtime distribution plan. Microphone and WebView behavior require an interactive Windows check by the user.
