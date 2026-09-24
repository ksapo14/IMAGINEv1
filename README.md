# Imagine v1

Imagine is a real-time pitch workspace. Completed spoken turns can move an
18-slide React deck while presenters retain manual navigation at all times.

## Pitch Mode

```text
Deepgram finalized utterance or typed utterance
  -> POST /api/pitch/decide
  -> offline local FunctionGemma worker or separately managed HTTP server
  -> goto_slide(slide_id) or no_action
  -> guarded presentation controller
```

Pitch Mode is available at `/pitch`; `/canvas` redirects there for existing
bookmarks. Each slide has a stable semantic ID, so navigation never relies on a
slide number. The controller rejects malformed, unknown, redundant, and stale
decisions, cancels superseded evaluations, and keeps manual controls,
keyboard navigation, replay, fullscreen, and Deepgram session protections.

Set `FUNCTION_GEMMA_RUNTIME=local` to have the backend start one private Python
worker that loads the already cached model directly through Transformers. It
does not download models, use GGUF, open an HTTP port, or execute any
model-selected function. The worker uses offline mode, loads once, accepts one
serialized decision at a time, and is stopped on backend shutdown. Its output
must be exactly one `no_action{}` or deck-scoped `goto_slide{slide_id:...}`
FunctionGemma call. The base model may need task-specific fine-tuning for
reliable presentation semantics; runtime correctness is not a quality claim.

Before any model request, an intentionally narrow deck-owned quality guard
routes only a unique, non-current slide with a complete distinctive phrase or
at least two exact keywords. Weak, tied, and substring-only input still reaches
FunctionGemma; a model-proposed move is held unless the utterance contains a
complete cue for that target. This limits wrong automatic transitions, but it
does not replace task-specific fine-tuning.

HTTP mode remains available for an existing OpenAI-compatible FunctionGemma
endpoint. Both modes expose only `goto_slide` and `no_action` to the backend.

`/health` confirms only that this backend is alive. Use `GET /api/pitch/status`
for cached FunctionGemma readiness, or `GET /api/pitch/status?probe=true` to
make one bounded real protocol check. A status of `ready` is set only after a
valid HTTP tools exchange or local worker decision; startup never loads or
probes a runtime automatically.

## Local configuration

Copy `.env.example` to `.env` and configure the services you run:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010

DEEPGRAM_API_KEY=your-deepgram-key
DEEPGRAM_MODEL=flux-general-en
DEEPGRAM_EOT_THRESHOLD=0.7
DEEPGRAM_EOT_TIMEOUT_MS=1500
DEEPGRAM_LANGUAGE_HINT=

# Optional override. Leave blank for the native or Docker Compose default.
FUNCTION_GEMMA_RUNTIME=auto
FUNCTION_GEMMA_LOCAL_PYTHON=
FUNCTION_GEMMA_LOCAL_STARTUP_TIMEOUT_SECONDS=90
FUNCTION_GEMMA_LOCAL_INFERENCE_TIMEOUT_SECONDS=12
FUNCTION_GEMMA_BASE_URL=
FUNCTION_GEMMA_MODEL=google/functiongemma-270m-it
FUNCTION_GEMMA_API_KEY=
```

For local mode, create an ignored `.env.local` rather than placing a local path
in a shared `.env`:

```env
FUNCTION_GEMMA_RUNTIME=local
FUNCTION_GEMMA_LOCAL_PYTHON=C:/path/to/your/python.exe
```

That Python must already contain `torch`, `transformers`, and an accepted,
complete `google/functiongemma-270m-it` Hugging Face cache. The backend never
installs packages or downloads the model. The first request may take up to the
configured 90-second startup timeout; later requests reuse the loaded process
and use the separate 12-second inference deadline.

`FUNCTION_GEMMA_API_KEY` applies only to HTTP mode. A nonblank value is trimmed and sent only
from the backend as `Authorization: Bearer <value>`; a blank or missing value
sends no authorization header. This is for an endpoint that already accepts a
static bearer token. It does not perform a full OAuth flow (such as a browser
sign-in, client credentials exchange, token refresh, or redirect callback).
Keys containing control characters or non-ASCII text are rejected before a
request is made, without logging their value.

In HTTP mode, neither this key nor a downloaded FunctionGemma model cache starts inference.
Before Pitch Mode can make model-backed decisions, start a separately managed
server that exposes OpenAI-compatible tool calling at `/v1/chat/completions`.
When the status endpoint reports `connection_refused`, no runtime is accepting
connections: start that server and keep its `/v1` URL in
`FUNCTION_GEMMA_BASE_URL`. It is not an OAuth failure. Authentication failures
are reported separately as `function_gemma_auth_rejected`; check the backend's
static bearer token only if the server is already reachable.

Leave `FUNCTION_GEMMA_BASE_URL` blank to use `http://127.0.0.1:8000/v1` for a
native backend or `http://host.docker.internal:8000/v1` in Docker Compose. Set
it only when your separately managed server uses a different endpoint.

The root `.env` and then ignored `.env.local` are loaded when the backend starts. Existing process environment
variables take precedence over `.env`, and an explicit `FunctionGemmaService`
constructor key takes precedence over either for tests or integrations. After
editing `.env`, restart the native backend. For Docker Compose, recreate the
backend container so Compose reinjects the new value:

```bash
docker compose up -d --force-recreate backend
```

In Docker, the default model URL uses `host.docker.internal` so the separately
managed service can remain outside this compose stack. Keep this server-only
token out of `NEXT_PUBLIC_` variables and source control.

## Verification

Run checks without starting servers:

```bash
backend\.venv\Scripts\python -m unittest discover -s tests
npm run test:frontend
.\node_modules\.bin\tsc.cmd --noEmit
npm run lint
npm run build
git diff --check
```

The public marketing routes remain static and frontend-only deployments retain
manual pitch navigation. Microphone transcription and model-backed decisions
require a reachable backend and their respective separately configured service.
