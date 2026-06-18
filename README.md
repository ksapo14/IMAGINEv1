# IMAGINEv1

Pitch prototype for turning educator speech into sequential presentation visuals.

Current flow:

```text
typed caption input or Deepgram microphone transcript -> FastAPI ordered pitch sequence -> Next.js deck screen
```

The backend scans speech against one active keyword at a time. Future keywords are ignored until their step becomes active, which prevents overlapping triggers during the investor presentation.

No pitch keywords or slide actions are configured yet. Add them to `PITCH_SEQUENCE` in `backend/services/keyword_pipeline.py` once the final keyword/action list is ready.

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
then use the Speak button in the app:

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

Do not commit API keys. Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser by Next.js.
