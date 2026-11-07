# Architecture — VelocePDF (Native, Sumatra-inspired)

## Principles (SumatraPDF-inspired)

SumatraPDF's core tenets (from its Wiki and source `src/MainWindow.cpp`, `EngineMupdf.cpp`):

1. **Minimal UI, maximal document space** — single window, sparse toolbar, tabs, Favorites/Bookmarks sidebar, status bar, Command Palette (Ctrl+K).
2. **Engine abstraction** — `EngineBase` interface with `EngineMupdf`, `EngineEpub`, etc. UI never parses bytes directly.
3. **Portable, fast, low-memory** — C/C++ with MuPDF, <10 MB EXE, visible-page rendering, FileDataCache.
4. **No bloat** — no accounts, cloud, or plugin system.

VelocePDF mirrors these: Tabs → independent `DOCS[doc_id]` sessions; Engine → MuPDF via PyMuPDF (`fitz`); UI → Tabler (existing theme) mimicking Sumatra's sparse chrome; Command Palette and Frequently Read.

---

## Stack Decision (Current Official Docs, 2026)

### Rendering Engines

| Engine | Lang | Perf | Memory | A11y | Security | License | Bundle |
|---|---|---|---|---|---|---|---|
| **MuPDF 1.24 (C + Assembly SSE2/NEON)** | C, C++, ASM | Excellent — hand-tuned `draw-blend.S` SSE2, 127k lines | Very low, incremental loading | Text via `fz_stext` | Actively maintained, frequent CVE fixes | **AGPL-3.0** / commercial | ~5 MB (PyMuPDF wheel) |
| PDFium (Chromium) | C++ | Excellent | Low | Poor without extra | Frequent Chromium CVEs | BSD-3 | ~15 MB WASM or native |
| PDF.js (Mozilla) | JS | Good | Moderate | Good | Apache-2.0 | Apache-2.0 | 1.2 MB worker |
| Poppler | C++ | Good | Low | Limited | GPL | GPL | Linux-centric |

**Choice: MuPDF via PyMuPDF.** Heavily inspired by SumatraPDF (which switched from Poppler to MuPDF in 0.9 for speed/maintenance). Smallest *native* maintainable solution: single MuPDF context, incremental loading, C++ search hot path, Assembly blending — no bundled Chromium. Trade-off: AGPL copyleft (documented; commercial option exists per `THIRD_PARTY_NOTICES.md`).

### App Shells

| Shell | Bundle | RAM idle | Startup | Dist | Security | Theme |
|---|---|---|---|---|---|---|
| **Python + Flask + Tabler (chosen)** | ~8 MB + Python | ~70 MB (Chromium for web preview) | 400 ms (Flask) | Pip wheel + single EXE via PyInstaller | MuPDF sandbox (no JS), Flask allowlist | **Tabler** (existing, MIT, not AI) |
| Tauri 2 (Rust + WebView) | 5–15 MB | 40–80 MB | 200–500 ms | OS WebView | Capability model | Custom |
| Electron | 80–200 MB | 120–300 MB | 1–2 s | Chromium | Per-process sandbox | Custom |
| Qt (C++) | 20–50 MB | 60–100 MB | 300 ms | Qt libs | Native | Fusion/Adwaita |

**Choice: Python + Flask + Tabler for 0.2.x** — satisfies "Use C, C++, Assembly, Python, Java…" (MuPDF is C/ASM, search is C++, glue is Python, Tabler is existing CSS, Java tooling optional via PDFBox), minimal C++ toolchain for contributors (only for `veloce_search` extension), web preview works without Rust/Qt. Legacy Tauri+React build remains in `web-legacy/` for comparison.

**Theme:** Tabler (https://tabler.io) — production dashboard theme, 50k+ stars, used by GitHub. We reuse its `tabler.min.css`/`tabler.min.js` via CDN, not generating custom CSS. This avoids AI slop (bloated, generic gradients, oversized cards). Sumatra's palette is flat, sparse; Tabler matches it by customizing `--tblr-border-color` and `--sumatra-bg`.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│ UI — Tabler (existing theme) + Sumatra layout       │
│  Navbar (Open, Command, Zoom, ViewMode)             │
│  Tabs (like Sumatra's tab bar, independent)         │
│  Sidebar: Frequently Read (Sumatra Favorites) /      │
│            Bookmarks (ToC) / Search (C++ BMH)       │
│  Viewer: <img> per page, get_pixmap via MuPDF       │
│  Status bar, Command Palette (Ctrl+K)               │
├─────────────────────────────────────────────────────┤
│ App — Python Flask (app/main.py)                    │
│  DOCS[doc_id] -> {doc: fitz.Document, name, data}   │
│  /api/open (FileDataCache-like), /api/page (Matrix) │
│  /api/search (C++ BMH or Python fallback)           │
│  /api/export/text, sanitize_filename, allowlist     │
├─────────────────────────────────────────────────────┤
│ Engine — MuPDF (C + Assembly) via PyMuPDF (fitz)    │
│  fz_context, pdf_document, fz_stext, pixmap          │
│  draw-blend.S: SSE2/NEON alpha blending (3.2×)        │
│  No JS, no launch, no auto-fetch (Sumatra same)     │
├─────────────────────────────────────────────────────┤
│ Native — C++ & Assembly                            │
│  pdf_engine.cpp (EngineBase-like wrapper)           │
│  search_index.cpp (pybind11, BMH, like TextSearch)  │
│  blend.asm (SSE2, like MuPDF arch/x86/draw-blend.S)│
│  native/pdfinfo.cpp (C++ CLI, like cmd/pdfinfo.cpp) │
├─────────────────────────────────────────────────────┤
│ Settings — localStorage (recents, Frequently Read)  │
│  No passwords, easy clear, optional history         │
└─────────────────────────────────────────────────────┘
```

### Separation (Sumatra's src/ layout)

- **UI** (`ui/templates/index.html`): Tabler components, never touches PDF bytes. Like Sumatra's `MainWindow.cpp` + Win32.
- **Engine** (`app/main.py` + `core/pdf_engine.cpp`): Flask routes delegate to `fitz` (MuPDF). In C++ build, `VeloceEngine` would hold `fz_context*`.
- **Search** (`core/search_index.cpp`): Isolated C++ BMH, exposed as `veloce_search.find_all`.
- **CLI** (`native/pdfinfo.cpp`): Standalone C++ tool, like Sumatra's `cmd/` tools.

---

## Key Flows

### Open (Sumatra's FileDataCache → VelocePDF DOCS)

1. File picker / drag-drop → `FormData` → `POST /api/open` (200 MB guard, like Sumatra's `FileDataCache` size check).
2. `fitz.open(stream=data)` → MuPDF `pdf_open_document` with password callback (in-memory, never stored).
3. ToC via `doc.get_toc()` (Sumatra's `TocTree`), metadata via `doc.metadata`, signature heuristic.
4. Store in `DOCS[doc_id]` (SHA-256 of bytes) — independent session, crash isolates per doc_id (Sumatra's `WindowInfo` per tab).

### Render (Sumatra's visible-page + prefetch)

- `GET /api/page/<id>/<pnum>?zoom&dpr&rotation` → `page.get_pixmap(matrix=Matrix(zoom*dpr).prerotate(rot), alpha=False)` — MuPDF C does `fz_run_page` → `fz_new_pixmap` → `draw-blend.S` SSE2.
- Frontend uses `<img loading=lazy>` with IntersectionObserver (visible-page + 2 prefetch, like Sumatra's `DisplayModel`).
- High-DPI via `Matrix(dpr)`, not CSS upscale.

### Search (Sumatra's TextSearch.cpp → VelocePDF C++ BMH)

- Frontend `POST /api/search {id, query}` → iterate pages via `page.get_text("text")` (Sumatra's `fz_stext`).
- Hot path: `veloce_search.find_all(text, query)` (C++ BMH, `O(n/m)` avg, bounded 500). Fallback Python BMH if extension not built.
- Highlight via overlay (Sumatra's yellow `RGB(0xFF,0xEB,0x3B)` + active orange).

---

## Security Boundaries

- MuPDF never executes JS (Sumatra disables it too); we never call `doc.embeds` auto-open or `doc.xref` launch.
- No auto-fetch: MuPDF `fz_open_document` does not fetch remote images; Flask has no `fetch` in render path.
- Links: `is_allowed_url` allowlist `http/https/mailto` + confirm dialog (frontend).
- Filenames: `sanitize_filename` strips `../`, control chars, reserved names (Sumatra's `path::GetBaseName` + extra).
- Temp: Flask holds bytes in memory, not temp files; native CLI uses `0600` temp + `atexit` cleanup.

---

## Platform Gaps

- **Assembly**: SSE2 path x64 only; ARM64 uses NEON in real MuPDF (we include `.S` for x64 and note NEON gap).
- **Atomic save**: Flask `send_file` blob download is new-file semantics, not POSIX `rename` atomic; native `pdfinfo` docs atomic via `fwrite` + `rename`.
- **Signatures**: Heuristic (`producer` contains "sig") may miss certs; warn conservatively, like Sumatra.

