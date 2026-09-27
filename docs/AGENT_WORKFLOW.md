# Codex Agent Workflow

## What this system does

This repository uses Codex-native project instructions and named agent roles to
move software tasks through a bounded quality loop:

```text
UNDERSTAND -> EXPLORE -> PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> DONE
```

Exploration is optional, and failed verification or material review findings go
back to implementation. The workflow is repository configuration, not a custom
service: there is no daemon, state database, queue, dashboard, or orchestration
application.

The governing principle is `TASK -> CONTRACT -> CHANGE -> PROOF`:

- the Planner turns the task into a concrete contract;
- the Implementer makes the scoped change;
- the Verifier supplies mechanical evidence;
- the Reviewer independently scrutinizes the result;
- the Orchestrator owns state and decides when to stop.

## Configuration

- `AGENTS.md` is the permanent repository engineering constitution.
- `.codex/config.toml` registers the roles and bounds concurrency/delegation.
- `.codex/agents/*.toml` contains the role-specific behavioral and permission
  contracts.

The existing shadcn MCP configuration remains in `.codex/config.toml`. The agent
workflow does not require it and the repository rule against networking still
applies.

## Agent roles

### Orchestrator

Owns the objective, acceptance criteria, plan, current stage, open issues,
verification/review status, and attempt counts. It chooses the smallest workflow
that fits, delegates work, routes concrete failures, and returns `COMPLETE` or
`BLOCKED`. It does not code substantial tasks itself.

### Explorer

Read-only repository investigator. It locates relevant files, current behavior,
dependencies, conventions, constraints, and tests. Use it when repository facts
are missing, especially for cross-cutting or unfamiliar work.

### Planner

Read-only contract author. It grounds a dependency-ordered plan in the actual
repository and defines observable acceptance criteria, verification strategy,
and task-relevant risks.

### Implementer

The only role intended to edit source and tests. It inspects first, follows the
accepted contract, makes the smallest coherent change, checks its diff, and
handles concrete repair requests.

### Verifier

Runs targeted and broader checks and evaluates every acceptance criterion.
Verifier has workspace-write sandbox access only because type checks and builds
may create generated artifacts; its role contract forbids source edits. It
classifies failures instead of guessing.

### Reviewer

Read-only skeptical senior review. It inspects the verified diff and surrounding
code for material correctness, regression, reliability, security, API, state,
edge-case, complexity, and test problems. It returns actionable severity-ranked
findings or `APPROVED` and does not rewrite code.

## Workflow

```text
                 ORCHESTRATOR
                      |
                      v
                  EXPLORER
                   optional
                      |
                      v
                   PLANNER
                      |
                      v
                 IMPLEMENTER <-------------+
                      |                     |
                      v                     |
                   VERIFIER                 |
                  /        \                |
              pass          fail -----------+
               |
               v
            REVIEWER
             /    \
       approved    issues ------------------+
          |
          v
         DONE
```

The Orchestrator tracks one of these states:

`UNDERSTANDING`, `EXPLORING`, `PLANNING`, `IMPLEMENTING`, `VERIFYING`,
`REVIEWING`, `REPAIRING`, `COMPLETE`, or `BLOCKED`.

The logical repair loop is:

1. Understand the request and establish acceptance criteria.
2. Explore when the repository context is insufficient.
3. Create and validate a repository-grounded plan.
4. Delegate one implementation owner.
5. Verify the change against the acceptance criteria.
6. On verification failure, send the concrete classified failure to the
   Implementer, re-verify, and stop if the repair limit is reached.
7. After verification passes, independently review the diff.
8. On material review findings, send only actionable findings to the
   Implementer, re-verify, re-review, and stop if the review limit is reached.
9. Return `COMPLETE` only when the Definition of Done is satisfied.

An iteration is justified only by new information such as a failing check,
unmet acceptance criterion, concrete regression, material reviewer finding, or
new repository constraint. Optional polish is not a reason to loop.

## Task complexity routing

Use the smallest sufficient route.

### Small task

Examples: typo, one-line bug, simple copy change, small CSS adjustment.

```text
IMPLEMENT -> VERIFY
```

### Medium task

Examples: component feature, small API addition, isolated backend behavior, or
moderate bug fix.

```text
PLAN -> IMPLEMENT -> VERIFY -> REVIEW
```

### Large task

Examples: authentication, schema changes, cross-stack workflows, or
architectural migration.

```text
EXPLORE -> PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> bounded repair if needed
```

Trivial tasks do not need six roles. Independent read-only exploration can run
in parallel, but agents must not concurrently modify the same files.

## Agent handoffs

Agents should receive summarized, stage-specific context rather than the full
conversation or enormous logs. Use this common format and omit empty sections:

```text
TASK OBJECTIVE:
...

ACCEPTANCE CRITERIA:
1. ...

CURRENT STAGE:
...

RELEVANT FILES:
...

RELEVANT PLAN STEP:
...

KNOWN CONSTRAINTS:
...

CURRENT FAILURE:
...

REQUESTED OUTPUT:
...
```

The original objective and acceptance criteria remain authoritative. A worker
may adapt an invalid implementation plan to repository reality, but may not
silently redefine the requested outcome.

## How to start a task

Open the repository in Codex and use a normal task prompt. Ask for the standard
workflow; you do not need to reproduce the orchestration instructions.

For example:

```text
Implement persistent project selection.

Requirements:
- Users can create, rename, archive, and delete projects.
- Tasks belong to a project.
- The selected project persists across reloads.

Constraints:
- Preserve unrelated canvas behavior.
- Do not add a dependency unless the existing architecture requires it.

Follow the standard project agent workflow. Inspect the existing implementation
before making changes.
```

For maximum clarity on a substantial task, add: `Use the Orchestrator role and
delegate the appropriate repository roles.` The task prompt should mostly say
what needs to happen; `AGENTS.md` and the role files define how agents work.

After changing `.codex/config.toml` or a role file, start a new Codex task if the
current surface does not reload project configuration automatically.

## Writing good task requests

Include what is known and omit orchestration boilerplate:

- desired user-visible or API behavior;
- known constraints and compatibility requirements;
- acceptance criteria, if already known;
- behavior and files that must not change;
- relevant error output for a bug, when available.

Do not prescribe a redesign unless the redesign itself is the requirement. Let
Explorer and Planner discover the existing architecture first.

## Verification in this repository

Relevant local, network-free commands currently include:

```powershell
backend\.venv\Scripts\python -m unittest discover -s tests
.\node_modules\.bin\tsc.cmd --noEmit
npm run lint
npm run build
```

Agents choose checks based on the changed area. `npm run lint` is present in
`package.json`, but its result must be reported honestly because tool support can
change across Next.js versions. Do not start `npm run dev`, the backend server,
or Docker as verification. Tests mock external model requests.

Verification output uses `PASS`/`FAIL`, lists commands actually run, evaluates
each acceptance criterion, and classifies failures as:

- `IMPLEMENTATION_FAILURE`
- `TEST_FAILURE`
- `ENVIRONMENT_FAILURE`
- `DEPENDENCY_FAILURE`
- `PREEXISTING_FAILURE`
- `UNKNOWN_FAILURE`

An unavailable check is not a pass and must be disclosed.

## Repair loops and stopping

Default hard limits are:

- 3 implementation attempts;
- 3 verification repair cycles;
- 2 review correction cycles.

When a limit is reached, the Orchestrator returns `BLOCKED` with the failing
evidence, attempts made, likely root cause, and recommended human action. It must
not retry blindly or continue because more improvement is imaginable.

A task reaches `COMPLETE` only when requested behavior and acceptance criteria
are satisfied, targeted tests pass, appropriate broader checks pass, the build,
lint, and type check pass when applicable (or unavailable/pre-existing failures
are accurately disclosed), the diff is independently reviewed, and no known
blocker remains.

## Model selection

Correctness depends on role contracts, not model names. Use the default model
when per-role overrides are unavailable or undesirable. If models are assigned,
use priorities rather than fragile requirements:

- Orchestrator: strong reasoning and context management.
- Explorer: fast, economical repository search.
- Planner: strong architecture reasoning.
- Implementer: strongest suitable coding model within budget.
- Verifier: reliable tool use and deterministic reasoning.
- Reviewer: skeptical, strong code analysis.

No role file pins a model, so repository defaults and future model changes do
not break the workflow.

## Permissions

- Orchestrator: read-only coordination and inspection.
- Explorer: read-only.
- Planner: read-only.
- Reviewer: read-only.
- Verifier: workspace-write for generated check/build artifacts, with an explicit
  prohibition on source edits.
- Implementer: normal workspace-write development access.

Sandboxing is a mechanical boundary for the read-only roles. Behavioral
instructions supplement sandboxing for Verifier. Repository-wide restrictions
still apply: no networking, dependency installation, secret exposure, or server
startup.

## Troubleshooting

### A custom agent does not load

Confirm the repository is trusted, `.codex/config.toml` is being read, the
`config_file` path exists relative to `.codex/`, and the current Codex build has
multi-agent support enabled. Start a new task after configuration changes. If
the current surface cannot select custom roles, follow the same contracts
sequentially in the primary agent and disclose that limitation.

### Agent configuration syntax fails

Validate the TOML with a parser and inspect the role path named in the error.
Keep role registration in `.codex/config.toml` and role settings in
`.codex/agents/*.toml`. Avoid undocumented fields. Use Codex strict configuration
validation when the active CLI command supports it.

### Tests or commands are unavailable

Check that `node_modules` and `backend/.venv` already exist. Do not install
dependencies because this repository prohibits networking. Classify the result
as an environment or dependency failure and provide the exact human next step.

### A check fails for pre-existing reasons

Record the exact failure and establish whether it reproduces outside the task
diff. Do not hide it or rewrite unrelated code. Classify it as pre-existing only
when repository evidence supports that conclusion.

### Permissions are unexpected

Confirm the role's `sandbox_mode`. Explorer, Planner, Reviewer, and Orchestrator
should be read-only. Verifier needs generated-artifact writes but must not edit
source. Escalate rather than bypassing a protected workflow.

### An agent ignores its role

Use a minimal handoff with an explicit `CURRENT STAGE` and `REQUESTED OUTPUT`.
Do not give a read-only role an implementation task. Replace a non-conforming
result instead of allowing role drift into later stages.

### The workflow loops excessively

Inspect attempt counts and demand the new evidence that justifies another
iteration. Stop at the configured limits. Subjective polish and repeated advice
are not new evidence.

### Agents produce conflicting edits

Stop concurrent editing, preserve the working tree, and assign one Implementer
as the owner of overlapping files. Parallelize investigation, not overlapping
source changes.

## Deliberate omissions

No helper verification script is added because the repository already exposes
the necessary focused commands, and one universal script would either duplicate
them or incorrectly make every task run every check. No model override, external
service, network dependency, database, dashboard, queue, or custom state-machine
application is required.
