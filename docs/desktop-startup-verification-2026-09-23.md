# Desktop startup verification — 2026-09-23 (historical)

This record describes the earlier packaged sidecar build. It is retained as historical verification and does not describe the current local Python evaluator. See [DOCS.md](../DOCS.md) for the current architecture.

The selected `backend/.venv` runs Python 3.13 as AMD64. The matching Tauri target is `x86_64-pc-windows-msvc`.

## Installed prerequisites

- PyInstaller 6.22.3, Transformers 4.57.6, tokenizers 0.22.2, and PyTorch 2.9.1+cpu in `backend/.venv`. The PyTorch import reported `cuda=None` and `hip=None`; `pip check` found no broken requirements.
- Project Tauri CLI 2.11.5 and ESLint 9 with `eslint-config-next` 16.2.6.
- Rust crates fetched and pinned in `desktop/src-tauri/Cargo.lock`.

## Commands and outcomes

| Command | Result |
| --- | --- |
| `./scripts/package-sidecar.ps1 -Python backend/.venv/Scripts/python.exe -Target x86_64-pc-windows-msvc` | Passed; staged the CPU-only sidecar. |
| Staged sidecar with no model argument | Returned the expected `invalid_model_folder` startup frame. |
| Staged sidecar with an incomplete local model folder | Returned the expected `load_failure` startup frame, confirming the frozen dependency imports succeeded. |
| `backend/.venv/Scripts/python.exe scripts/prepare_function_gemma.py --offline` | Passed with the cached official snapshot; two offline decisions reused one Python worker after a 31.0-second cold start. |
| `backend/.venv/Scripts/python.exe scripts/prepare_function_gemma.py --offline --sidecar desktop/src-tauri/binaries/function-gemma-sidecar-x86_64-pc-windows-msvc.exe` | Passed with the cached official snapshot; two offline decisions reused one frozen worker after a 23.7-second cold start. |
| `backend/.venv/Scripts/python.exe -m unittest discover -s tests` | 30 tests passed. |
| `npm run test:frontend` | 18 tests passed. |
| `./node_modules/.bin/tsc.cmd --noEmit` and `npm run check:desktop` | Passed. |
| `npm run lint` | Passed with 28 warnings and no errors. |
| `npm run build:desktop-ui` and `npm run build` | Both passed. |
| `cargo fmt --manifest-path desktop/src-tauri/Cargo.toml --check` | Passed. |
| `cargo test --manifest-path desktop/src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --offline` | 10 library tests and 7 integration tests passed after the Rust fixes. |
| `npm run dev:desktop-ui` | Vite ready; HTTP GET of `/` returned 200 with title `Imagineer Pitch Mode`. |
| `../node_modules/.bin/tauri.cmd dev --target x86_64-pc-windows-msvc` from `desktop/` | Compiled and launched `imagine-pitch.exe`; process remained running without a startup error, then was stopped. |
| `../node_modules/.bin/tauri.cmd build --debug --target x86_64-pc-windows-msvc --bundles nsis --ci` from `desktop/` | Passed with the sidecar executable and `_internal` directory as resources; created `Imagine Pitch_0.1.0_x64-setup.exe` (147,269,197 bytes; SHA-256 `8B48A980360FD96DD6452A3896635507DB40EE2B51DC2AB12F05D99A2B937414`). |

The Tauri startup needed access to its Windows user-data directory; the sandboxed run was denied, and the approved elevated run stayed up without a new error. The Windows UI inspection helper did not initialize, so visual rendering was not checked. The cached official snapshot supported a real frozen-sidecar smoke test, but an in-app decision was not visually checked. Installer execution on a clean Windows machine and microphone/Deepgram checks were not performed.

During npm dependency installation, npm reported 11 dependency advisories (2 moderate, 8 high, 1 critical). Broad dependency upgrades were outside this packaging and startup fix.
