# Imagine v1

Real-time speech workspace with live visual notes and reusable prepared diagrams.

## Public site

The public product narrative is available at `/`, `/product`, `/educators`,
`/schools`, and `/about`. Those routes use a marketing-only layout and shared
components; they do not import or navigate into the educator workspace.

The educator workspace remains directly addressable at `/canvas`. It is omitted
from the public sitemap, disallowed in `robots.txt`, and marked
`noindex, nofollow`. Its header branding is intentionally noninteractive so the
public and teaching surfaces stay separate.

```text
Prepare mode
  -> one diagram-sequence planner request
  -> 3-5 trusted diagram jobs
  -> browser lesson library

Live Canvas
  -> finalized typed or Deepgram turn
  -> exact local prepared recall, or live notes/visual generation
```

Finalized Deepgram turns dispatch automatically while the microphone stays on.
Ordinary turns received during an active generation are processed FIFO.

## Educator workspace

`/canvas` is a local-first teaching dashboard with three views:

- **Prepare** splits lesson material into 3-5 diagram-only teaching visuals.
- **Library** keeps prepared lesson previews in browser `localStorage`.
- **Live Canvas** combines live notes/visual generation with prepared recall.

Each prepared diagram has one to three editable recall phrases that must be
unique within its lesson. The exact command
`imagine show me <recall phrase>` reveals the saved diagram locally without a
generation request. Any other input beginning with the whole word `imagine` is
handled locally and never falls through to generation; words such as
`imagination` remain ordinary live input.

Prepared outer blocks contain only diagram titles, recall phrases, and diagram
jobs; they do not contain note, description, callout, comparison, timeline, or
image blocks. Older mixed lesson records remain readable. Pending backend
visual-job IDs are never persisted across reloads.

## Live completion

Both generation endpoints accept `mode: "live" | "prepare"`, defaulting to
`live`. `POST /api/generate/stream` uses newline-delimited JSON. Live mode emits
notes as `text_delta` events before `result` and `done`. Prepare mode emits no
descriptive text deltas and returns its diagram plan as `result`; its 3-5
diagrams continue through the existing asynchronous visual-job system. Cache
identity includes the mode so the same input cannot cross-contaminate Live and
Prepare results. The buffered `/api/generate` endpoint remains compatible.

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
DEV_GEMINI_API_KEY=your-dev-gemini-key
PROD_GEMINI_API_KEY=your-prod-gemini-key

GEMINI_TEXT_MODEL=your-text-model-id
GEMINI_DIAGRAM_MODEL=
GEMINI_IMAGE_MODEL=your-image-model-id
VISUAL_CACHE_DIR=.cache/visuals
```

Run the stack with `npm run dev`. The frontend uses port `3000` and the
FastAPI backend uses port `8010`.

## Cost controls

- Every uncached live turn first makes one small notes request, then a composition
  planner request. Prepare uses one isolated diagram-sequence planner request.
- The planner can return a text-led, visual-led, sequence, comparison, or
  balanced canvas with multiple blocks.
- Flowcharts, trees, Venn diagrams, pie charts, and mind maps render through
  hardcoded React components. Gemini supplies only typed nodes and relationships.
- Diagram node counts adapt to the explanation: concise topics stay compact,
  while substantial processes can expand to 7-14 meaningful nodes. Wide
  structures scroll inside the visual panel instead of being compressed.
- Exact repeated prompts in the same mode can reuse `.cache/visuals`.
- Raster image prompts are prefixed with a no-text rule so diagrams do not
  contain incorrect generated labels.
- The image model runs only for blocks where an unlabeled raster illustration is
  more useful than a diagram. If a visual job fails, completed text blocks
  remain visible without another retry.
- Requests contain no conversation history and are limited to 4,000 input
  characters. The notes request is capped at 512 output tokens; async diagram
  jobs use a larger output cap for detailed workflows.
- The local backend permits 10 generation requests per client IP per minute.

## Secret handling

`DEEPGRAM_API_KEY`, `DEV_GEMINI_API_KEY`, and `PROD_GEMINI_API_KEY` are read
only by FastAPI. They must never use a `NEXT_PUBLIC_` prefix. Gemini keys are
sent from the backend in the `x-goog-api-key` header; they are not placed in
URLs or API responses.

Generated diagrams contain structured text data only. The model cannot supply
HTML, CSS, scripts, links, event handlers, or arbitrary visual classes; trusted
frontend components own all diagram markup and styling.

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
npm run test:frontend
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

## Docker

The existing Docker setup runs the frontend on port `3000` and the backend on
port `8010`:

```bash
docker compose up --build
```
