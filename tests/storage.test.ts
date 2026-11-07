import { describe, it, expect, beforeEach } from 'vitest';
import { defaultSettings, loadSettings, saveSettings, loadRecents, saveRecents, clearHistory } from '../src/lib/storage';

// jsdom localStorage
beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('loads defaults when empty', () => {
    expect(loadSettings().theme).toBe('system');
    expect(loadSettings().rememberHistory).toBe(true);
  });
  it('persists settings', () => {
    const s = { ...defaultSettings, theme: 'dark' as const };
    saveSettings(s);
    expect(loadSettings().theme).toBe('dark');
  });
  it('persists recents and caps at 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `file${i}.pdf`, lastOpened: new Date().toISOString(), page: 1 }));
    saveRecents(many);
    expect(loadRecents().length).toBe(20);
  });
  it('clears history', () => {
    saveSettings(defaultSettings);
    saveRecents([{ name: 'a.pdf', lastOpened: new Date().toISOString(), page: 1 }]);
    clearHistory();
    expect(localStorage.getItem('velocepdf:recents:v1')).toBeNull();
  });
});
