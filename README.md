# Imagine v1

Imagine has a public website and a Windows desktop Pitch Mode. The website uses Next.js/React and lives in `app/`. Pitch Mode uses Tauri, React, and the 18-slide deck in `desktop/`, `components/pitch/`, and `lib/pitch/`.

Pitch Mode evaluates a typed utterance or completed speech turn with FunctionGemma on the CPU. Tauri starts `backend/evaluate.py` in a background Python process and sends slide metadata over private pipes. A validated `goto_slide` displays an existing slide; `no_action` keeps the current one. The app needs a local Python environment and a cached FunctionGemma snapshot, which it finds automatically without a folder picker. Deepgram handles live speech transcription when a key is provided to Tauri.

Start with [DOCS.md](DOCS.md) for the architecture, file map, data flows, configuration, and checks. See [desktop/README.md](desktop/README.md) for local Pitch Mode setup.

The website and desktop UI have separate development commands:

```powershell
npm run dev
npm run dev:desktop-ui
```

`npm run build` builds the Vinext website. `npm run build:vercel` builds the Next.js website for Vercel. The website does not serve `/pitch` or `/canvas` and does not need the local Python evaluator.
