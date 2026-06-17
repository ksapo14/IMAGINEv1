# IMAGINEv1

Minimal prototype for turning teacher speech input into classroom-ready AI text and visuals.

Current flow:

```text
typed teacher input or Deepgram microphone transcript -> FastAPI AI pipeline -> Next.js output screen
```

The backend generates a short note, selects matching local images from `public/`,
or generates a Gemini classroom visual for prompts that do not match a local
image keyword.

## Frontend

```bash
npm install
npm run dev
```

`npm run dev` starts both the FastAPI backend and Next.js frontend. Open `http://localhost:3000`.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
npm run dev:backend
```

The API runs at `http://127.0.0.1:8010`.

## Configuration

Local configuration lives in `.env`, which is ignored by Git. The demo needs the frontend API base URL:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010
```

Deepgram turn-based speech recognition is optional. Add this server-only value,
then use the Start mic button in the app:

```env
DEEPGRAM_API_KEY=your-key-here
```

The backend validates the key with Deepgram before opening the microphone and
uses Flux turn detection by default:

```env
DEEPGRAM_MODEL=flux-general-en
DEEPGRAM_EOT_THRESHOLD=0.7
DEEPGRAM_EOT_TIMEOUT_MS=1500
```

Gemini text and image generation use the same server-only key:

```env
GEMINI_API_KEY=your-key-here
GEMINI_TEXT_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_TEXT_MODELS=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image-preview
```

Do not commit API keys. Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser by Next.js.
