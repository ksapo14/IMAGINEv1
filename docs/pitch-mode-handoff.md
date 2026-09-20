# Pitch Mode implementation handoff

Branch: `codex/pitch-mode`, based on `main` at `83dfe61`.
Status: implementation and independent code review complete; production build
and browser acceptance remain blocked or unverified as described below.

## Delivered behavior

- `/pitch` hosts the 18-slide Imagineer deck. `/canvas` redirects to it. Both
  routes remain non-indexed; the marketing sitemap is unchanged.
- Native React slide layouts preserve semantic IDs, source copy and embedded
  artwork. Scoped drawing routines preserve entrance animations, classroom
  subjects and market controls. Re-entry/replay reset local state; redundant
  model proposals do not replay. Reduced motion stops decorative loops.
- `lib/pitch/controller.ts` owns navigation. It rejects invalid and stale model
  results, cancels superseded work, and enforces a five-second evaluation timeout.
- `lib/pitch/types.ts` defines the replaceable adapter contract. The default
  lexical adapter is configured by deck-owned phrases and keywords. Inject a
  future adapter through the client-side `PitchWorkspace` boundary.
- Deepgram Flux turn boundaries and legacy finalized Results use the same
  evaluation path as typed test utterances. Microphone resources and pending
  results are guarded by session identity; frontend-only deployments retain
  manual navigation and offline typed evaluation.
- Only the deck identity, version and current semantic slide are persisted.
  Existing lesson/whiteboard storage and backend generation services remain.
- No dependencies, model inference, training infrastructure, network endpoints,
  or backend implementation changes were added.

## Verification on September 20, 2026

| Check | Actual result |
| --- | --- |
| `npm run test:frontend` | Passed: 61 tests. Required elevated execution because the sandbox blocks Node test worker spawning. |
| `backend\.venv\Scripts\python -m unittest discover -s tests` | Passed: 150 tests, including retained backend and revised route contracts. |
| `.\node_modules\.bin\tsc.cmd --noEmit` | Passed. |
| `node --check components/pitch/deck/deck-art.js` | Passed. |
| `git diff --check` | Passed. |
| `npm run lint` | Existing command incompatibility: installed Next.js treats `lint` as a project directory. No lint success is claimed. |
| `npm run build` | Failed opening installed Vite `dist/node/chunks/build.js` with `UNKNOWN`, both sandboxed and elevated. Direct Vite module import independently fails opening its `chunks/lib.js`. Dependencies were not changed. |
| Independent review | Approved after repair and regression coverage for classroom animations continuing after subject changes. |

The deck tests execute the actual JSX and drawing routines with a lightweight
fake DOM and clock. They verify all 18 roots, artwork mounting, market controls,
subject switches, reduced motion, cancellation and stale callbacks. They do not
establish browser layout or visual equivalence.

## Remaining acceptance work

1. Resolve the local installed Vite file-access issue, then rerun `npm run build`.
   Dependency installation was outside this task's authorized scope.
2. On a user-started frontend, compare all 18 slides with the supplied
   `Imagineer_Pitch_Carl (2).html`. Check entrance/replay, rapid navigation,
   classroom tabs/cycling, teacher/school and market expansion controls,
   fullscreen, keyboard focus, small viewports, and reduced motion.
3. Confirm typed examples navigate forward and backward: “Our private-school
   market across North Carolina”, “The teacher next door brings us into the
   next classroom”, and “Here is our three-year financial projection”.
4. Perform a separate user-run Deepgram check with the backend and microphone.
   Live network verification was intentionally not performed.

No server was started, and no branch was pushed or merged. Poppins is not
bundled; the source fallback stack is used until a local font is supplied.
