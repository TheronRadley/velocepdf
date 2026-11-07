/**
 * Security helpers for untrusted PDF data.
 * - Sanitize attachment filenames to prevent path traversal.
 * - Restrict URI schemes for external links.
 */

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  // Remove path separators, null bytes, control chars
  let s = name.replace(/\\/g, '/');
  // Prevent path traversal
  s = s.split('/').pop() || 'attachment';
  // Remove leading dots and control
  s = s.replace(/^[\.\s]+/, '');
  s = s.replace(/[\x00-\x1F\x7F]/g, '_');
  // Limit length
  if (s.length > 200) {
    const ext = s.includes('.') ? '.' + s.split('.').pop() : '';
    s = s.slice(0, 200 - ext.length) + ext;
  }
  // Fallback
  if (!s || s === '.' || s === '..') return 'attachment';
  // Windows reserved names
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reserved.test(s)) s = '_' + s;
  return s;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
