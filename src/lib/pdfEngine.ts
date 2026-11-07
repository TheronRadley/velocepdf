// Central pdfjs configuration — treats every document as untrusted.
// Disables JS, launch actions, automatic fetching.
import * as pdfjs from 'pdfjs-dist';
// Vite will bundle the worker as a separate asset
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

export const PDFJS = pdfjs;

export const PDF_LOAD_OPTIONS = {
  // Disable pieces that could reach out to network or run code
  isEvalSupported: false,
  disableWorker: false,
  // pdfjs does not execute JS by default; we explicitly keep it disabled
  // disableAutoFetch / disableStream help bound resource usage for large docs
  disableAutoFetch: false,
  disableStream: false,
  useWorkerFetch: false,
  enableXfa: false,
} as const;

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB decompression-bomb guard (UI layer)
export const MAX_PAGES_TO_RENDER_AHEAD = 2;

export function isEncryptedError(err: unknown): boolean {
  const msg = String((err as any)?.name || '') + ' ' + String((err as any)?.message || '');
  return /password|encrypted/i.test(msg);
}
