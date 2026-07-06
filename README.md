# IMAGINEv1

Minimal scaffold for a future real-time speech workspace.

The investor-pitch keyword sequence and its paired presentation slides have
been removed. The app currently supports typed input and optional microphone
transcription only; it does not generate notes, visuals, diagrams, or slides.

Current flow:

```text
typed input or Deepgram microphone transcript -> local input workspace
```

## Frontend

```bash
npm install
npm run dev
```

`npm run dev` starts both the FastAPI backend and Next.js frontend. Open
`http://localhost:3000`.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
npm run dev:backend
```

The backend exposes a health check and the optional transcription proxy at
`http://127.0.0.1:8010`. There is currently no content-generation endpoint.

## Configuration

Local configuration lives in `.env`, which is ignored by Git.

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010
DEEPGRAM_API_KEY=your-key-here
DEEPGRAM_MODEL=flux-general-en
DEEPGRAM_EOT_THRESHOLD=0.7
DEEPGRAM_EOT_TIMEOUT_MS=1500
```

`DEEPGRAM_API_KEY` is only required for microphone transcription. Do not
commit API keys. Only variables prefixed with `NEXT_PUBLIC_` are exposed to
the browser.

## Docker

The existing Docker setup runs the frontend on port `3000` and the backend on
port `8010`:

```bash
docker compose up --build
```

Optional configuration can go in `.env`; use `.env.example` as the template.
