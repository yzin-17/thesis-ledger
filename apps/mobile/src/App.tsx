import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createMobileBootstrap,
  mobileStateCopy,
  resolveMobileApiBaseUrl,
  type MobileDashboardState,
  type MobileLoadState,
} from './index';

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

const stateTone: Record<MobileLoadState, string> = {
  loading: '#475569',
  ready: '#166534',
  empty: '#92400e',
  error: '#b91c1c',
  stale: '#9a3412',
};

function StatusBanner({ state }: { state: MobileDashboardState }) {
  const copy = mobileStateCopy[state.status];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.statusBanner, { borderLeftColor: stateTone[state.status] }]}
    >
      <Text style={styles.statusTitle}>{copy.title}</Text>
      <Text style={styles.statusDescription}>{state.error || copy.description}</Text>
    </View>
  );
}

function PortfolioScreen({ state }: { state: MobileDashboardState }) {
  if (state.status === 'loading' && state.portfolio === null) {
    return <ActivityIndicator accessibilityLabel="正在加载投资组合" size="large" color="#0f766e" />;
  }
  if (state.status === 'empty' || state.portfolio === null) {
    return <Text style={styles.emptyText}>暂无持仓，请先在 Desktop 创建账户或导入持仓。</Text>;
  }
  return (
    <View>
      <View style={styles.metricsRow}>
        <Metric label="总市值" value={formatNumber(state.portfolio.totalMarketValue)} />
        <Metric label="总成本" value={formatNumber(state.portfolio.totalCost)} />
        <Metric label="累计盈亏" value={formatNumber(state.portfolio.totalPnl)} />
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

function RiskScreen({ state }: { state: MobileDashboardState }) {
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function MobileApp() {
  const bootstrap = useMemo(() => createMobileBootstrap({ apiBaseUrl }), []);
  const [state, setState] = useState(bootstrap.store.getState());
  const [screen, setScreen] = useState<'portfolio' | 'risk'>('portfolio');

  useEffect(() => {
    const unsubscribe = bootstrap.store.subscribe(() => setState(bootstrap.store.getState()));
    void bootstrap.store.refresh();
    return () => {
      unsubscribe();
    };
  }, [bootstrap]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>INVESTMENT OS MOBILE</Text>
        <Text style={styles.title}>只读投资组合</Text>
        <Text style={styles.apiHint}>数据源：Investment OS API · {apiBaseUrl}</Text>
        <StatusBanner state={state} />
        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === 'portfolio' }}
            onPress={() => setScreen('portfolio')}
            style={[styles.tab, screen === 'portfolio' && styles.activeTab]}
          >
            <Text style={screen === 'portfolio' ? styles.activeTabText : styles.tabText}>
              投资组合
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === 'risk' }}
            onPress={() => setScreen('risk')}
            style={[styles.tab, screen === 'risk' && styles.activeTab]}
          >
            <Text style={screen === 'risk' ? styles.activeTabText : styles.tabText}>风险事件</Text>
          </Pressable>
        </View>
        {screen === 'portfolio' ? <PortfolioScreen state={state} /> : <RiskScreen state={state} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新 Investment OS 数据"
          onPress={() => void bootstrap.store.refresh()}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>重新读取</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { gap: 16, padding: 20 },
  eyebrow: { color: '#0f766e', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '800' },
  apiHint: { color: '#64748b', fontSize: 12 },
  statusBanner: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 4,
    borderRadius: 10,
    gap: 4,
    padding: 12,
  },
  statusTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  statusDescription: { color: '#475569', fontSize: 13, lineHeight: 19 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    borderColor: '#cbd5e1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  activeTab: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  tabText: { color: '#475569', fontWeight: '600' },
  activeTabText: { color: '#ffffff', fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { backgroundColor: '#ffffff', borderRadius: 10, flex: 1, gap: 4, padding: 12 },
  metricLabel: { color: '#64748b', fontSize: 12 },
  metricValue: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, gap: 6, padding: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  symbol: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  cardText: { color: '#334155', fontSize: 13, lineHeight: 19 },
  mutedText: { color: '#64748b', fontSize: 12 },
  staleText: { color: '#c2410c', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#64748b', fontSize: 14, lineHeight: 21, paddingVertical: 20 },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 10,
    padding: 13,
  },
  refreshText: { color: '#ffffff', fontWeight: '700' },
});
