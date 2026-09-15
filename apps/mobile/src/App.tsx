import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { createMobileBootstrap, resolveMobileApiBaseUrl, type MobileDashboardState } from './index';
import {
  getMobileTheme,
  mobileThemeLabels,
  type MobileResolvedTheme,
  type MobileThemePreference,
} from './theme';
import { MobilePortfolioScreen } from './components/MobilePortfolioScreen';
import { MobileRiskScreen } from './components/MobileRiskScreen';
import { MobileStatusBanner } from './components/MobileStatusBanner';
import { MobileAccountScreen } from './components/MobileAccountScreen';
import {
  createMobileAccountDeletionHandler,
  confirmMobileAccountDeletion,
  mobileAccountDeletionErrorMessage,
} from './mobile-account.actions';
import {
  resolveMobileAccountSelection,
  useMobileAccountsQuery,
  useMobilePermanentDeleteAccountMutation,
} from './mobile-account.queries';
import { createStyles } from './styles/mobileStyles';

const apiBaseUrl = resolveMobileApiBaseUrl({
  explicitBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  platform: Platform.OS,
});

const themePreferences: MobileThemePreference[] = ['system', 'light', 'dark'];

const resolveMobileTheme = (
  preference: MobileThemePreference,
  systemTheme: ReturnType<typeof useColorScheme>,
): MobileResolvedTheme => {
  if (preference !== 'system') return preference;
  return systemTheme === 'dark' ? 'dark' : 'light';
};

type MobileScreen = 'portfolio' | 'risk' | 'account';

export function MobileApp() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileAppContent />
    </QueryClientProvider>
  );
}

function MobileAppContent() {
  const bootstrap = useMemo(() => createMobileBootstrap({ apiBaseUrl }), []);
  const systemTheme = useColorScheme();
  const [state, setState] = useState<MobileDashboardState>(bootstrap.store.getState());
  const [screen, setScreen] = useState<MobileScreen>('portfolio');
  const [themePreference, setThemePreference] = useState<MobileThemePreference>('system');
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountFeedback, setAccountFeedback] = useState<string | null>(null);
  const resolvedTheme = resolveMobileTheme(themePreference, systemTheme);
  const theme = useMemo(() => getMobileTheme(resolvedTheme), [resolvedTheme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accountsQuery = useMobileAccountsQuery(state.mode, bootstrap.api.accounts);
  const deleteAccountMutation = useMobilePermanentDeleteAccountMutation(
    bootstrap.api.accounts,
    bootstrap.store,
  );
  const accounts = accountsQuery.data ?? [];

  const accountDeletionHandler = useMemo(
    () =>
      createMobileAccountDeletionHandler({
        isPending: () => deleteAccountMutation.isPending,
        confirm: (account) =>
          confirmMobileAccountDeletion(account, (title, message, buttons, options) =>
            Alert.alert(title, message, buttons, options),
          ),
        permanentlyDelete: deleteAccountMutation.mutateAsync,
        onSuccess: (deletedAccountId) => {
          setAccountFeedback(null);
          setSelectedAccountId((currentAccountId) =>
            resolveMobileAccountSelection(
              accounts.filter((account) => account.id !== deletedAccountId),
              currentAccountId === deletedAccountId ? null : currentAccountId,
            ),
          );
        },
        onError: (error) => setAccountFeedback(mobileAccountDeletionErrorMessage(error)),
      }),
    [accounts, deleteAccountMutation.isPending, deleteAccountMutation.mutateAsync],
  );

  useEffect(() => {
    const unsubscribe = bootstrap.store.subscribe(() => setState(bootstrap.store.getState()));
    void bootstrap.store.refresh();
    return () => {
      unsubscribe();
    };
  }, [bootstrap]);

  useEffect(() => {
    const nextAccountId = resolveMobileAccountSelection(accounts, selectedAccountId);
    if (nextAccountId !== selectedAccountId) setSelectedAccountId(nextAccountId);
  }, [accounts, selectedAccountId]);

  const cycleTheme = () => {
    const currentIndex = themePreferences.indexOf(themePreference);
    const nextPreference =
      themePreferences[(currentIndex + 1) % themePreferences.length] ?? 'system';
    setThemePreference(nextPreference);
  };

  let eyebrow = 'PORTFOLIO';
  let title = '投资组合';
  if (screen === 'risk') {
    eyebrow = 'RISK CENTER';
    title = '风险事件';
  } else if (screen === 'account') {
    eyebrow = 'ACCOUNTS';
    title = '账户';
  }

  let screenContent = <MobilePortfolioScreen state={state} theme={theme} styles={styles} />;
  if (screen === 'risk') {
    screenContent = <MobileRiskScreen state={state} styles={styles} />;
  } else if (screen === 'account') {
    screenContent = (
      <MobileAccountScreen
        accounts={accounts}
        mode={state.mode}
        loading={accountsQuery.isPending}
        error={accountsQuery.error}
        feedback={accountFeedback}
        pendingAccountId={deleteAccountMutation.isPending ? deleteAccountMutation.variables : undefined}
        onDelete={(account) => void accountDeletionHandler(account)}
        onRetry={() => void accountsQuery.refetch()}
        theme={theme}
        styles={styles}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              {eyebrow}
            </Text>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`切换主题，当前为${mobileThemeLabels[themePreference]}`}
            onPress={cycleTheme}
            onFocus={() => setFocusedControl('theme')}
            onBlur={() => setFocusedControl(null)}
            style={({ pressed }) => [
              styles.themeButton,
              focusedControl === 'theme' && styles.focusRing,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.themeButtonText}>主题：{mobileThemeLabels[themePreference]}</Text>
          </Pressable>
        </View>
        <Text style={styles.apiHint}>
          数据源：ThesisLedger API ·{`\n`}
          {apiBaseUrl}
        </Text>
        <MobileStatusBanner state={state} theme={theme} styles={styles} />
        <View style={styles.modeTabs} accessibilityRole="tablist" accessibilityLabel="估值范围">
          {(['actual', 'shadow'] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: state.mode === mode }}
              onPress={() => bootstrap.store.setMode(mode)}
              onFocus={() => setFocusedControl('mode-' + mode)}
              onBlur={() => setFocusedControl(null)}
              style={({ pressed }) => [
                styles.modeTab,
                state.mode === mode && styles.activeModeTab,
                focusedControl === 'mode-' + mode && styles.focusRing,
                pressed && styles.pressed,
              ]}
            >
              <Text style={state.mode === mode ? styles.activeTabText : styles.tabText}>
                {mode === 'actual' ? '实际' : '模拟'}
              </Text>
            </Pressable>
          ))}
        </View>
        {state.mode === 'shadow' && (
          <Text style={styles.shadowNotice} accessibilityRole="text">
            当前为模拟账户；以下组合与风险事件均为模拟数据，不代表实际账户。
          </Text>
        )}
        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === 'portfolio' }}
            onPress={() => setScreen('portfolio')}
            onFocus={() => setFocusedControl('portfolio')}
            onBlur={() => setFocusedControl(null)}
            style={({ pressed }) => [
              styles.tab,
              screen === 'portfolio' && styles.activeTab,
              focusedControl === 'portfolio' && styles.focusRing,
              pressed && styles.pressed,
            ]}
          >
            <Text style={screen === 'portfolio' ? styles.activeTabText : styles.tabText}>
              投资组合
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === 'risk' }}
            onPress={() => setScreen('risk')}
            onFocus={() => setFocusedControl('risk')}
            onBlur={() => setFocusedControl(null)}
            style={({ pressed }) => [
              styles.tab,
              screen === 'risk' && styles.activeTab,
              focusedControl === 'risk' && styles.focusRing,
              pressed && styles.pressed,
            ]}
          >
            <Text style={screen === 'risk' ? styles.activeTabText : styles.tabText}>风险事件</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === 'account' }}
            onPress={() => setScreen('account')}
            onFocus={() => setFocusedControl('account')}
            onBlur={() => setFocusedControl(null)}
            style={({ pressed }) => [
              styles.tab,
              screen === 'account' && styles.activeTab,
              focusedControl === 'account' && styles.focusRing,
              pressed && styles.pressed,
            ]}
          >
            <Text style={screen === 'account' ? styles.activeTabText : styles.tabText}>账户</Text>
          </Pressable>
        </View>
        {screenContent}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新 ThesisLedger 数据"
          onPress={() => void bootstrap.store.refresh()}
          onFocus={() => setFocusedControl('refresh')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => [
            styles.refreshButton,
            focusedControl === 'refresh' && styles.focusRing,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.refreshText}>刷新数据</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
