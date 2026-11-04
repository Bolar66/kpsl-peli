// Teema: 'system' seuraa puhelimen asetusta, 'dark' ja 'light' pakottavat valinnan.
// index.html asettaa teeman jo ennen Reactin latautumista, ettei sivu välähdä väärän värisenä.
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'bowl-theme';
const THEME_COLORS = { dark: '#0B0B0C', light: '#F4F4F0' };
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: light)');

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch { /* yksityinen selaus */ }
  return 'system';
}

let preference = readPreference();

function apply() {
  const theme = preference === 'system' ? (media.matches ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

media.addEventListener('change', () => {
  if (preference === 'system') apply();
});

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* yksityinen selaus */ }
  apply();
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useThemePreference() {
  return useSyncExternalStore(subscribe, () => preference);
}

apply();
