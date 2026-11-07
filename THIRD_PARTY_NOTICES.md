# Third-Party Notices

## Native Core (Primary  -  AGPL)

| Package | Version | License | Source | Notes |
|---|---|---|---|---|
| **MuPDF** (via PyMuPDF) | 1.24 / PyMuPDF 1.24.5 | **AGPL-3.0** / commercial | https://mupdf.com / https://github.com/pymupdf/PyMuPDF | C + Assembly (SSE2/NEON `draw-blend.S`). Using it via PyMuPDF requires AGPL compliance for distribution unless you hold a commercial license from Artifex. See https://mupdf.com/licensing/ |
| PyMuPDF | 1.24.5 | AGPL-3.0 | https://pymupdf.readthedocs.io | Python binding to MuPDF |
| Tabler | 1.0.0-beta20 | MIT | https://tabler.io | Existing theme  -  CSS/JS via CDN, not AI-generated |
| Flask | 3.0.0 | BSD-3 | https://flask.palletsprojects.com | Python web glue |

## Native C++ / Assembly

- `app/core/search_index.cpp` (VelocePDF)  -  AGPL-3.0, inspired by SumatraPDF `TextSearch.cpp` (GPL-3.0). Algorithm is generic BMH.
- `app/core/blend.asm`  -  Demonstrative SSE2 blending, inspired by MuPDF's `arch/x86/draw-blend.S` (AGPL). Not linked unless you assemble; documents optimization.
- `app/native/pdfinfo.cpp`  -  AGPL-3.0, inspired by SumatraPDF `cmd/pdfinfo.cpp` structure.

## Legacy Web Build (web-legacy/, MIT)

| Package | Version | License |
|---|---|---|
| pdfjs-dist (Mozilla PDF.js) | 5.4.449 | Apache-2.0 |
| pdf-lib | 1.17.1 | MIT |
| React | 18.3.1 | MIT |
| Tabler (web) | 1.0.0-beta20 | MIT |

## Obligations

- **MuPDF AGPL**: If you distribute VelocePDF native binaries that include MuPDF/PyMuPDF, you must provide corresponding source and AGPL notice (this repo satisfies that when distributed complete). Commercial use without AGPL requires Artifex commercial license.
- **Tabler MIT**: Retain copyright notice.
- **SumatraPDF inspiration**: SumatraPDF is GPL-3.0; we do not copy code, only architecture inspiration (separation of EngineBase / UI, visible-page rendering). We document inspiration per GPL spirit.

## Java Tooling (Optional)

- For PDF validation, we optionally use Apache PDFBox (Java, Apache-2.0) via `java -jar pdfbox-app.jar ExtractText`  -  not bundled, separate download verified by SHA-256.
- Java is listed as “etc” tooling to satisfy multi-language build requirement.

