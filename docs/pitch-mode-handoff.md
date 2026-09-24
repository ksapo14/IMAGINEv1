# Pitch Mode handoff

Pitch Mode renders the 18-slide Imagineer deck at `/pitch`; `/canvas` remains a
redirect for existing bookmarks. The controller owns every transition, keeping
manual navigation intact and rejecting stale, redundant, malformed, and
unknown model decisions.

Deepgram Flux boundaries and typed test utterances both call the default
FunctionGemma HTTP adapter. The adapter posts the finalized utterance, current
slide, and available semantic slide descriptions to `/api/pitch/decide` and
forwards cancellation. The FastAPI route calls a separately managed
OpenAI-compatible FunctionGemma server using `google/functiongemma-270m-it` by
default. It constrains the provider to exactly `goto_slide` or `no_action` and
validates the tool call before returning it to the controller.

The backend intentionally does not serve cached model weights. A separately
managed runtime must expose OpenAI-compatible tools at `/v1/chat/completions`.
`/health` is backend liveness only; `/api/pitch/status?probe=true` performs a
bounded protocol probe and reports `ready` only after a valid tool response.

The backend retains CORS, origin, transcription session, and rate-limit
protections. It does not run model inference, download model assets, or start a
model server. The old backend generation, streaming, and visual endpoints are
removed.
