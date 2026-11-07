import type { AppSettings, RecentEntry } from './types';

const SETTINGS_KEY = 'velocepdf:settings:v1';
const RECENTS_KEY = 'velocepdf:recents:v1';
const SESSION_KEY = 'velocepdf:session:v1';

export const defaultSettings: AppSettings = {
  theme: 'system',
  sidebarCollapsed: false,
  sidebarTab: 'thumbnails',
  defaultZoomMode: 'fit-width',
  defaultViewMode: 'continuous',
  showThumbnails: true,
  rememberHistory: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecents(list: RecentEntry[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function clearHistory() {
  localStorage.removeItem(RECENTS_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function saveSession(tabsMeta: { id: string; name: string; page: number }[]) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(tabsMeta));
}

export function loadSession(): { id: string; name: string; page: number }[] | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
