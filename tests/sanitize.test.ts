import { describe, it, expect } from 'vitest';
import { sanitizeFilename, isAllowedUrl, formatFileSize, clamp } from '../src/lib/sanitize';

describe('sanitizeFilename', () => {
  it('strips path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/absolute/path/file.pdf')).toBe('file.pdf');
    expect(sanitizeFilename('a/b\\c/d.pdf')).toBe('d.pdf');
  });
  it('handles control chars and dots', () => {
    expect(sanitizeFilename('...hidden')).toBe('hidden');
    expect(sanitizeFilename('\x00bad\x1Fname')).toBe('_bad_name');
    expect(sanitizeFilename('')).toBe('attachment');
    expect(sanitizeFilename('.')).toBe('attachment');
  });
  it('limits length and preserves extension', () => {
    const long = 'a'.repeat(300) + '.pdf';
    const out = sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('.pdf')).toBe(true);
  });
  it('blocks Windows reserved names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('CON.txt')).toBe('_CON.txt');
    expect(sanitizeFilename('aux.pdf')).toBe('_aux.pdf');
  });
});

describe('isAllowedUrl', () => {
  it('allows http/https/mailto', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('http://example.com/path?q=1')).toBe(true);
    expect(isAllowedUrl('mailto:test@example.com')).toBe(true);
  });
  it('blocks javascript, file, data', () => {
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedUrl('data:text/html,hi')).toBe(false);
    expect(isAllowedUrl('ftp://example.com')).toBe(false);
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('clamp', () => {
  it('clamps numbers', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(20, 0, 10)).toBe(10);
  });
});
