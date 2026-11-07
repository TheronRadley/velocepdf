# Architecture — VelocePDF

## Product Principles

1. **Document correctness and protection of user data.**
2. **Responsive reading and reliable operation.**
3. **Accessibility and native desktop integration.**
4. **Useful features.**
5. **Visual polish.**

No “100% secure” or “fastest” claims without evidence. See [BENCHMARKS.md](BENCHMARKS.md) for measured results and misses.

## Stack Decision

We evaluated three credible rendering engines and two app shells against current official docs (2026).

### Rendering Engines

| Engine | Fidelity | Large-doc perf | Memory / startup | A11y | Security maintenance | License | Bundle impact |
|---|---|---|---|---|---|---|---|
| **PDF.js (Mozilla)** | Good — matches Adobe for most features; minor gaps in exotic blend modes | Good with visible-page + prefetch; incremental loading | Moderate; worker-isolated | Good (text layer, ARIA) | Actively maintained; Apache-2.0; no native CVEs from C code | Apache-2.0 (permissive) | ~1.2 MB worker |
| **PDFium (Chromium)** | Excellent (reference) | Excellent | Low (native) but large WASM or native addon | Poor out-of-box; need custom a11y | Frequent Chromium security fixes; large native surface | BSD-3 (ok) | ~8–15 MB WASM or native build complexity |
| **MuPDF** | Very good | Good | Very low | Limited | AGPL/commercial dual; strong but requires tracking AGPL obligations | AGPL-3 / commercial (copyleft risk) | Native addon, complex CI |
| Poppler | Good on Linux | Good | Low | Limited | CVE history tied to C++ parsing; redistribution burden | GPL-2/3 | Native, Linux-centric |

**Choice: PDF.js.** Smallest maintainable solution for a small open-source team: pure JS/TS, no native toolchain for contributors, permissive license, active maintenance, and sufficient fidelity for reading/search/annotations/forms. Where fidelity gaps exist (rare), we surface a clear error rather than misrender.

### App Shells

| Shell | Bundle | Idle RAM | Startup | Distribution | Security model | Maintenance |
|---|---|---|---|---|---|---|
| **Tauri 2 (Rust + OS WebView)** | 5–15 MB | 40–80 MB | 200–500 ms | OS WebView reuse; small | Capability-based, Rust isolation, OS sandbox | Need Rust for desktop builds; web preview works without Rust |
| Electron (bundled Chromium) | 80–200 MB | 120–300 MB | 1000–2000 ms | Self-contained Chromium | Chromium sandbox per process | JS-only; larger surface, auto-update mature |

**Choice: Tauri 2 + Vite + React (web fallback).** Meets responsive, distribution size, and sandboxing priorities. Web preview ensures contributors can run without Rust; CI verifies desktop builds on all three OSes. We document that desktop UI code does not auto-create a good mobile app — mobile is out of scope for 0.1.x.

License compatibility: MIT (VelocePDF) is compatible with Apache-2.0 (PDF.js), MIT/BSD (others). See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## High-Level Architecture

```
┌─────────────────────────────────────────────┐
│ App Shell (Tauri + WebView)                 │
│  - Toolbar, Sidebar, Tabs, Statusbar (React)│
│  - Settings (localStorage, optional history)│
│  - Theme (light/dark/system, high-DPI)     │
├─────────────────────────────────────────────┤
│ Document Operations (main thread, typed)     │
│  - Tab state (independent sessions)         │
│  - File open (picker, drag-drop, CLI args) │
│  - Search coordinator (cancellable)         │
│  - Annotation/form coordinator              │
│  - Save (atomic via Tauri fs or blob DL)   │
├─────────────────────────────────────────────┤
│ Rendering Workers (isolated)                │
│  - PDF.js Worker (pdf.worker.min.mjs)       │
│  - Bounded IPC (getPage, render, text)    │
│  - No fs / net; CSP blocks fetches         │
├─────────────────────────────────────────────┤
│ Persistent Settings                         │
│  - localStorage: settings, recents (20 max) │
│  - Session restore (tabs meta, page)        │
│  - Easy clear; no passwords persisted       │
└─────────────────────────────────────────────┘
```

### Separation of Concerns

- **App shell**: UI chrome, theming, accessibility, window management. Never parses PDF bytes directly.
- **Document operations**: Typed `TabState` per document; independent `pdfDoc` proxies; crash of one tab does not affect others (Worker error caught, tab shows error panel).
- **Rendering workers**: PDF.js Worker thread; restricted via `GlobalWorkerOptions` and load options (`isEvalSupported: false`, `enableXfa: false`, `disableAutoFetch` configurable). IPC is page-number + viewport only.
- **Persistent settings**: Isolated in `src/lib/storage.ts`; uses `localStorage` in web; Tauri store plugin can replace without UI changes.

## Key Flows

### Open File

1. **File picker** (`<input type=file>`) + **drag-drop** (window drop) + **CLI** (`?file=` param forwarded to Tauri `getMatches` in desktop). All paths converge to `handleFiles(File[])`.
2. Size check against `MAX_FILE_SIZE` (200 MB) — decompression bomb guard; user warned.
3. `ArrayBuffer` + `File` retained in tab; `getDocument({ data: Uint8Array, password, ...PDF_LOAD_OPTIONS })` in Worker.
4. On success: fetch outline (`getOutline` → `getDestination`/`getPageIndex`), metadata (`getMetadata`), init tab state. On `PasswordException`, show modal; `onPassword` callback stored, never persisted.
5. Render: **visible-page rendering with bounded prefetch (2 pages ahead)** via `IntersectionObserver` (continuous) or direct `pageNumber` (single/two-page). Incremental loading where engine supports (streaming via `disableStream: false`).

### Rendering

- **DPR-aware**: canvas size = viewport × `devicePixelRatio`; CSS size = viewport; transform scaled for high-DPI.
- **Cancellable**: `renderTask.cancel()` on dependency change/unmount.
- **Bounded cache**: No global page cache beyond React state; each `PdfPage` manages its own canvas; offscreen pages unmount in single/two-page.
- **Off UI thread**: All `getPage` / `render` / `getTextContent` run in Worker; UI thread only composites canvas + text-layer spans.

### Search

- Sequential `getPage` → `getTextContent` scan; early abort via `AbortController` stored in `window.__veloceSearchAbort`.
- Bounded to 500 matches; 200 shown initially; highlight via text-layer span background (active orange, inactive yellow).
- Result count, navigation (next/prev), cancellation (Esc or Clear), incremental UI update.

### Annotations

- Overlay `annot-layer` (absolute, `mix-blend-mode: multiply`) per page; create via drag on background (not on text spans, to preserve selection).
- In-memory `Annotation[]` per tab; undo/redo stacks (shallow copies of arrays) — bounded by browser memory; safe for modest annotation counts.
- Save: `pdf-lib` loads original bytes, embeds each `highlight` as low-level `Highlight` annot (Rect, QuadPoints, C, Contents) via `PDFDocument.context.obj` — produces standard PDF annotations readable in Acrobat/Preview/Foxit. Other kinds (underline/strikeout/note/ink) are overlay-only in 0.1.x; form filling via pdf-lib where AcroForm supported.
- Save As uses blob download (atomic in browser: write-temp then rename semantics via File System Access API when available; Tauri uses `fs.writeFile` temp + rename). Original preserved unless user explicitly overwrites.

### Page Operations

- Extract/reorder/rotate/delete via `pdf-lib` (copyPages, setRotation, removePage); operations are functional (new bytes, not mutation of original until save).

## Security Boundaries (Implemented)

- PDF.js configured with `isEvalSupported: false`, `enableXfa: false`; no `eval`, no JS execution.
- No `launch` actions: we never call `pdfDoc.getJavaScript()` or handle `OpenAction` launch; outline `url` passed only after `isAllowedUrl` check.
- Network: CSP `default-src 'self'` (Tauri) + no `fetch` in worker path; links require confirmation; attachments never auto-opened.
- Filesystem: Worker has no fs; main thread only reads user-selected Files; Tauri fs scope limited to selected file + temp dir.

## Platform Gaps Documented

- **Sandbox strength**: On Linux WebKitGTK, Worker sandbox is V8/WebKit process isolation, not OS user-ns; stricter sandbox available via Flatpak portal (not enforced in 0.1.x, planned).
- **Atomic replace**: POSIX `rename` atomicity guaranteed on same filesystem; browser download fallback is “create new file”, not true atomic overwrite — documented as safe-write behavior.
- **Signing**: Detection heuristic (producer string + `getMetadata` sig hint) may miss some signatures; we warn conservatively.

## Performance Targets

See [BENCHMARKS.md](BENCHMARKS.md) for reproducible methodology and measured results on reference machine.

## Versioning and Support

- Windows 10 22H2+ / Windows 11 22H2+, x64 and arm64
- macOS 13+ (Ventura) Intel and Apple Silicon, notarization required for distribution (document signing steps; CI produces unsigned artifacts until maintainers configure credentials)
- Linux: Ubuntu 22.04+ / Fedora 38+, x64 and aarch64 (AppImage + .deb)

CI verifies builds on all three OSes; install tests run on each.
