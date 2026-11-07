import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
async function genMinimal() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello VelocePDF — minimal fixture', { x: 50, y: 700, size: 18, font, color: rgb(0,0,0) });
  page.drawText('This is a lawful test file for rendering, search, and annotation tests.', { x: 50, y: 660, size: 12, font });
  page.drawText('Search term: velocepdf-test-unique-12345', { x: 50, y: 620, size: 12, font });
  const bytes = await doc.save();
  fs.writeFileSync('tests/fixtures/minimal.pdf', bytes);
  console.log('wrote minimal.pdf', bytes.length);
}
async function genTwoPage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i=1;i<=2;i++) {
    const p = doc.addPage([600, 800]);
    p.drawText(`Page ${i} — VelocePDF`, { x: 50, y: 700, size: 18, font });
    p.drawText(`Content page ${i} for pagination tests.`, { x: 50, y: 660, size: 12, font });
  }
  const bytes = await doc.save();
  fs.writeFileSync('tests/fixtures/two-page.pdf', bytes);
  console.log('wrote two-page.pdf', bytes.length);
}
await genMinimal();
await genTwoPage();
