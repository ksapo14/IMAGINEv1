# IMAGINEv1

Minimal prototype for turning teacher speech input into classroom-ready AI text and visuals.

Current flow:

```text
typed teacher input -> FastAPI AI pipeline -> Next.js output screen
```

The backend generates a short note, selects an existing hosted image, and returns both for immediate display. Gemini text generation is used when `GEMINI_API_KEY` is present; otherwise the backend falls back to a local note so the live demo remains usable.

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

Gemini text generation is optional. Free-tier text models still count tokens, but supported free-tier input and output token prices are listed as free of charge by Google. Add these server-only values to use Gemini text:

```env
GEMINI_API_KEY=your-key-here
GEMINI_TEXT_MODEL=gemini-3.1-flash-lite
```

Do not commit API keys. Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser by Next.js.
