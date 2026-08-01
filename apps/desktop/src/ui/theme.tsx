import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const themeStorageKey = 'investment-os-theme';
const themePreferences: ThemePreference[] = ['system', 'light', 'dark'];

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const requestedTheme = new URLSearchParams(window.location.search).get('theme');
  if (isThemePreference(requestedTheme)) return requestedTheme;
  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return isThemePreference(storedTheme) ? storedTheme : 'system';
  } catch {
    return 'system';
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference: ThemePreference, resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = preference;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);
  const resolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener?.('change', updateSystemTheme);
    return () => mediaQuery.removeEventListener?.('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    applyTheme(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      window.localStorage.setItem(themeStorageKey, nextPreference);
    } catch {
      // Private browsing or disabled storage should not prevent theme changes.
    }
  }, []);

  const cyclePreference = useCallback(() => {
    const currentIndex = themePreferences.indexOf(preference);
    const nextPreference =
      themePreferences[(currentIndex + 1) % themePreferences.length] ?? 'system';
    setPreference(nextPreference);
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference, cyclePreference }),
    [cyclePreference, preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
