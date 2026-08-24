# Imagine v1

Real-time speech workspace that turns lesson-grounded teaching turns into a
cumulative live StickScene whiteboard.

## Public site

The public product narrative is available at `/`, `/product`, `/educators`,
`/schools`, and `/about`. Those routes share a marketing-only layout and use
static, non-live StickScene previews.

The educator workspace remains directly addressable at `/canvas`. It is omitted
from the public sitemap, disallowed in `robots.txt`, and marked
`noindex, nofollow`. Its header branding is intentionally noninteractive so the
public and teaching surfaces stay separate.

## Architecture and live flow

```text
Lesson context
  -> save title, subject, and source locally before class
  -> select the context and start a fresh board

Live teaching turn
  -> submit typed input, or say "Hey Imagine" before one Deepgram speech command
  -> send lesson + recent turns + concepts + board digest
  -> one Visual Director text call returns CREATE or UPDATE
  -> server assigns deterministic, non-overlapping board placement
  -> trusted React renders the selected visual, notes, and/or diagram modes
  -> optional simple image job can replace the scene artwork when complete
```

Deepgram continues transcribing while the microphone stays on, but ambient
speech never reaches Gemini or changes the board. Say `Hey Imagine` followed by
a command, or say the wake phrase alone and give one command within eight
seconds. A split `hey` then `imagine <command>` also works. Each activation is
consumed by one command. If generation is already active, up to two commands
wait in FIFO order; later commands are folded into the newest waiting turn
instead of growing the queue. Typed submission remains an independent manual
command path and never includes interim speech.

The buffered `POST /api/generate` and NDJSON `POST /api/generate/stream`
endpoints return the same atomic whiteboard decision. The stream emits `result`
and `done`; it does not stream model-authored notes or markup. Optional images
are separate jobs queried through `GET /api/visual/{job_id}`.

## Educator workspace

`/canvas` is a local-first teaching dashboard with three views:

- **Lesson context** saves the lesson title, optional subject, and source text.
- **Library** keeps schema-v2 lesson context records in browser `localStorage`.
- **Live Canvas** is a full-screen teacher whiteboard with compact lesson,
  page, prompt, and microphone controls.

The board is cumulative within the live session. A CREATE adds a scene, while an
UPDATE replaces and may safely resize or relocate the same scene without moving
its siblings. If an update references a scene that disappeared, the server
recovers by exact concept identity or safely creates a fresh scene. Starting a
fresh board clears session scenes but does not delete saved lesson contexts.
Explicit additive commands create a focused new compartment, including a stable
derived concept identity when the topic already exists. Explicit correction or
revision commands update a resolved scene; without a safe target they create new
work instead of overwriting an unrelated scene.

Each board page uses a fixed 24-column by 14-row grid. The server owns placement
and searches the bounded pages for a compact exact 8x5, 12x6, or 16x7 footprint
so scenes do not overlap. A page containing one scene expands that scene only at
render time; once a sibling exists, both use their unchanged stored placements.
Each CREATE or UPDATE carries an ordered, unique subset of visual, notes, and
diagram modes. Explicit diagram and summary/notes cues select exactly those
artifacts in cue order, while negation excludes the named artifact; ordinary
prompts remain model-directed to the smallest useful subset.

Notes contain 1–4 semantic `summaryBullets` and no keyword payload or chips;
summary metadata remains available for context and accessibility. Diagram
scenes use a trusted 12-by-8 renderer with at most six entities and six
connections; the server, not the model, assigns their coordinates. Trusted and
generated visuals are directed as sparse monochrome outlines on white or
transparent backgrounds, using stick figures when people are needed and no
color fills, gradients, decorative density, embedded text, or photorealism.
Whiteboard sessions use storage schema v3. Legacy v1/v2 note scenes derive
bullets from their summary sentences while unrelated state and legal placements
are retained.

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
DEEPGRAM_MODEL=flux-general-en
DEEPGRAM_EOT_THRESHOLD=0.7
DEEPGRAM_EOT_TIMEOUT_MS=1500
DEEPGRAM_LANGUAGE_HINT=

PROD_GEMINI_API_KEY=your-prod-gemini-key
GEMINI_TEXT_MODEL=gemini-3.7-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

CORS_ALLOW_ORIGIN_REGEX=
```

`gemini-3.7-flash` is the default text choice for fast, schema-constrained Visual
Director decisions and uses medium thinking. `gemini-3.1-flash-image` is the
optional image default; the trusted visual-summary renderer remains the fallback
when visual mode is chosen. Nonblank model environment values override these
defaults.

Run the stack with `npm run dev`. The frontend uses port `3000` and the FastAPI
backend uses port `8010`.

## Vercel frontend-only deployment

Vercel builds the Next.js frontend with `npm ci` and `npm run build:vercel`.
The root `.npmrc` must keep legacy peer resolution because the lockfile was
generated with that mode.
That build automatically selects frontend-only mode and native Next.js output;
no Vercel system-variable exposure or dashboard setup is required. The existing
`npm run build` command remains the Vinext/Cloudflare build, and non-Vercel
`next build` continues producing Docker's standalone output.

These public variables are optional:

```env
NEXT_PUBLIC_SITE_URL=https://example.com
# Future deployment with a reachable backend only:
NEXT_PUBLIC_FRONTEND_ONLY=false
```

The Vercel wrapper defaults missing, blank, or invalid
`NEXT_PUBLIC_FRONTEND_ONLY` values to `true`. A literal `false` remains an
explicit override for a future deployment with a reachable backend. Local
development stays backend-enabled by default. In frontend-only mode the
marketing site, lesson library, and local whiteboards remain available, but
generation, visual polling, and microphone transcription are disabled before
any backend request. Do not configure backend API keys for this frontend-only
deployment.

The canonical site origin uses `NEXT_PUBLIC_SITE_URL` first, then Vercel's HTTPS
production project URL, and finally `http://localhost:3000`.

## Cost and context controls

- Every processed live turn makes one Visual Director text call. Contextual
  decisions are not cached.
- Ambient transcription does not create a processed turn. Only typed commands
  and wake-phrase-authorized speech increment the live turn sequence.
- Image generation is optional and asynchronous. It runs only when one atomic
  concept needs a concrete silhouette or action that the structured primitives
  cannot clearly express. The image model receives the same monochrome outline,
  no-text, and no-photorealism contract as the trusted fallback. Image failure
  leaves that fallback visible. No image job is created when visual mode is
  absent.
- User input is limited to 4,000 characters. Lesson source is limited to 3,600
  characters. Recent-turn context contains at most six turns and 2,400 combined
  characters.
- The client sends at most 24 concept memories and 48 board-scene digests; it
  does not resend full rendered scenes as board context.
- Visual Director output is capped at 2,400 tokens. Generated image payloads are
  MIME-checked and bounded before reaching the client.
- The backend permits 50 generation requests, transcription key checks, and
  transcription connection attempts per client IP per minute. Visual polling
  remains at 480 requests per minute, and no more than two image jobs run
  concurrently.

## Security boundary

`DEEPGRAM_API_KEY` and `PROD_GEMINI_API_KEY` are read only by FastAPI. They must
never use a `NEXT_PUBLIC_` prefix. The production Gemini key is used for both
text and image requests and is sent from the backend in the `x-goog-api-key`
header; it is not placed in URLs or API responses.

The model returns data that must pass the typed `WhiteboardDecision` and
StickScene schemas. It cannot supply HTML, SVG markup, CSS, scripts, links,
event handlers, or arbitrary visual classes. Trusted React components own all
scene markup and styling. Optional raster assets accept only JPEG, PNG, or WebP
data URLs and cannot change a scene's identity, text, structure, or placement.

`.env` and `.env.*` are excluded from Git and Docker build contexts, while
`.env.example` contains names and non-secret defaults only. Docker passes
server-only keys only to the backend container.

The default origin policy is intended for localhost and trusted private-network
development. A public deployment requires authentication and persistent
per-user quotas; CORS and in-memory rate limits are not authentication.

## Verification

Backend tests mock Gemini and remain network-free. Run the repository checks
without starting a server:

```bash
backend\.venv\Scripts\python -m unittest discover -s tests
npm run test:frontend
.\node_modules\.bin\tsc.cmd --noEmit
npm run lint
npm run build
git diff --check
```

## Docker

The existing Docker setup runs the frontend on port `3000` and the backend on
port `8010`:

```bash
docker compose up --build
```
