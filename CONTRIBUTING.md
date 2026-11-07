# Contributing — VelocePDF Native

## Prerequisites

- Python 3.11+, `pip install -r app/requirements.txt` (PyMuPDF, Flask)
- Optional: `g++` 12+, `python3-dev`, `pybind11` for C++ `veloce_search` extension
- Optional: `nasm` for `blend.asm`, `Java` for PDFBox tooling
- For legacy web: Node 20+, `npm install` in `web-legacy/`

## Setup

```bash
git clone https://github.com/TheronRadley/velocepdf.git
cd velocepdf
python3 -m venv venv && source venv/bin/activate
pip install -r app/requirements.txt
python app/main.py  # http://localhost:5173 — Tabler + Sumatra layout
make -C app/native && ./app/native/veloce-pdfinfo tests/fixtures/minimal.pdf
# Optional C++ search:
pip install pybind11 && python app/setup_search.py build_ext --inplace
```

## Structure (Sumatra-inspired)

- `app/main.py` — Flask + `fitz` (MuPDF C/ASM), like `MainWindow.cpp` + `EngineMupdf.cpp`
- `app/core/pdf_engine.{h,cpp}` — `EngineBase` wrapper (stub, real in `fitz`)
- `app/core/search_index.cpp` — C++ BMH (like `TextSearch.cpp`)
- `app/core/blend.asm` — SSE2 blending (like `arch/x86/draw-blend.S`)
- `app/native/pdfinfo.cpp` — C++ CLI (like `cmd/pdfinfo.cpp`)
- `app/ui/templates/index.html` — Tabler (existing theme) + Sumatra's tabs/Frequently Read/Command Palette
- `web-legacy/` — original React+PDF.js (MIT, archived)
- `tests/` — `pytest` with MuPDF rendering regression, search, annotation round-trip, bomb, traversal

## Guidelines

- Treat every PDF untrusted — no JS, no launch, no auto-fetch.
- Keep engine off UI thread — `get_pixmap` in Flask thread, cancellable search.
- Use existing Tabler — do not generate custom CSS from scratch (bloated, AI slop).
- Provide assembly where perf matters, but document fallback.

## PRs

1. Issue first for large changes.
2. `pytest`, `python app/main.py` manual smoke, `make -C app/native` clean.
3. CI runs on ubuntu/windows/macos (Python + C++ + Java where needed).

## License

By contributing you agree AGPL-3.0 (native) / MIT (web-legacy).
