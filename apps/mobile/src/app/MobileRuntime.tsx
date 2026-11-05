import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider, useQueryClient, useIsMutating } from '@tanstack/react-query';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { ThesisLedgerApiClient, type AccountMode } from '@thesis-ledger/api-client';
import { getMobileTheme, type MobileThemePreference } from '../theme';
import { createMobileMarketColorPersistence, type MobileMarketColorScheme } from '../market-color';
import { resolveMobileApiBaseUrl } from '../index';
import { connectionPersistence, normalizeConnection } from '../platform/connection/connection';
import { guardedTransition, mobileScopeKey } from './navigation-state';
import { installNativeQueryLifecycle } from './query/native-lifecycle';
import { createMobileQueryClient } from './query/query-client';

let confirmationOpen = false;
export function showMessage(title: string, message: string) {
  Alert.alert(title, message, [{ text: '知道了' }]);
}
export function confirmAction(
  title: string,
  message: string,
  destructive = false,
): Promise<boolean> {
  if (confirmationOpen) return Promise.resolve(false);
  confirmationOpen = true;
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        {
          text: '确认',
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  ).finally(() => {
    confirmationOpen = false;
  });
}

type DirtyEntry = { dirty: boolean; discard: () => void };
function useRuntimeState() {
  const client = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(() =>
    normalizeConnection(
      resolveMobileApiBaseUrl({
        explicitBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
        platform: Platform.OS,
      }),
    ),
  );
  const [mode, setMode] = useState<AccountMode>('actual');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [themePreference, setThemeState] = useState<MobileThemePreference>('system');
  const [marketColor, setMarketColorState] = useState<MobileMarketColorScheme>('red-up');
  const [storageError, setStorageError] = useState<string | null>(null);
  const nativeTheme = useColorScheme();
  const preferenceRevision = useRef(0);
  const dirty = useRef(new Map<string, DirtyEntry>());
  const connection = useMemo(() => connectionPersistence(AsyncStorage), []);
  const colorPersistence = useMemo(() => createMobileMarketColorPersistence(), []);
  const api = useMemo(() => new ThesisLedgerApiClient(baseUrl), [baseUrl]);
  const register = useCallback((id: string, entry: DirtyEntry) => {
    dirty.current.set(id, entry);
    return () => {
      dirty.current.delete(id);
    };
  }, []);
  const hasDirty = useCallback(() => [...dirty.current.values()].some((entry) => entry.dirty), []);
  const transition = useCallback(
    async (change: () => void) => {
      const pending = client.isMutating({ mutationKey: ['mobile-write'] }) > 0;
      if (pending) Alert.alert('正在提交', '请等待当前操作返回后再切换。');
      return guardedTransition({
        pending,
        dirty: hasDirty(),
        confirm: () => confirmAction('放弃未保存的修改？', '切换后将清除当前尚未提交的输入。'),
        discard: () => {
          for (const entry of dirty.current.values()) if (entry.dirty) entry.discard();
        },
        change,
      });
    },
    [client, hasDirty],
  );
  useEffect(() => {
    let active = true;
    const revision = preferenceRevision.current;
    void connection
      .restore()
      .then((value) => {
        if (active && value) setBaseUrl(value);
      })
      .catch(() => {
        if (active) setStorageError('服务地址读取失败，当前使用默认连接。');
      });
    void Promise.all([
      AsyncStorage.getItem('thesis-ledger-mobile-theme'),
      colorPersistence.restore(),
    ])
      .then(([theme, color]) => {
        if (!active || revision !== preferenceRevision.current) return;
        if (theme === 'light' || theme === 'dark' || theme === 'system') setThemeState(theme);
        if (color) setMarketColorState(color);
      })
      .catch(() => {
        if (active) setStorageError('外观偏好读取失败。');
      });
    return () => {
      active = false;
    };
  }, [connection, colorPersistence]);
  useEffect(installNativeQueryLifecycle, []);
  const changeConnection = async (value: string) => {
    const normalized = normalizeConnection(value);
    return transition(() => {
      void client.cancelQueries({ queryKey: ['mobile-v2'] });
      setAccountId(null);
      setBaseUrl(normalized);
      void connection
        .save(normalized)
        .catch(() => setStorageError('本次已连接，但地址未能保存到本机。'));
    });
  };
  const changeMode = (value: AccountMode) =>
    transition(() => {
      void client.cancelQueries({ queryKey: ['mobile-v2'] });
      setAccountId(null);
      setMode(value);
    });
  const changeAccount = (value: string | null) => transition(() => setAccountId(value));
  const changeTheme = (value: MobileThemePreference) => {
    preferenceRevision.current += 1;
    setThemeState(value);
    void AsyncStorage.setItem('thesis-ledger-mobile-theme', value).catch(() =>
      setStorageError('主题已应用，但未能保存。'),
    );
  };
  const changeMarketColor = (value: MobileMarketColorScheme) => {
    preferenceRevision.current += 1;
    setMarketColorState(value);
    void colorPersistence.save(value).catch(() => setStorageError('涨跌色已应用，但未能保存。'));
  };
  let resolvedTheme: 'light' | 'dark' = 'light';
  if (themePreference === 'dark' || (themePreference === 'system' && nativeTheme === 'dark'))
    resolvedTheme = 'dark';
  const theme = getMobileTheme(resolvedTheme, marketColor);
  return {
    api,
    baseUrl,
    mode,
    accountId,
    theme,
    themePreference,
    marketColor,
    storageError,
    scope: mobileScopeKey(baseUrl, mode),
    transition,
    hasDirty,
    register,
    changeConnection,
    changeMode,
    changeAccount,
    changeTheme,
    changeMarketColor,
  };
}
type Runtime = ReturnType<typeof useRuntimeState>;
const RuntimeContext = createContext<Runtime | null>(null);
function RuntimeProvider({ children }: { children: ReactNode }) {
  const value = useRuntimeState();
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}
export function MobileProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createMobileQueryClient);
  return (
    <QueryClientProvider client={client}>
      <RuntimeProvider>{children}</RuntimeProvider>
    </QueryClientProvider>
  );
}
export function useMobileRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('手机运行上下文缺失');
  return context;
}
export function useDirtyForm(dirty: boolean, discard: () => void) {
  const { register, transition } = useMobileRuntime();
  const navigation = useNavigation();
  const pending = useIsMutating({ mutationKey: ['mobile-write'] }) > 0;
  const id = useId();
  const discardRef = useRef(discard);
  discardRef.current = discard;
  useEffect(
    () => register(id, { dirty, discard: () => discardRef.current() }),
    [register, id, dirty],
  );
  usePreventRemove(dirty || pending, ({ data }) => {
    void transition(() => navigation.dispatch(data.action));
  });
}
