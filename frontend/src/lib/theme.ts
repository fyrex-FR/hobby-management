import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'cv-theme';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return media.matches ? 'dark' : 'light';
  return pref;
}

/** Applique le thème sur <html> (le premier rendu est fait par le script inline d'index.html). */
function apply(pref: ThemePreference) {
  const theme = resolve(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#09090B' : '#FAFAFA');
}

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useTheme = create<ThemeStore>((set) => ({
  preference: readPreference(),
  setPreference: (preference) => {
    try {
      if (preference === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      // stockage indisponible (navigation privée) : le thème vaut pour la session
    }
    apply(preference);
    set({ preference });
  },
}));

// Suit le thème du système tant que la préférence est « Système ».
media.addEventListener('change', () => {
  if (useTheme.getState().preference === 'system') apply('system');
});
