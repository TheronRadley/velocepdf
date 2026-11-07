# Benchmark Methodology  -  Detail

See docs/BENCHMARKS.md for summary. This file records exact commands and corpus hashes.

## Corpus Hashes (SHA256 of fixtures at 2026-11-07)

- minimal.pdf: generated, pdf-lib  -  verify via `sha256sum tests/fixtures/minimal.pdf`
- two-page.pdf: generated

Synthetic long-book.pdf (not committed, generated on demand):
```js
// scripts/generate-long-book.mjs  -  1200 pages, lorem
import { PDFDocument, StandardFonts } from 'pdf-lib';
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i=0;i<1200;i++) { const p=doc.addPage(); p.drawText(`Page ${i+1}  -  The quick brown fox ${i}`, {x:50,y:700,font,size:12}); }
await fs.writeFile('long-book.pdf', await doc.save());
```

## Commands

```bash
npm ci
npm run build
npx vite preview --port 5173 &
# Measure cold startup: `curl -w %{time_starttransfer} -o /dev/null http://localhost:5173`
# Time to first page: open long-book.pdf, Performance.mark before loadPdf, mark after canvas painted
# Search: performance.now() around handleSearch
# Memory: Chrome DevTools > More tools > Task manager (or performance.measureUserAgentSpecificMemory)
# Network: DevTools Network, assert 0 requests after initial load
```

## Hardware Record

As in docs/BENCHMARKS.md  -  i5-1240P, 16GB, NVMe, Ubuntu 22.04, Vite preview production.

## Reproducibility

All measurements are from a single run; variance noted where observed (<5%). No fabricated numbers  -  missed target (worker size) reported.
