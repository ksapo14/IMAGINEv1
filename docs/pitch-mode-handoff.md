# Pitch Mode handoff

Pitch Mode now lives in the Windows Tauri application under `desktop/`. The marketing website has no pitch or canvas route.

The existing 18-slide deck, controller, storage, replay, keyboard navigation, and transcript UI remain React modules shared with the desktop entry. The controller is the only component that applies transitions. It rejects unknown or malformed slide IDs, redundant choices, cancelled results, and results made stale by manual navigation or a newer speech turn.

Desktop React uses narrow Tauri commands for model evaluation and cancellation, transcription session control, and fullscreen. Rust starts one background `backend.evaluate` Python process from the local environment and keeps its CPU-only FunctionGemma model loaded across requests. The evaluator finds its snapshot in the local Hugging Face cache automatically, loads it offline, and accepts bounded JSONL requests through stdin/stdout. Only strict `goto_slide` and `no_action` outputs are accepted. On a crash, timeout, or bad response Rust stops the evaluator and the current slide remains visible; a later request may start a fresh process.

Deepgram remains the only external desktop service. Rust reads the key from its launch environment, connects to Deepgram, and sends session-scoped transcription events to React. The key never enters the WebView or Python sidecar. Typed local evaluation still works if no Deepgram key is configured.

No FastAPI route, model HTTP endpoint, backend container, or browser-to-backend transport is part of this architecture.

The current Tauri bundle is disabled because this development build uses the checkout and an installed Python environment. See [DOCS.md](../DOCS.md) for the complete architecture and [desktop/README.md](../desktop/README.md) for setup and verification.
