# Imagine v1 Agent Guidelines

## User-facing responses

Begin every user-facing response with this exact line:

```text
Krish Sapovadia
```

## Project objective

Produce correct, maintainable changes that satisfy the requested behavior while
preserving unrelated functionality. The operating principle is:

```text
TASK -> CONTRACT -> CHANGE -> PROOF
```

The Planner defines the contract, the Implementer creates the change, the
Verifier provides mechanical proof, the Reviewer provides independent scrutiny,
and the Orchestrator decides when the task is complete.

## Repository map

- `app/`: Next.js App Router routes and layouts.
- `components/`: React UI, marketing, canvas, and diagram components.
- `lib/`: shared TypeScript utilities.
- `backend/`: FastAPI application, FunctionGemma adapter, and transcription services.
- `tests/`: Python unit and repository-contract tests.
- `public/`: static and brand assets.
- `scripts/`: existing development, asset, and build helpers.
- `docs/`: project and workflow documentation.
- `.codex/agents/`: repository-scoped Codex role definitions.

The frontend uses TypeScript, React 19, Next.js 16, Tailwind CSS, and Vinext/Vite.
The backend uses Python, FastAPI, Pydantic, and `unittest`. npm is the JavaScript
package manager; the backend virtual environment normally lives at
`backend/.venv`.

## Commands and constraints

Use only commands that are present in the repository. Do not start the frontend,
backend, development stack, Docker stack, or any long-running server; the user
owns server startup. Do not perform networking or dependency installation.

- Backend tests: `backend\.venv\Scripts\python -m unittest discover -s tests`
- Type check: `.\node_modules\.bin\tsc.cmd --noEmit`
- Configured lint: `npm run lint`
- Production build: `npm run build`

`npm run lint` is a configured project command, but agents must report its actual
result instead of assuming the installed Next.js version supports it. Tests mock
external model requests and must remain network-free. Never expose `.env` values or API keys.

Use local conventions: TypeScript variables/functions in `camelCase`, components
and types in `PascalCase`, route/static filenames in `kebab-case`, Python with
four-space indentation and type hints where the surrounding module uses them.
Keep modules focused and preserve the existing architecture.

## Standard workflow

For non-trivial tasks:

1. Understand the request and establish observable acceptance criteria.
2. Inspect relevant code, tests, architecture, and repository conventions.
3. Produce a concise, dependency-ordered implementation plan.
4. Implement the smallest coherent solution.
5. Add or update tests when behavior changes.
6. Run targeted verification, then broader checks when appropriate.
7. Inspect the resulting diff for accidental or unrelated changes.
8. Perform an independent review after verification succeeds.
9. Repair only concrete failures or material review findings.
10. Stop when the acceptance criteria and Definition of Done are satisfied.

The Orchestrator selects the smallest sufficient route:

- Small: `IMPLEMENT -> VERIFY`
- Medium: `PLAN -> IMPLEMENT -> VERIFY -> REVIEW`
- Large: `EXPLORE -> PLAN -> IMPLEMENT -> VERIFY -> REVIEW`

Exploration is optional. Trivial changes do not require six agents. Parallelize
only genuinely independent investigations, and never allow agents to edit the
same files concurrently.

## Engineering principles

Agents must:

- inspect existing code before editing it;
- prefer existing abstractions over parallel systems;
- avoid unrelated refactors, speculative abstractions, and large rewrites;
- minimize dependencies and preserve backward compatibility unless behavior is
  explicitly being changed;
- validate assumptions against repository evidence;
- preserve unrelated and user-authored work in a dirty worktree;
- add or modify behavior-focused tests when behavior changes;
- handle reasonable edge cases and avoid silently deleting existing behavior;
- never claim a command passed unless it actually ran and passed;
- adapt a plan when repository reality contradicts it, documenting the change;
- keep changes scoped to the assigned task.

## Task state and handoffs

The Orchestrator owns one authoritative state using these stages:

`UNDERSTANDING`, `EXPLORING`, `PLANNING`, `IMPLEMENTING`, `VERIFYING`,
`REVIEWING`, `REPAIRING`, `COMPLETE`, or `BLOCKED`.

Track objective, status, acceptance criteria, current plan, completed steps, open
issues, verification status, review status, and attempt counts. Do not let a
worker redefine the original objective.

Pass the minimum useful context between roles. Use this handoff shape, omitting
empty sections:

```text
TASK OBJECTIVE:

ACCEPTANCE CRITERIA:
1.

CURRENT STAGE:

RELEVANT FILES:

RELEVANT PLAN STEP:

KNOWN CONSTRAINTS:

CURRENT FAILURE:

REQUESTED OUTPUT:
```

Prefer a concise handoff containing the original objective, current acceptance
criteria, relevant plan step and files, repository constraints, and any current
test/reviewer failure. Do not repeatedly pass huge logs or the full conversation
when a summary is sufficient.

## Failure handling and bounded repair

When a check fails:

1. Read the actual error.
2. Classify it as implementation, test, environment, dependency, pre-existing,
   or unknown.
3. Identify the root cause.
4. Make the smallest appropriate correction.
5. Re-run the relevant check.

Never blindly retry the same solution. Another iteration requires new evidence:
a failing check, material reviewer finding, unmet acceptance criterion, concrete
regression, or newly discovered repository constraint. "Could improve this" is
not sufficient.

Default limits per task:

- implementation attempts: 3 maximum;
- verification repair cycles: 3 maximum;
- review correction cycles: 2 maximum.

When a limit is reached, return `BLOCKED` with what failed, what was attempted,
the relevant error, the likely root cause, and the recommended human next step.
Do not continue iterating.

## Definition of Done

A task is `COMPLETE` only when:

- requested behavior is implemented and all acceptance criteria are satisfied;
- targeted tests pass;
- appropriate broader tests and checks pass;
- type checking, lint, and build pass when applicable, or any unavailable or
  pre-existing failure is explicitly reported;
- the final diff has been inspected and independently reviewed;
- no known blocker remains.

Completion reports must include a concise summary, important files changed,
important implementation decisions, checks actually performed, and remaining
limitations. Never report success based only on code inspection.

## Role boundaries

- Orchestrator coordinates and stops the workflow; it does not code substantial
  tasks itself.
- Explorer, Planner, and Reviewer are read-only.
- Verifier may execute checks and write generated build/test artifacts, but must
  not edit application source.
- Implementer has normal workspace write access.

Role-specific contracts live in `.codex/agents/`. If role configuration is not
available in the current Codex surface, follow the same contracts sequentially
in one agent and disclose that limitation; correctness must not depend on a
particular model or on maximizing agent count.
