# IMAGINEv1

Real-time speech workspace that turns typed or transcribed input into concise
notes and, when useful, one searched or generated visual.

```text
typed input or Deepgram transcript
  -> Gemini 2.5 Flash Lite notes and visual strategy
  -> grounded Gemini 2.5 Flash search for reusable real-world images
  -> Gemini 2.5 Flash Image fallback or direct diagram generation
  -> latest result
```

Deepgram fills the input field but does not submit automatically. Press Enter
or use the submit button to control when a paid Gemini request occurs.

## Local setup

Install the existing frontend and backend dependencies:

```bash
npm install
python -m venv backend/.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env` and provide server-only API keys:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010

DEEPGRAM_API_KEY=your-deepgram-key
GEMINI_API_KEY=your-gemini-key

GEMINI_TEXT_MODEL=gemini-2.5-flash-lite
GEMINI_SEARCH_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
IMAGE_SEARCH_ALLOWED_HOSTS=commons.wikimedia.org,upload.wikimedia.org
```

Run the stack with `npm run dev`. The frontend uses port `3000` and the
FastAPI backend uses port `8010`.

## Cost controls

- Every manual submission makes one Flash Lite request.
- Flash Lite returns no more than three bullets and chooses no visual,
  reusable-image search, or generated imagery.
- Grounded search runs only for real people, places, organisms, events,
  artworks, and existing objects. Search output is capped at 160 tokens.
- Repeated search queries reuse validated metadata for 30 minutes.
- Diagram, process, and abstract-concept requests go directly to the image
  model. Search failures fall back to that model once.
- The image model runs at most once per submission. If it fails, completed
  notes remain visible without another retry.
- Requests contain no conversation history and are limited to 4,000 input
  characters and 256 text output tokens.
- The local backend permits 10 generation requests per client IP per minute.

## Secret handling

`DEEPGRAM_API_KEY` and `GEMINI_API_KEY` are read only by FastAPI. They must
never use a `NEXT_PUBLIC_` prefix. The Gemini key is sent from the backend in
the `x-goog-api-key` header; it is not placed in URLs or API responses.

Grounded-search URLs are treated as untrusted. By default, only Wikimedia
Commons source pages and uploads are accepted. The backend rejects non-HTTPS,
private-network, redirected, oversized, and unsupported image responses,
then proxies valid bytes to the browser with linked source/license credit.
Only add a host to `IMAGE_SEARCH_ALLOWED_HOSTS` when the host publishes
reusable or public-domain media.

`.env` and `.env.*` are excluded from Git and Docker build contexts, while
`.env.example` contains names and non-secret defaults only. The Docker setup
passes both keys only to the backend container.

This configuration assumes localhost or a trusted private network. A public
deployment requires authentication and persistent per-user quotas; CORS and
the in-memory rate limit are not substitutes for authentication.

## Verification

The backend tests mock Gemini and make no external requests:

```bash
python -m unittest discover -s tests
npm run build
```

## Docker

The existing Docker setup runs the frontend on port `3000` and the backend on
port `8010`:

```bash
docker compose up --build
```
