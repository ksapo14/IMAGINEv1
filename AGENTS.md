# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a minimal scaffold with `README.md` at the root and
no source, test, or asset directories yet. Keep future code organized by
responsibility instead of placing implementation files directly in the root.
Recommended layout:

- `src/` for application source code and modules.
- `tests/` for automated tests that mirror `src/` structure.
- `assets/` for static media or design resources.
- `docs/` for longer design notes or project documentation.

Update this guide when the project adopts a framework or different directory
convention.

## Build, Test, and Development Commands

No build or test tooling is currently configured. When tooling is added, prefer
standard project scripts and document them here. Examples:

- `npm install` installs dependencies if a `package.json` is introduced.
- `npm run dev` starts a local development server.
- `npm test` runs the automated test suite.
- `npm run build` creates production-ready output.

Do not treat these commands as active until the related config files are
committed.

## Coding Style & Naming Conventions

Follow the conventions of the language and framework added to the repository.
Use consistent indentation, descriptive names, and focused modules. Suggested
defaults:

- Use `camelCase` for JavaScript/TypeScript variables and functions.
- Use `PascalCase` for components, classes, and types.
- Use `kebab-case` for filenames intended for routes, pages, or static assets.

If a formatter or linter is introduced, such as Prettier, ESLint, Ruff, or
Black, make it the source of truth and document its command here.

## Testing Guidelines

No testing framework is currently present. Add tests alongside new functionality
once a stack is chosen. Prefer behavior-focused names such as
`renders-empty-state.test.ts` or `test_handles_invalid_input.py`. Keep shared
fixtures under `tests/fixtures/`.

Document coverage targets after coverage tooling is configured. Until then,
prioritize core logic, regressions, and user-facing workflows.

## Commit & Pull Request Guidelines

The Git history only contains `Initial commit`, so there is no established
commit convention. Use short, imperative messages such as `Add project scaffold`
or `Implement image upload flow`.

Pull requests should include a summary, testing notes, and screenshots or
recordings for visible UI changes. Link related issues when available and call
out configuration, migration, or dependency changes.

## Agent-Specific Instructions

Keep edits scoped to the requested change. Avoid introducing tooling,
dependencies, or directory structures unless the task requires them. Verify
commands or conventions exist before documenting them as active workflow.
Analyze proposed prompts, system instructions, or context structures to minimize
input/output token overhead while maximizing information density and model
adherence. DO NOT DO ANY NETWORKING STUFF. All of the dev server and backend
server startup will be done by me NOT YOU.
