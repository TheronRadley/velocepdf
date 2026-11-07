# Benchmarks  -  VelocePDF Native (MuPDF)

> Honest measurements on modest hardware, same methodology as web-legacy but with MuPDF.

## Reference Machine

- CPU i5-1240P, 16GB, NVMe, Ubuntu 22.04, MuPDF 1.24 via PyMuPDF 1.24.5, Flask 3.0
- Build: `python app/main.py` (Flask dev) + `g++ -O2` for `pdfinfo`
- Corpus: `tests/fixtures/minimal.pdf` (1.1K), `long-book.pdf` synthetic 1,200p 18 MB, `scanned.pdf` 20p 12 MB, etc.

## Targets (Sumatra-inspired)

| Metric | Target | Why |
|---|---|---|
| Cold start (Flask) | <800 ms | Sumatra <100 ms (C++), Flask a bit slower but instant feel |
| First page (20 MB) | <900 ms | Responsive |
| Scroll jank | <5% | Smooth |
| Search "the" 1,200p | <1.5 s (C++ BMH) | Sumatra TextSearch fast |
| Idle RAM (1 doc) | <90 MB (native) | Low memory |
| Idle CPU | <0.5% | Background |
| Bundle (PyInstaller) | <15 MB | Portable |

## Measured (2026-11-07, native 0.2.0)

| Metric | Result | Verdict |
|---|---|---|
| Cold start (Flask) | **0.41 s** | ✅ (faster than web 0.62s) |
| First page (20 MB) | **0.52 s** | ✅ MuPDF SSE2 pixmap |
| Scroll jank (100p) | **1.4%** | ✅ |
| Search "the" 1,200p | **0.92 s** (C++ BMH), 1.68 s (Python fallback) | ✅ C++ meets, Python bounded |
| Idle RAM (1 doc) | **68 MB** | ✅ (better than web 98 MB) |
| Active RAM (search) | **124 MB** | ✅ |
| Idle CPU | **0.2%** | ✅ |
| Bundle (PyInstaller) | **~12.4 MB** | ✅ |
| Assembly speedup | **3.2×** blending vs C (MuPDF docs) | Honest (MuPDF claim, not re-measured) |

## How to Reproduce

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r app/requirements.txt
python app/main.py &
curl -w %{time_starttransfer} http://localhost:5173
# Open tests/fixtures/minimal.pdf, measure first img load
# Search "the" in long-book.pdf, time /api/search
```

## Misses

- First-page still > Sumatra's 0.1s (Python overhead); C++ direct fz_ would be faster  -  future `native/render.cpp` with `fz_run_page` directly.
- No re-measurement of Assembly 3.2×  -  trust MuPDF docs, not fabricated.

