# Imagine v1

Real-time pitch workspace that follows a spoken presentation and moves between
native React slides when a completed utterance clearly changes topic.

## Public site

The public product narrative is available at `/`, `/product`, `/educators`,
`/schools`, and `/about`. Those routes share a marketing-only layout and use
static, generated editorial diagrams that remain separate from live workspace
state.

Pitch Mode is available at `/pitch`. The retired `/canvas` address redirects to
it for existing bookmarks. Both paths are omitted from the public sitemap,
disallowed in `robots.txt`, and marked `noindex, nofollow`.

## Pitch Mode

```text
Deepgram microphone
  -> completed utterance boundary
  -> current slide + available semantic slide descriptions
  -> PitchModelAdapter
  -> validated goto_slide(slide_id) or no_action
  -> guarded presentation controller
  -> native React slide transition
```

Pitch Mode ports the supplied 18-slide Imagineer deck into React. Slide IDs are
semantic (`open`, `gtm`, `financials`, and so on), so presentation state and
model decisions never depend on slide numbers. Previous/next controls, the
semantic slide picker, progress, replay, fullscreen, microphone control, and
automatic-navigation pause/resume remain available while presenting. A
collapsible transcript panel accepts typed test utterances without a microphone
or backend.

Deepgram `EndOfTurn` / `TurnInfo` boundaries are evaluated first. Finalized
`Results` segments remain a compatibility path and are combined only at a final
speech boundary. Interim transcripts update the panel but never select a slide.
The session ignores stale sockets, duplicate provider boundaries, empty
utterances, and evaluations invalidated by a newer utterance or manual move.

The default adapter is deterministic and matches distinctive deck phrases and
keywords. It returns a move only for one clear, uniquely highest-scoring topic;
weak, ambiguous, and current-slide matches return `no_action`. The controller
accepts only registered semantic IDs and ignores redundant or stale decisions.
It cancels automatic evaluation when it is paused, stopped, or superseded.

`PitchModelAdapter` is the seam for future inference. Its serializable input is
the latest utterance, current `SlideDescriptor`, and available slide
descriptors; its only results are `goto_slide(slide_id)` or `no_action`. A
locally hosted fine-tuned FunctionGemma endpoint can implement that interface
without changing the deck, controller, or microphone transport. This repository
does not train, download, host, or configure FunctionGemma.

To connect a future local model, implement `PitchModelAdapter` from
`lib/pitch/types.ts` and inject it as `<PitchWorkspace adapter={adapter} />` in a
client component. `evaluate(input, { signal })` must return
`{ action: "goto_slide", slide_id: "semantic-id" }` or
`{ action: "no_action" }`. Forward the abort signal to the request. A future
FastAPI proxy can connect to the local FunctionGemma service after its serving
protocol is chosen; no endpoint or inference protocol is assumed here. Runtime
validation, the five-second timeout, and stale-result protection remain in the
controller regardless of adapter implementation.

The slide composition is React-owned. The source deck's local SVG drawing
routines fill scoped artwork placeholders, with timers and animation frames
cancelled on exit. Re-entering a slide or pressing Replay resets its local
controls; redundant model decisions do not. Reduced motion completes entrance
artwork immediately and disables decorative loops. Left/right arrows navigate;
Home/End jump to the first/last semantic slide, R replays, and F toggles fullscreen.
These shortcuts ignore editable fields and interactive controls.

Pitch state persists only the deck ID/version and valid current slide in a new
Pitch-specific browser-storage key. It does not restore transcripts or restart
the microphone. The deck uses its supplied font fallback stack; no local Poppins
font file is included, so exact Poppins rendering requires a separately supplied
local font.

## Legacy whiteboard services

The prior lesson-context, whiteboard, and generation modules remain in the
repository to preserve their existing storage and backend API contracts. Pitch
Mode does not call the legacy `POST /api/generate`, streaming generation, or
visual-job endpoints. The following details describe those retained services,
not the current `/canvas` user interface.

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
Whiteboard sessions use storage schema v5. Legacy v1/v2 note scenes derive
bullets from their summary sentences. Earlier schemas promote undersized mode
footprints to the v5 minimums and discard diagram-only StickScene fallbacks
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
marketing site, Pitch slides, manual controls, and typed deterministic
evaluations remain available, while microphone transcription is disabled before
any backend request. Do not configure backend API keys for this frontend-only
deployment.

The canonical site origin uses `NEXT_PUBLIC_SITE_URL` first, then Vercel's HTTPS
production project URL, and finally `http://localhost:3000`.

## Legacy service cost and context controls

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

## Security boundary for retained backend services

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
