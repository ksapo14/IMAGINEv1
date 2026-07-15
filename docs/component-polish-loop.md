# Component Polish Loop

Use this prompt when a component should be refined by a self-contained Codex
loop. It stays inside the current Codex plan, uses no API credentials, starts no
servers, and keeps work isolated on a feature branch until a pull request is
ready for review.

## Operating Rules

- Work on a dedicated branch before editing files. Prefer
  `codex/<component>-polish`; if slash-based branch names are unavailable, use
  `codex-<component>-polish`.
- Do not use external API credentials, add service keys, or introduce hosted
  automation.
- Do not start the frontend dev server or backend server. Ask the user to start
  them if live runtime verification is required.
- Keep edits scoped to the target component and directly related tests,
  styles, fixtures, or documentation.
- Preserve unrelated user changes. Do not reset, checkout, or overwrite files
  outside the task.
- Create a pull request only after the loop reaches the exit criteria and the
  user approves the PR step. Until then, prepare the PR title and description
  locally.

## Agent Loop

Run these roles in order. Each pass should use the previous pass output as
input, then repeat from review through validation until the exit criteria are
met. The planning agent runs before the first review pass and again only when a
validation result shows the scope or approach needs to change.

1. Planning agent
   - Identify the target component, user-facing goal, affected files, known
     constraints, and validation commands that already exist.
   - Define the polish bar for this component: expected states, responsive
     behavior, accessibility requirements, and tests or checks that should prove
     the work.
   - Produce a short plan with the smallest useful sequence of review, repair,
     and validation steps. Do not edit files during planning.

2. Review agent
   - Inspect the target component, nearby dependencies, styles, and tests.
   - Report concrete issues only: bugs, broken states, accessibility gaps,
     layout regressions, missing tests, confusing copy, or inconsistent
     patterns.
   - Rank findings by severity and include file paths.

3. Repair agent
   - Fix the highest-impact findings with the smallest coherent change.
   - Match existing architecture, naming, styling, and test conventions.
   - Avoid broad rewrites unless the review shows the current structure blocks
     a polished result.

4. Validate agent
   - Run available non-network validation commands that already exist in the
     repo, such as unit tests, lint, type checks, or builds.
   - If a command is missing, unsafe, network-bound, or requires a user-started
     server, record that clearly instead of inventing a replacement.
   - Re-review the changed component for visual fit, keyboard behavior,
     loading/error/empty states, responsive layout, and accessible names.

## Exit Criteria

The loop is polished only when all of these are true:

- No open high- or medium-severity review findings remain.
- Validation commands that can run locally have passed, or any skipped checks
  have a clear reason.
- The component handles normal, empty, loading, error, disabled, and narrow
  viewport states when those states apply.
- The implementation is smaller or clearer than the problem it solves.
- A PR title, summary, test notes, and risk notes are ready.

If three consecutive passes find the same blocker without progress, stop and ask
the user for the missing input instead of looping silently.

## Pasteable Codex Prompt

```text
Run the component polish loop for: <component/path/user-facing area>.

Constraints:
- Use my existing Codex plan only. Do not add or request API credentials.
- Do not do networking.
- Do not start the frontend or backend server; I will start servers if needed.
- Work on a dedicated branch first.
- Preserve unrelated worktree changes.
- Keep changes scoped to this component and its direct tests/styles/docs.
- Start with planning, then continue review -> repair -> validate passes until
  the exit criteria are met or the same blocker repeats three times.
- Prepare a PR title and description when done, but ask before any push or PR
  creation.

Planning agent:
- Identify the target component, affected files, constraints, existing local
  checks, and the expected polish bar.
- Produce a short execution plan before any edits.

Review agent:
- Find concrete bugs, UX polish issues, accessibility gaps, state handling
  problems, responsive layout issues, and missing tests.
- Rank findings by severity with file paths.

Repair agent:
- Fix the highest-impact findings in small, coherent edits.
- Follow existing project patterns.

Validate agent:
- Run existing local, non-network checks only.
- Reinspect the component for polish across states and viewport sizes.
- Feed remaining issues into the next loop pass.

Done means:
- No high- or medium-severity findings remain.
- Local validation passes or skipped checks are explained.
- PR title, summary, tests, and risk notes are ready for my approval.
```
