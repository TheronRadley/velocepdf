# Contributing to VelocePDF

Thanks for considering a contribution. VelocePDF is a small, maintainable open-source PDF reader. We value correctness, accessibility, and privacy over feature breadth.

## Getting Started

### Prerequisites

- Node.js 20+ and npm 10+
- For desktop builds: Rust 1.77+ and OS-specific prerequisites:
  - **Windows**: WebView2 (evergreen), Visual Studio Build Tools with C++.
  - **macOS**: Xcode Command Line Tools, 10.15+ (Intel) or 11+ (Apple Silicon).
  - **Linux**: `webkit2gtk-4.1`, `libayatana-appindicator3`, `librsvg2-dev`, `libssl-dev` (see Tauri prerequisites).

### Setup

```bash
git clone https://github.com/TheronRadley/velocepdf.git
cd velocepdf
npm install
npm run dev        # web preview at http://localhost:5173
npm run build      # production build to dist/
npm test           # unit tests
npm run typecheck  # type checking
```

For Tauri (desktop):

```bash
npm run tauri:dev   # requires Rust
npm run tauri:build # produces .deb/.AppImage, .msi, .dmg (platform-dependent)
```

## Project Structure

- `src/` — React + TypeScript frontend (toolbar, sidebar, viewer, worker isolation)
- `src/lib/pdfEngine.ts` — PDF.js configuration (JS disabled, bounded options)
- `src/lib/sanitize.ts` — URL scheme allowlist, filename sanitization
- `src/lib/storage.ts` — optional history, localStorage with clear
- `src-tauri/` — Rust shell, secure IPC, atomic save (when built as desktop app)
- `tests/` — unit + integration tests, fixtures (redistributable)
- `docs/` — architecture, threat model, benchmarks, roadmap
- `.github/workflows/` — CI for lint, typecheck, tests, builds, audit

## Development Guidelines

- **Treat every PDF as untrusted**. Do not enable `eval`, JS execution, launch actions, or auto-fetch.
- Keep document work off the UI thread — use Workers and cancellable jobs.
- Prefer bounded caches and explicit resource limits.
- Maintain typed interfaces and minimal global state.
- Respect accessibility: keyboard navigation, visible focus, ARIA labels, contrast, reduced-motion.
- No telemetry, no accounts, no cloud sync, no AI assistants.
- Do not implement redaction as black rectangles; content removal must be verified or omitted.

## Pull Requests

1. Open an issue first for large changes.
2. Keep PRs focused; include tests for new logic.
3. Ensure: `npm run typecheck`, `npm test`, `npm run build` all pass.
4. For visual changes, include before/after screenshots.
5. Update docs where behavior changes.

PRs run CI on Windows, macOS, and Linux (build verification). Maintainers will review for security and accessibility.

## Reporting Issues

Use GitHub Issues. For security-sensitive reports, see [SECURITY.md](SECURITY.md) and use the private advisory route — do not post exploit details publicly.

Include: OS version, architecture, app version, steps to reproduce, and (if possible) a minimal sample PDF that is legally redistributable.

## Code Style

- TypeScript strict, ESLint + Prettier.
- Run `npm run format:write` before committing if needed.
- Commit messages: imperative, e.g., "feat: add two-page cover handling".

## License

By contributing, you agree that your contributions are licensed under the MIT license in [LICENSE](LICENSE).
