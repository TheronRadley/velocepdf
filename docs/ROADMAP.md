# Roadmap — VelocePDF (Native)

## Shipped 0.2.0 — Native (Sumatra-inspired)

- MuPDF C+ASM via PyMuPDF, C++ BMH search, Assembly blend stub, Tabler theme (existing, not AI)
- Flask `/api/page` pixmap streaming, tabs, Frequently Read, Command Palette (Ctrl+K), outline, search, password, metadata, print
- Native `veloce-pdfinfo` C++ CLI, pybind11 extension, Java PDFBox optional
- Security: JS/launch/auto-fetch disabled, allowlist, sanitized, 200MB/500 bounds, zero network
- Tests: pytest 9 passing, MuPDF render regression, audit in CI

## Shipped 0.1.0 — Legacy web (archived in web-legacy/)

- React+PDF.js+Tauri — kept for reference, not primary.

## Next 0.3.x

- Direct `fz_run_page` C++ renderer (no Python overhead) for <100 ms first-page (Sumatra-like)
- Qt `desktop_qt.py` with QFluentWidgets (Fluent, existing) — native window, still Tabler for web preview
- OCR language packs (SHA-256 verified, lazy)
- Visual regression (playwright vs golden, 0.5% threshold)

Not planned: AI assistants, cloud sync, telemetry, accounts, plugin system.

