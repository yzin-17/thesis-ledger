import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  createMobileBootstrap,
  mobileStateCopy,
  resolveMobileApiBaseUrl,
  type MobileDashboardState,
  type MobileLoadState,
} from './index';
import {
  getMobileTheme,
  mobileThemeLabels,
  type MobileResolvedTheme,
  type MobileThemeColors,
  type MobileThemePreference,
} from './theme';

const apiBaseUrl = resolveMobileApiBaseUrl({
  explicitBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  platform: Platform.OS,
});

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '不可用' : money.format(value);

const themePreferences: MobileThemePreference[] = ['system', 'light', 'dark'];

function stateTone(theme: MobileThemeColors, state: MobileLoadState) {
  switch (state) {
    case 'ready':
      return theme.positive;
    case 'error':
      return theme.error;
    case 'empty':
      return theme.borderStrong;
    case 'stale':
      return theme.warning;
    case 'loading':
      return theme.brand;
  }
}

type MobileStyles = ReturnType<typeof createStyles>;

function StatusBanner({
  state,
  theme,
  styles,
}: {
  state: MobileDashboardState;
  theme: MobileThemeColors;
  styles: MobileStyles;
}) {
  const copy = mobileStateCopy[state.status];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.statusBanner, { borderLeftColor: stateTone(theme, state.status) }]}
    >
      <Text style={styles.statusTitle}>{copy.title}</Text>
      <Text style={styles.statusDescription}>{state.error || copy.description}</Text>
    </View>
  );
}

function PortfolioScreen({
  state,
  theme,
  styles,
}: {
  state: MobileDashboardState;
  theme: MobileThemeColors;
  styles: MobileStyles;
}) {
  if (state.status === 'loading' && state.portfolio === null) {
    return (
      <ActivityIndicator accessibilityLabel="正在加载投资组合" size="large" color={theme.brand} />
    );
  }
  if (state.status === 'empty' || state.portfolio === null) {
    return <Text style={styles.emptyText}>暂无持仓，请先在 Desktop 创建账户或导入持仓。</Text>;
  }
  return (
    <View>
      <View style={styles.metricsRow}>
        <Metric
          label="总市值"
          value={formatNumber(state.portfolio.totalMarketValue)}
          styles={styles}
        />
        <Metric label="总成本" value={formatNumber(state.portfolio.totalCost)} styles={styles} />
        <Metric label="累计盈亏" value={formatNumber(state.portfolio.totalPnl)} styles={styles} />
        <Metric label="现金" value={formatNumber(state.portfolio.cashValue)} styles={styles} />
      </View>
      <Text style={styles.sectionTitle}>持仓</Text>
      {state.portfolio.positions.map((position) => (
        <View key={position.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.symbol}>{position.symbol || '未知标的'}</Text>
            <Text style={position.stale ? styles.staleText : styles.mutedText}>
              {position.stale ? '行情陈旧' : '已估值'}
            </Text>
          </View>
          <Text style={styles.cardText}>
            数量 {position.quantity} · 成本 {formatNumber(position.costPrice)}
          </Text>
          <Text style={styles.cardText}>
            市值 {formatNumber(position.marketValue)} · 盈亏 {formatNumber(position.pnl)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RiskScreen({ state, styles }: { state: MobileDashboardState; styles: MobileStyles }) {
  if (state.riskEvents.length === 0) {
    return <Text style={styles.emptyText}>暂无风险事件。</Text>;
  }
  return (
    <View>
      {state.riskEvents.map((event) => (
        <View key={event.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.symbol}>{event.severity}</Text>
            <Text style={styles.mutedText}>规则 v{event.ruleVersion}</Text>
          </View>
          <Text style={styles.cardText}>{event.message}</Text>
          <Text style={styles.mutedText}>{event.marketTime || event.evaluatedAt}</Text>
        </View>
      ))}
    </View>
  );
}

function Metric({ label, value, styles }: { label: string; value: string; styles: MobileStyles }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function MobileApp() {
  const bootstrap = useMemo(() => createMobileBootstrap({ apiBaseUrl }), []);
  const systemTheme = useColorScheme();
  const [state, setState] = useState(bootstrap.store.getState());
  const [screen, setScreen] = useState<'portfolio' | 'risk'>('portfolio');
  const [themePreference, setThemePreference] = useState<MobileThemePreference>('system');
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const resolvedTheme: MobileResolvedTheme =
    themePreference === 'system' ? (systemTheme === 'dark' ? 'dark' : 'light') : themePreference;
  const theme = useMemo(() => getMobileTheme(resolvedTheme), [resolvedTheme]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    const unsubscribe = bootstrap.store.subscribe(() => setState(bootstrap.store.getState()));
    void bootstrap.store.refresh();
    return () => {
      unsubscribe();
    };
  }, [bootstrap]);

  const cycleTheme = () => {
    const currentIndex = themePreferences.indexOf(themePreference);
    const nextPreference =
      themePreferences[(currentIndex + 1) % themePreferences.length] ?? 'system';
    setThemePreference(nextPreference);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>THESISLEDGER MOBILE</Text>
            <Text style={styles.title}>只读投资组合</Text>
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
        <StatusBanner state={state} theme={theme} styles={styles} />
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
                {mode === 'actual' ? '实际' : '影子'}
              </Text>
            </Pressable>
          ))}
        </View>
        {state.mode === 'shadow' && (
          <Text style={styles.shadowNotice} accessibilityRole="text">
            当前为影子账户；以下组合与风险事件均为模拟数据，不代表实际账户。
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
        </View>
        {screen === 'portfolio' ? (
          <PortfolioScreen state={state} theme={theme} styles={styles} />
        ) : (
          <RiskScreen state={state} styles={styles} />
        )}
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
          <Text style={styles.refreshText}>重新读取</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: MobileThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.pageBackground },
    container: { gap: 16, padding: 20, paddingBottom: 32, width: '100%' },
    headerRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
      width: '100%',
    },
    headerCopy: { flex: 1, gap: 5, minWidth: 0 },
    eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.4 },
    title: { color: theme.textPrimary, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
    apiHint: {
      color: theme.textMuted,
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 18,
      width: '100%',
    },
    shadowNotice: {
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderRadius: 6,
      borderWidth: 1,
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      paddingHorizontal: 10,
      paddingVertical: 8,
      width: '100%',
    },
    themeButton: {
      backgroundColor: theme.surface2,
      borderColor: theme.borderStrong,
      borderRadius: 7,
      borderWidth: 1,
      flexShrink: 0,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    themeButtonText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
    pressed: { opacity: 0.72 },
    focusRing: {
      borderColor: theme.brand,
      borderWidth: 2,
      outlineColor: theme.brand,
      outlineOffset: 2,
      outlineStyle: 'solid',
      outlineWidth: 2,
    },
    statusBanner: {
      backgroundColor: theme.surface1,
      borderColor: theme.border,
      borderLeftWidth: 3,
      borderRadius: 8,
      borderWidth: 1,
      gap: 4,
      padding: 12,
    },
    statusTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: '600' },
    statusDescription: { color: theme.textSecondary, fontSize: 13, lineHeight: 19 },
    modeTabs: {
      alignSelf: 'flex-start',
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
    modeTab: {
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    activeModeTab: {
      backgroundColor: theme.surface1,
    },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tab: {
      backgroundColor: theme.surface1,
      borderColor: theme.border,
      borderRadius: 7,
      borderWidth: 1,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    activeTab: { backgroundColor: theme.surfaceSelected, borderColor: theme.brand },
    tabText: { color: theme.textSecondary, fontSize: 13, fontWeight: '600' },
    activeTabText: { color: theme.brand, fontSize: 13, fontWeight: '700' },
    metricsRow: {
      backgroundColor: theme.border,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 1,
      overflow: 'hidden',
    },
    metric: { backgroundColor: theme.surface1, flex: 1, gap: 5, padding: 12 },
    metricLabel: { color: theme.textMuted, fontSize: 12 },
    metricValue: { color: theme.textPrimary, fontSize: 14, fontWeight: '600' },
    sectionTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 4 },
    card: {
      backgroundColor: theme.surface1,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      padding: 14,
    },
    cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    symbol: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
    cardText: { color: theme.textSecondary, fontSize: 13, lineHeight: 19 },
    mutedText: { color: theme.textMuted, fontSize: 12 },
    staleText: { color: theme.warning, fontSize: 12, fontWeight: '700' },
    emptyText: { color: theme.textMuted, fontSize: 14, lineHeight: 21, paddingVertical: 20 },
    refreshButton: {
      alignItems: 'center',
      backgroundColor: theme.brand,
      borderRadius: 7,
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 11,
      width: '100%',
    },
    refreshText: { color: theme.brandContrast, fontWeight: '700' },
  });
}
