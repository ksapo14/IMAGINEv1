# IMAGINEv1

Real-time speech workspace that turns typed or transcribed input into a planned
visual note canvas with concise text, diagrams, generated images, or callouts.

```text
typed input or Deepgram transcript
  -> Gemini 2.5 Flash Lite notes
  -> Gemini 2.5 Flash Lite composition planner
  -> immediate multi-block canvas response
  -> async sanitized HTML diagram or raster visual jobs
  -> persistent local visual cache for similar repeat prompts
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
GEMINI_DIAGRAM_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
VISUAL_CACHE_DIR=.cache/visuals
```

Run the stack with `npm run dev`. The frontend uses port `3000` and the
FastAPI backend uses port `8010`.

## Cost controls

- Every uncached manual submission first makes one small Flash Lite request for
  notes, then one planner request that decides layout, visual balance, theme,
  and which blocks need visuals.
- The planner can return a text-led, visual-led, sequence, comparison, or
  balanced canvas with multiple blocks.
- Flowcharts, processes, comparisons, systems, timelines, and abstract concepts
  render as richer async HTML diagrams with a separate diagram model, avoiding
  image-model cost.
- Diagram jobs return their own canvas width and height, so horizontal or
  vertical workflows can scroll inside the visual panel instead of being
  squeezed into the viewport.
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

`DEEPGRAM_API_KEY` and `GEMINI_API_KEY` are read only by FastAPI. They must
never use a `NEXT_PUBLIC_` prefix. The Gemini key is sent from the backend in
the `x-goog-api-key` header; it is not placed in URLs or API responses.

Generated diagram HTML is sanitized on the backend and rendered by the
frontend in a sandboxed frame. Scripts, links, event handlers, styles, and
unknown classes are removed before the browser sees the diagram.

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
