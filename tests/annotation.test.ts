import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

describe('annotation round-trip via pdf-lib', () => {
  it('creates a highlight annotation that survives save/load', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Annotation test', { x: 50, y: 700, font, size: 12 });
    // embed a highlight via low-level (simulates App save)
    const { width, height } = page.getSize();
    const x = 50, y = 600, w = 200, h = 15;
    const { PDFName, PDFString, PDFArray, PDFNumber } = await import('pdf-lib');
    const colorArr = PDFArray.withContext(doc.context);
    colorArr.push(PDFNumber.of(1)); colorArr.push(PDFNumber.of(0.92)); colorArr.push(PDFNumber.of(0.23));
    // Use any to avoid typing issues
    const annot = (doc.context as any).obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Highlight'),
      Rect: (doc.context as any).obj([PDFNumber.of(x), PDFNumber.of(y), PDFNumber.of(x+w), PDFNumber.of(y+h)]),
      QuadPoints: (doc.context as any).obj([PDFNumber.of(x), PDFNumber.of(y+h), PDFNumber.of(x+w), PDFNumber.of(y+h), PDFNumber.of(x), PDFNumber.of(y), PDFNumber.of(x+w), PDFNumber.of(y)]),
      C: colorArr,
      Contents: PDFString.of('test highlight'),
      F: PDFNumber.of(4),
    });
    const annots = page.node.get(PDFName.of('Annots'));
    if (annots instanceof PDFArray) annots.push(annot);
    else page.node.set(PDFName.of('Annots'), (doc.context as any).obj([annot]));
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    // Verify annots exist at low level
    const p2 = reloaded.getPage(0);
    const a2 = p2.node.get(PDFName.of('Annots'));
    expect(a2).toBeDefined();
  });
});
