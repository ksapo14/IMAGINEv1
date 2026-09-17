# Imagine v1

Real-time speech workspace that turns lesson-grounded teaching turns into a
cumulative live visual whiteboard.

## Public site

The public product narrative is available at `/`, `/product`, `/educators`,
`/schools`, and `/about`. Those routes share a marketing-only layout and use
static, generated editorial diagrams that remain separate from live workspace
state.

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
  -> one Live Assistant text call returns CREATE or UPDATE
  -> server assigns deterministic, non-overlapping board placement
  -> trusted React renders the selected visual, notes, diagram, and/or animation modes
  -> diagram modes show a drawing loader while one raster-diagram job runs
  -> animation modes immediately show an SVG loader, then replay a local GSAP recipe
  -> visual-only modes schedule an image only when the concept needs one
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
Each CREATE or UPDATE carries an ordered, unique subset of visual, notes,
diagram, and animation modes. Explicit diagram, animation/animate/in-motion,
and summary/notes cues select exactly those
artifacts in cue order, while negation excludes the named artifact; ordinary
prompts remain model-directed to the smallest useful subset.
Related requests for a complementary mode can expand the resolved scene: its
existing mode order remains the prefix and new modes are appended. Expanding a
diagram with notes preserves ready, pending, failed, or restored-unavailable
diagram state instead of scheduling another image. The diagram reflows beside
the notes before a short, one-shot typing reveal; narrow layouts stack, and
reduced-motion users receive the complete final content immediately.

Notes contain 1–4 semantic `summaryBullets` and no keyword payload or chips;
summary metadata remains available for context and accessibility. Structured
visual panes use a trusted 12-by-8 renderer with at most six entities and six
connections; the server, not the model, assigns their coordinates. Deterministic
StickScene SVGs remain sparse monochrome outlines with trusted grid placement,
palette, and connector routing. Every new or explicitly regenerated diagram
schedules exactly one provider-generated raster and shows a lightweight drawing
animation until it settles. In combined visual-and-diagram scenes, StickScene content is
retained only for the separate visual pane. Raster diagrams and optional generated visuals use
separate server-owned instructions, restrained accessible color, balanced
composition, generous spacing, and content-aware connector routing while
remaining evidence-only, text-free, and non-photorealistic.
Animation recipes contain only a selected template, up to six labeled assets,
relationships, and semantic motion steps. The renderer owns SVG geometry and
GSAP timing, so “animate the water cycle” uses one text decision and no image
generation. It uses bundled Lucide assets first, then a 1.5-second, allowlisted
Iconify lookup for a missing exact asset key, before falling back to a labeled
shape. The asset response is sanitized and used only as an image data URL.
Whiteboard sessions use storage schema v6. Legacy v1/v2 note scenes derive
bullets from their summary sentences. Earlier schemas promote undersized mode
footprints to the current minimums and discard diagram-only StickScene fallbacks
while preserving combined structured visual content.

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
GEMINI_TEXT_FALLBACK_MODEL=gemini-3.6-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_IMAGE_FALLBACK_MODEL=gemini-2.5-flash-image

CORS_ALLOW_ORIGIN_REGEX=
```

`gemini-3.7-flash` is the default text choice for fast, schema-constrained Live
Assistant decisions and uses medium thinking. `gemini-3.1-flash-image` is the
image default; diagram panes remain pending until their generated asset settles,
while structured rendering remains available to visual panes. Nonblank
primary-model environment values override these defaults.

Transient provider failures use `gemini-3.6-flash` for text and
`gemini-2.5-flash-image` for images as stable fallback defaults. A missing
fallback variable uses its default; a present blank value disables that
fallback. The primary model receives at most three attempts (the initial call
and two jittered retries), followed by one distinct fallback attempt when fast
failures leave enough time. All attempts share the original 30-second text or
90-second image deadline. Text requests reserve the final 10 seconds for
fallback and cap each primary attempt at 20 seconds; images reserve 30 seconds
and cap primary attempts at 60 seconds. A retry runs only when its delay still
leaves the reserve plus a useful 5-second text or 15-second image attempt. A
slow primary therefore goes directly to fallback without sleeping, while fast
failures can still use all three primary attempts and one fallback. Fallback
always receives all time actually remaining, including the full 30/90-second
deadline when a cooldown bypasses primary. This may cut a slow primary call
short to preserve one fallback opportunity; it never extends the total deadline.

After primary transient exhaustion with an enabled fallback, that channel and
primary model enter a 30-second cooldown. Cooldown state is held only in memory
within each backend process; it is not persisted or shared across workers or
pipeline instances. Invalid requests, quota responses, and malformed provider
content do not retry. These safeguards improve recovery but cannot guarantee
provider availability.

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

- Every processed live turn makes one Live Assistant text call. Contextual
  decisions are not cached. A transient failure can add up to two primary
  retries and one fallback call, and each provider attempt may add usage cost.
- Ambient transcription does not create a processed turn. Only typed commands
  and wake-phrase-authorized speech increment the live turn sequence.
- Image generation is asynchronous. Every scene containing diagram schedules
  exactly one diagram-kind image job; a visual-only scene schedules a job only
  when its atomic concept needs a concrete silhouette or action that structured
  primitives cannot clearly express. The server selects distinct diagram and
  visual instructions with accessible composition, clear spacing and routing,
  and evidence-only, no-text, non-photorealistic boundaries. Failure is shown
  honestly in the diagram pane without substituting a legacy graph; other
  selected board content remains available.
- Animation-only and animation-plus-notes scenes never schedule image work.
  Recipe playback, replay, pause, and speed controls make no provider calls;
  playback pauses while the pane is hidden or off screen and respects reduced
  motion.
- User input is limited to 4,000 characters. Lesson source is limited to 3,600
  characters. Recent-turn context contains at most six turns and 2,400 combined
  characters.
- The client sends at most 24 concept memories and 48 board-scene digests; it
  does not resend full rendered scenes as board context.
- Live Assistant output is capped at 2,400 tokens. Generated image payloads are
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

The model returns data that must pass the typed `WhiteboardDecision` and, for
structured visual panes, StickScene schemas. It cannot supply HTML, SVG markup, CSS, scripts, links,
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
