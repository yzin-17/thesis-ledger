import AsyncStorage from '@react-native-async-storage/async-storage';

export type MobileMarketColorScheme = 'red-up' | 'green-up';

type MobileMarketColorStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export const mobileMarketColorStorageKey = 'thesis-ledger-market-color-scheme';
export const defaultMobileMarketColorScheme: MobileMarketColorScheme = 'red-up';

export const isMobileMarketColorScheme = (value: string | null): value is MobileMarketColorScheme =>
  value === 'red-up' || value === 'green-up';

export const normalizeMobileMarketColorScheme = (
  value: string | null | undefined,
): MobileMarketColorScheme => {
  const candidate = value ?? null;
  return isMobileMarketColorScheme(candidate) ? candidate : defaultMobileMarketColorScheme;
};

export function createMobileMarketColorPersistence(
  storage: MobileMarketColorStorage = AsyncStorage,
) {
  let revision = 0;
  let saveQueue = Promise.resolve();

  return {
    async restore(): Promise<MobileMarketColorScheme | null> {
      const revisionAtRead = revision;
      try {
        const storedValue = await storage.getItem(mobileMarketColorStorageKey);
        if (revisionAtRead !== revision) return null;
        return normalizeMobileMarketColorScheme(storedValue);
      } catch (error) {
        if (revisionAtRead !== revision) return null;
        throw error;
      }
    },
    save(scheme: MobileMarketColorScheme): Promise<void> {
      revision += 1;
      const operation = saveQueue.then(() => storage.setItem(mobileMarketColorStorageKey, scheme));
      saveQueue = operation.catch(() => undefined);
      return operation;
    },
  };
}
