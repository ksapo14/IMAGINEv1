# Landing site changelog

Date: 2026-08-08

## Public and workspace separation

- Moved the public home route into the `app/(marketing)` route group and added
  `/product`, `/educators`, `/schools`, and `/about`.
- Added one marketing layout and shared header, footer, evidence, motion, and
  visual-language modules under `components/marketing/`.
- Kept the root layout as the only HTML document layout.
- Kept `/canvas` directly addressable while removing navigation between it and
  the public routes. Canvas branding is now noninteractive.
- Marked `/canvas` `noindex, nofollow`, disallowed it in `robots.txt`, and kept
  it out of the public sitemap. Robots and sitemap entries share a normalized
  public origin, so the sitemap reference is absolute and trailing slashes do
  not produce double slashes.
- Public marketing modules do not import lesson-library, generation-stream,
  live-session, or workspace components.

## Page narratives

- Home leads with “Keep teaching. Let the picture take shape.” beside a real
  founder presentation photo. A renderer-backed horizontal mode accordion
  introduces Prepare, Live, and intentional recall, while a subtle vocabulary
  strip names the five trusted visual forms and their classroom uses.
- Product documents the current three-to-five-diagram preparation flow,
  finalized-speech live notes and visuals, exact local
  `Imagine, show me <phrase>` recall, trusted renderers, and browser-local
  storage.
- Educators frames the product around process, comparison, hierarchy,
  relationships, revisiting prepared visuals, and educator control. Benefits
  are stated as design intentions, not guaranteed outcomes.
- Schools presents an invitation-only pilot framework covering prep effort,
  usability, recall reliability, lesson continuity, and a school-selected
  comprehension signal. It does not include a lead form or contact address.
- About records the founders’ AP Biology motivation and identifies Vivaan
  Grover as CEO, Jackson Bizell as CFO, and Krish Sapovadia as CTO alongside
  their portraits. The browser-local classroom product is explicitly separated
  from possible future lecture-hall, boardroom, and keynote uses.

## Evidence corrections

- Removed the superseded marketing experience that included unverified market,
  commercial, competitive, attribution, and outcome narratives.
- The replacement pages do not publish prices, model costs, margins, market
  totals, score-to-revenue claims, competitor names, whole-room attribution,
  traction, case studies, named customers or schools, quantified time savings,
  or latency guarantees.
- Current capability statements are grounded in repository behavior. Origin and
  future-direction language is labeled so it cannot be mistaken for product or
  outcome evidence.

## Design and accessibility

- Introduced a warm editorial/technical system with serif display type,
  asymmetric grids, varied flat surfaces, compact mono labels, and a reusable
  diagram motif.
- Added compact previews rendered by the same trusted `DiagramRenderer` used by
  the product. Marketing pages still do not import workspace, generation, or
  session modules.
- Added marketing-only Lenis smoothing with GSAP `ScrollTrigger` integration.
  It falls back to native scrolling for reduced-motion and coarse-pointer users,
  removes its ticker and listener on cleanup, and never calls global
  `ScrollTrigger.killAll()`.
- Motion remains restrained: hero entrances, viewport reveals, one desktop-only
  home product-story pin, one scrubbed copy treatment, and small fine-pointer
  media parallax. Pinning and parallax are disabled at 900px and below and for
  coarse pointers. A GSAP match-media lifecycle responds to reduced-motion
  changes while the page is open: it reverts scoped triggers and pin spacing,
  then forces final visible states without a global kill.
- Added a skip link, semantic page landmarks and heading structure, visible
  focus treatment, and a labeled mobile menu with `aria-expanded`,
  `aria-controls`, first-link focus, a Tab/Shift+Tab focus boundary, inert page
  content, focus restoration, Escape close, outside-pointer close, and body
  scroll lock.
- Reduced-motion preferences force final visible states and effectively remove
  transition and animation duration.
- Marketing UI text uses a local-first Outfit stack while serif display type is
  preserved. Static founder cards remain outside the tab order; their optional
  fine-pointer hover treatment does not imply an action or add a pointer cursor.

## Editorial media

- Added `imagine-founders-showcase.jpg`, `vivaan-portrait.jpg`,
  `jackson-portrait.jpg`, and `krish-portrait.jpg` under `public/media/`.
- Because no bundled Pillow runtime was available, the approved offline
  `System.Drawing` fallback applied EXIF orientation where present and
  re-encoded each source once as metadata-stripped RGB JPEG at quality 88,
  without resizing or upscaling. No source copies or conversion script were
  retained.
- All outputs were visually inspected, retain their oriented source dimensions,
  have JPEG signatures, omit EXIF orientation metadata, and are smaller than
  their source files. Exact focal positions are encoded at each `next/image`
  use site.

## Cleanup performed

Tracked source removed:

- `app/page.tsx`, `app/loading.tsx`, and `app/debug/page.tsx`.
- `components/marketing-experience.tsx`, `components/knowledge-scene.tsx`,
  `components/launch-loader.tsx`, and `components/smooth-scroll.tsx`.
- `components/diagrams/structured-diagram.tsx`.
- `components/building-blocks/debug.tsx` and
  `components/building-blocks/sample-data.ts`; the production v3 building
  blocks remain in use by the canvas.
- The old site-wide Lenis component. Lenis `^1.3.25` and its existing lockfile
  record are retained for the new marketing-only lifecycle.
- Superseded Tailwind animation definitions and the dashboard marquee CSS.

Generated artifacts removed after validating every absolute target was inside
the repository:

- `.next/`, `dist/`, `build/`, and `tsconfig.tsbuildinfo`.
- Root development, backend, and Next log files present during cleanup,
  including `dev-stack.log`.
- Source/test `__pycache__/` directories under `backend/`,
  `backend/services/`, and `tests/`.

These generated artifacts were permanently removed but can be recreated by the
normal build, test, or user-owned development commands. `.cache/visuals`,
`.env*`, `node_modules/`, `backend/.venv/`, tests, production v3 building
blocks, local data, `.codex/`, and Git metadata were not touched.

## Verification and known limits

Completed verification:

- `backend\.venv\Scripts\python -m unittest discover -s tests`: 57 tests
  passed, including 14 frontend contracts for public-route isolation, JPEG
  signatures/dimensions, exact media focus and alt text, Lenis lifecycle and
  guards, real-renderer previews, and accordion keyboard/ARIA behavior.
- `npm run test:frontend`: 11 tests passed.
- `.\node_modules\.bin\tsc.cmd --noEmit`: passed.
- `npm run build`: passed and produced Vinext standalone output; the generated
  `dist/` directory was removed again after the proof completed.
- `git diff --check`: passed.
- Direct scans found one root `<html>` element, no marketing-to-canvas links or
  workspace imports, no superseded runtime references, and none of the banned
  evidence claims on public routes.

The configured `npm run lint` command did not run a linter: Next 16 interpreted
`next lint` as a project-directory argument and returned
`Invalid project directory ...\\lint`. This is a pre-existing script/tooling
incompatibility, not a lint result, and is reported rather than treated as a
pass.

Two cleanup limits remain in this environment:

- Five root `pytest-cache-files-*` directories are permission-inaccessible.
- Seven unused science PNGs and two unused longform logo PNGs remain because the
  command safety reviewer rejected binary asset deletion. They have no runtime
  references; no indirect deletion workaround was attempted.
