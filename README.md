# Imagine v1

Real-time speech workspace that turns typed or transcribed input into a planned
visual note canvas with concise text, diagrams, generated images, or callouts.

```text
typed input or Deepgram transcript
  -> Gemini 2.5 Flash Lite notes
  -> Gemini 2.5 Flash Lite composition planner
  -> immediate multi-block canvas response
  -> async structured diagram-data or raster visual jobs
  -> persistent local visual cache for similar repeat prompts
  -> latest result
```

Deepgram fills the input field but does not submit automatically. Press Enter
or use the submit button to control when a paid Gemini request occurs.

## Educator workspace

`/canvas` is a local-first teaching dashboard with five views:

- **Overview** summarizes prepared lessons and common recall phrases.
- **Prepare** turns an outline or transcript into a previewable lesson pack
  using the existing trusted diagram and image templates.
- **Library** keeps prepared lesson previews in browser `localStorage`.
- **Teach** reveals saved media only after an exact command shaped like
  `imagine show me <recall phrase>`; unknown or conversational phrases never
  fall through to generation.
- **Live canvas** preserves on-the-spot generation for unplanned moments.

The planner generates up to three recall phrases for each visual block. Phrases
remain editable before teaching and must be unique within the lesson. Prepared
lesson records are versioned so browser persistence can later be replaced by a
cloud repository without changing the presentation model.

Raster images are stored as data URLs and can reach browser storage limits.
The dashboard reports quota failures instead of silently claiming the lesson
was saved. Pending backend visual-job IDs are never persisted across reloads.

## Live completion

`POST /api/generate/stream` uses newline-delimited JSON. Gemini notes text is
streamed to the browser as `text_delta` events while the final structured
composition is still being planned. The stream then emits the normal composition
as `result`, followed by `done`; visual blocks continue through the existing
asynchronous visual-job system. The original buffered `/api/generate` endpoint
remains available for compatibility.

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

- Every uncached manual submission first makes one small text-model request for
  notes, then one planner request that decides layout, visual balance, theme,
  and which blocks need visuals.
- The planner can return a text-led, visual-led, sequence, comparison, or
  balanced canvas with multiple blocks.
- Flowcharts, trees, Venn diagrams, pie charts, and mind maps render through
  hardcoded React components. Gemini supplies only typed nodes and relationships.
- Diagram node counts adapt to the explanation: concise topics stay compact,
  while substantial processes can expand to 7-14 meaningful nodes. Wide
  structures scroll inside the visual panel instead of being compressed.
- Similar repeated prompts can reuse `.cache/visuals` with no Gemini request.
- Raster image prompts are prefixed with a no-text rule so diagrams do not
  contain incorrect generated labels.
- The image model runs only for blocks where an unlabeled raster illustration is
  more useful than a diagram. If a visual job fails, completed text blocks
  remain visible without another retry.
- Requests contain no conversation history and are limited to 4,000 input
  characters. The notes request is capped at 256 output tokens; async diagram
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
