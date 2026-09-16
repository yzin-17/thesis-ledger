import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTheme } from './theme.js';

export type MarketColorScheme = 'red-up' | 'green-up';
export type MarketTone = 'up' | 'down';

export const marketColorStorageKey = 'thesis-ledger-market-color-scheme';
const defaultMarketColorScheme: MarketColorScheme = 'red-up';

export const isMarketColorScheme = (value: string | null): value is MarketColorScheme =>
  value === 'red-up' || value === 'green-up';

export function normalizeMarketColorScheme(value: string | null | undefined): MarketColorScheme {
  const candidate = value ?? null;
  return isMarketColorScheme(candidate) ? candidate : defaultMarketColorScheme;
}

export function marketToneClass(tone: MarketTone | undefined) {
  if (tone === 'up') return 'text-[var(--color-market-up)]';
  if (tone === 'down') return 'text-[var(--color-market-down)]';
  return undefined;
}

export function marketToneForValue(value: number | null | undefined): MarketTone | undefined {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? 'up' : 'down';
}

function readStoredMarketColorScheme(): MarketColorScheme {
  if (typeof window === 'undefined') return defaultMarketColorScheme;
  try {
    return normalizeMarketColorScheme(window.localStorage.getItem(marketColorStorageKey));
  } catch {
    return defaultMarketColorScheme;
  }
}

type MarketColorContextValue = {
  scheme: MarketColorScheme;
  setScheme: (scheme: MarketColorScheme) => void;
  storageError: string | null;
};

const MarketColorContext = createContext<MarketColorContextValue | null>(null);

const marketColors = {
  light: {
    'red-up': { up: '#c7393c', upSoft: '#fff0f2', down: '#2f7a66', downSoft: '#edf7f3' },
    'green-up': { up: '#2f7a66', upSoft: '#edf7f3', down: '#c7393c', downSoft: '#fff0f2' },
  },
  dark: {
    'red-up': { up: '#ff6d7d', upSoft: '#3a2025', down: '#26c59a', downSoft: '#102d25' },
    'green-up': { up: '#26c59a', upSoft: '#102d25', down: '#ff6d7d', downSoft: '#3a2025' },
  },
} satisfies Record<
  'light' | 'dark',
  Record<MarketColorScheme, Record<'up' | 'upSoft' | 'down' | 'downSoft', string>>
>;

export function MarketColorProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [scheme, setSchemeState] = useState<MarketColorScheme>(readStoredMarketColorScheme);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== marketColorStorageKey) return;
      setSchemeState(normalizeMarketColorScheme(event.newValue));
      setStorageError(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const colors = marketColors[resolvedTheme][scheme];
    root.dataset.marketColorScheme = scheme;
    root.style.setProperty('--color-market-up', colors.up);
    root.style.setProperty('--color-market-up-soft', colors.upSoft);
    root.style.setProperty('--color-market-down', colors.down);
    root.style.setProperty('--color-market-down-soft', colors.downSoft);
  }, [resolvedTheme, scheme]);

  const setScheme = useCallback((nextScheme: MarketColorScheme) => {
    setSchemeState(nextScheme);
    setStorageError(null);
    try {
      window.localStorage.setItem(marketColorStorageKey, nextScheme);
    } catch {
      setStorageError('涨跌配色已应用，但未能保存到本机。');
    }
  }, []);

  const value = useMemo(
    () => ({ scheme, setScheme, storageError }),
    [scheme, setScheme, storageError],
  );
  return <MarketColorContext.Provider value={value}>{children}</MarketColorContext.Provider>;
}

export function useMarketColorScheme() {
  const context = useContext(MarketColorContext);
  if (!context) throw new Error('useMarketColorScheme must be used within MarketColorProvider');
  return context;
}
