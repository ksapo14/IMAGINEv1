# Imagine v1 developer guide

## What runs where

The repository has two applications:

| Application | Stack | Purpose |
| --- | --- | --- |
| Public website | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS; Vinext/Vite for the default build | Marketing pages at `/`, `/product`, `/educators`, `/schools`, `/about`, and `/contact`. |
| Windows Pitch Mode | Tauri 2 with a Rust host and a React/Vite WebView; local Python with PyTorch and Transformers | Displays an existing 18-slide presentation and chooses slides from typed or completed spoken input. |

The website has no pitch route. It does not load FunctionGemma, connect to Deepgram, or start a Python backend. The desktop app runs from this repository checkout and the installed local Python environment. Its installer bundle is currently disabled.

## Repository map and entrypoints

| Path | Responsibility |
| --- | --- |
| `app/`, `components/marketing/`, `app/globals.css` | Website routes, shared layout, marketing UI, and styles. `app/layout.tsx` is the site root. |
| `public/` | Website and brand images, diagrams, and icons. |
| `desktop/src/main.tsx`, `desktop/src/style.css` | Pitch Mode WebView entry and desktop styles. |
| `components/pitch/` | Presentation workspace, controls, slide renderers, and deck styles shared by the desktop entry. |
| `lib/pitch/deck.ts` | The slide ID, title, and semantic description for each of the 18 existing slides. `PITCH_DECK` is the compact model-facing list. |
| `lib/pitch/controller.ts`, `lib/pitch/model.ts`, `lib/pitch/storage.ts`, `lib/pitch/utterances.ts` | Presentation state and navigation, model decision checks, saved slide state, and completed speech-turn normalization. |
| `desktop/src/model.ts`, `desktop/src/transcription.ts`, `desktop/src/tauri.ts` | React-to-Tauri evaluation bridge, microphone capture, and command/event bridge. |
| `desktop/src-tauri/src/lib.rs`, `worker.rs`, `deepgram.rs` | Native commands and state, Python process/pipe ownership, and Deepgram speech connection. |
| `backend/evaluate.py`, `backend/services/function_gemma_protocol.py` | CPU FunctionGemma evaluation loop and bounded JSONL/function-call validation. No FastAPI service is started. |
| `backend/requirements.txt`, `scripts/prepare_function_gemma.py`, `scripts/function_gemma_smoke.py` | Local Python dependency versions, optional model preparation, and an offline semantic smoke check. |
| `tests/`, `desktop/src-tauri/tests/` | Python and frontend behavior checks plus Rust pipe-boundary checks. |
| `docs/`, `.codex/agents/`, `AGENTS.md` | Design/workflow notes and repository agent guidance. |

`package.json` owns npm scripts. `desktop/src-tauri/Cargo.toml` owns Rust dependencies. `vite.config.ts` and `desktop/vite.config.mjs` configure the website and desktop UI builds. `Dockerfile` and `docker-compose.yml` cover the website only. `vercel.json` selects the Next.js website build.

## Evaluation from input to slide

1. A typed test submits the textarea when **Evaluate** is pressed. For speech, the WebView records WebM/Opus microphone chunks, sends them through Tauri, and receives Deepgram transcript events. `lib/pitch/utterances.ts` emits only completed speech turns for evaluation.
2. `PitchController.evaluateUtterance` trims and bounds the text, records the current slide and deck, cancels any previous evaluation, and asks the desktop model adapter for a decision. The payload contains `latestUtterance`, `currentSlide`, and `availableSlides`. Each slide has an ID, title, and description; audio and React markup do not enter the model.
3. `desktop/src/model.ts` calls Tauri's `evaluate_pitch` with a request ID. Tauri serializes model access and starts one Python child process on first use. The executable defaults to `backend/.venv/Scripts/python.exe`; `IMAGINE_PYTHON` overrides it. Rust resolves the repository root from its Cargo project location, sets that root as the child working directory, and runs `python -u -m backend.evaluate` with no console window.
4. Python loads `google/functiongemma-270m-it` once from the local Hugging Face cache, in offline mode, using `AutoProcessor` and `AutoModelForCausalLM`. The model uses CPU float32 inference and deterministic generation. The developer instruction defines the model as a live pitch slide director. It advertises one zero-argument `show_<slide_title>` function for each available slide except the one already visible, plus `no_action`; duplicate titles receive distinct suffixes. Each function's description comes from the slide title and its specific topic and selection cues in `lib/pitch/deck.ts`. The prompt supplies the utterance and current slide separately.
5. Python parses one complete FunctionGemma function call, checks the target ID against the supplied deck, and returns a structured decision. Rust checks the reply version, request ID, action shape, and slide membership again. React then checks it at the adapter and controller boundaries before changing presentation state.
6. `goto_slide` displays the existing renderer for that slide ID. `no_action`, a redundant target, an invalid call, an error, or a stale/cancelled request keeps the current slide. Manual navigation invalidates pending model results.

Python generates a **proposal**, not executable code. It never dispatches a function named by raw model text. The two accepted actions are data consumed by the presentation controller.

## Private pipe contract

Rust and Python exchange one JSON object per line on child stdin/stdout. Frames are bounded to 64 KiB and use protocol version 1. Python sends a startup frame after loading; it keeps stdout reserved for protocol frames. For example:

```json
{"version":1,"kind":"decision","id":"request-1","utterance":"Let's discuss our financial projections","current_slide":{"id":"open","title":"Imagineer","description":"Introduction"},"available_slides":[{"id":"open","title":"Imagineer","description":"Introduction"},{"id":"financials","title":"Financials","description":"Funding allocation and three-year financial projections"}]}
```

```json
{"version":1,"kind":"result","id":"request-1","ok":true,"decision":{"action":"goto_slide","slide_id":"financials"}}
```

On startup, Python sends `{"version":1,"kind":"startup","ok":true}` or a bounded error category. The model's generated syntax is parsed in `function_gemma_protocol.py`: one exact, advertised `show_<slide_title>{}` or `no_action{}` call is accepted. The selected function name maps back to the stable slide ID for the existing `goto_slide` decision. Unknown function names, extra calls, arguments, arbitrary text, and malformed frames are rejected.

Rust allows 300 seconds for model startup and 120 seconds for each inference. React has a 435-second overall deadline. A real CPU smoke run took 256 seconds to load the model, so startup needs this headroom. A timeout, crash, or invalid reply closes the old process; a later evaluation can start a new one. A Windows Job Object closes the child after a hard desktop-process crash. New requests supersede waiting requests; running inference may finish, but cancellation or later manual navigation prevents its result from reaching the slide state.

## Speech and local state

Deepgram is the desktop app's only external runtime service. Tauri's Rust process reads `DEEPGRAM_API_KEY` from its launch environment and opens the WebSocket. React sends audio chunks and receives session-scoped transcript events; Python receives only completed text and slide metadata. The key is removed from the evaluator child's environment. Without a key, typed evaluation and manual navigation remain usable.

The current slide is saved in the WebView's local storage under the versioned presentation key. Audio and transcript text are transient. The UI restores only a slide ID valid for the current deck version. Any legacy `pitch-settings.json` model-folder path is ignored. The desktop app does not automatically read `.env`.

## Local setup and checks

Use Node.js 22, the repository's npm dependencies, Windows WebView2, a Windows MSVC Rust target, and a local Python interpreter with the packages in `backend/requirements.txt`. The default interpreter path is `backend/.venv/Scripts/python.exe`. A relative `IMAGINE_PYTHON` value resolves from the repository root; an absolute path can contain spaces. Model weights are separate from Python dependencies. Cache a complete snapshot of [google/functiongemma-270m-it](https://huggingface.co/google/functiongemma-270m-it) before evaluation. The model is gated: accept its license and authenticate when obtaining it. Inference reads cached weights and does not download them.

Run the website with `npm run dev`. For Pitch Mode, run `npm run dev:desktop-ui` and then `..\node_modules\.bin\tauri.cmd dev` from `desktop/` in another terminal. The user owns these long-running processes. [desktop/README.md](desktop/README.md) gives the exact PowerShell steps and offline model check.

Repository checks: `backend\.venv\Scripts\python -m unittest discover -s tests`, `npm run test:frontend`, `.\node_modules\.bin\tsc.cmd --noEmit`, `npm run check:desktop`, `npm run lint`, `npm run build`, `npm run build:desktop-ui`, `cargo fmt --manifest-path desktop\src-tauri\Cargo.toml --check`, and `cargo test --manifest-path desktop\src-tauri\Cargo.toml --offline`. The model smoke check is `backend\.venv\Scripts\python scripts\prepare_function_gemma.py --offline`; it requires a previously cached snapshot and reports model-choice mismatches distinctly from transport failures. Rust tests use a fake child process and Python tests mock model dependencies; no remote service is needed for those suites.

## Changing the behavior

To add a slide, add its unique ID, title, and description with clear selection cues in `lib/pitch/deck.ts`, add the matching React renderer in `components/pitch/`, and update the deck/renderer tests. The evaluator creates its function schema from that metadata automatically. To adjust selection, edit the slide's description or the role instruction in `backend/evaluate.py`; retain strict parsing in `backend/services/function_gemma_protocol.py` and Rust's deck check. Update behavior tests and run the offline smoke check when model quality is affected. To change speech-turn handling, inspect `lib/pitch/utterances.ts`, `desktop/src/transcription.ts`, and `desktop/src-tauri/src/deepgram.rs` together.

## Current limits

CPU model loading and generation can be slow. The base FunctionGemma model can choose the wrong function or slide; its [model card](https://huggingface.co/google/functiongemma-270m-it) positions it as a foundation for task-specific fine-tuning. The app rejects invalid calls but cannot guarantee a valid choice is semantically correct. The desktop build depends on this checkout and a local Python environment; it is not a standalone installer. Live microphone permission, audio format support, and Deepgram connectivity need an interactive Windows check.
