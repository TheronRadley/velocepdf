# Roadmap — VelocePDF

## Shipped in 0.1.0 (Current)

- **Core reader**: file picker, drag-drop, CLI `?file=` param, tabs (independent sessions, crash isolation), continuous / single / two-page (cover) views, smooth scroll, zoom (50–200% + fit width/page/actual), rotation, page nav, thumbnails, outlines, text selection/copy, search (counts, nav, cancellation, highlights), password PDFs, metadata, session recents (optional, clearable), keyboard shortcuts, fullscreen/presentation, print, honest errors for malformed/damaged.
- **Annotations & editing**: highlight (drag), underline/strikeout/note/ink stubs, undo/redo, edit/delete, Save/Save As (atomic temp+rename in Tauri, blob-download safe write in web), standard annotations via pdf-lib (usable in other readers), AcroForm filling supported where pdf-lib allows, unsupported form types flagged, page extract/reorder/rotate/delete (pdf-lib), export page to PNG, text extraction, signature invalidation warning, image-only honest message.
- **Security**: JS/launch/external auto-fetch disabled, link confirmation + scheme allowlist, no auto attachment exec, filename sanitization, resource bounds (200 MB, 500 matches), no password persistence, temp 0600 + cleanup, optional history, zero network during reading, pinned deps, minimal CI, SECURITY.md private route.
- **Design & a11y**: restrained UI, compact toolbar, collapsible sidebars, light/dark/system, high-DPI, keyboard nav, visible focus, ARIA, reduced-motion, honest scanned/untagged limitations.
- **Platform**: Tauri config for Windows 10+/11, macOS 13+, Linux Ubuntu 22.04+/Fedora 38+, x64/arm64, CI builds, docs for signing/notarization.

## Next (0.2.x) — Quality gates

- Page extraction UI (drag to reorder, multi-select delete, rotate per-page).
- Form filling UI completeness (checkbox, radio, dropdown; unsupported types greyed with tooltip).
- Atomic save external-change detection with file watcher (Tauri mtime poll).
- Visual regression suite (Playwright screenshots vs. golden, threshold 0.5%).
- Installer signing/notarization automation (requires maintainer credentials; documented).
- Performance: incremental search indexing via Worker indexing (avoid re-scanning on query change).

## Later (0.3.x) — Optional, gated

- **Local OCR** with separately downloaded language packs (e.g., Tesseract WASM), SHA-256 verified, not loaded during ordinary reading. Adds `ocr/` lazy chunk.
- Document comparison (side-by-side diff of text layers).
- Advanced batch operations (bulk rotate/extract) with queue and cancellation.
- Redaction (only when underlying content removal can be verified — not black rectangles).

Not planned:

- AI assistants, collaboration, cloud sync, telemetry, advertising, accounts, plugin system.

## Release Cadence

- 0.1.x: patch for security + correctness.
- 0.2.x: quarterly minor after quality gates pass on all platforms.
- Optional features ship only after core quality gates are green.

## How to Propose

Open an issue with use-case, platform, and whether you can test on all claimed OSes. We prioritize small, maintainable changes.
