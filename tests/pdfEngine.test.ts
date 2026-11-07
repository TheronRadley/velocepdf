import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  // Stub DOMMatrix for Node environment (pdfjs canvas dependency)
  if (!(globalThis as any).DOMMatrix) {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      constructor() {}
    };
    (globalThis as any).DOMMatrixReadOnly = class {};
  }
});

describe('pdfEngine config', () => {
  it('disables eval and has safety flags', async () => {
    const { PDF_LOAD_OPTIONS } = await import('../src/lib/pdfEngine');
    expect(PDF_LOAD_OPTIONS.isEvalSupported).toBe(false);
    expect((PDF_LOAD_OPTIONS as any).enableXfa).toBe(false);
  });
  it('has sane file size limit', async () => {
    const { MAX_FILE_SIZE } = await import('../src/lib/pdfEngine');
    expect(MAX_FILE_SIZE).toBe(200 * 1024 * 1024);
  });
});
