import { ActivityIndicator, Text, View } from 'react-native';
import type { MobileDashboardState } from '../index';
import type { MobileThemeColors } from '../theme';
import type { MobileStyles } from '../styles/mobileStyles';

const formatNumber = (value: number | null | undefined, currency?: unknown) => {
  if (value === null || value === undefined) return '不可用';
  const options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 };
  if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
    options.style = 'currency'; options.currency = currency;
  }
  return new Intl.NumberFormat('zh-CN', options).format(value);
};

const marketTone = (value: number | null | undefined): 'up' | 'down' | undefined => {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? 'up' : 'down';
};

const marketToneStyle = (tone: 'up' | 'down' | undefined, styles: MobileStyles) => {
  if (tone === 'up') return styles.marketUpText;
  if (tone === 'down') return styles.marketDownText;
  return styles.metricValue;
};

function Metric({
  label,
  value,
  tone,
  styles,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
  styles: MobileStyles;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={marketToneStyle(tone, styles)}>{value}</Text>
    </View>
  );
}

export function MobilePortfolioScreen({
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
  if (state.portfolio === null) {
    const message =
      state.status === 'error'
        ? '暂时无法读取持仓，请刷新重试。'
        : '暂无持仓，可在「账户」创建账户并录入持仓。';
    return <Text style={styles.emptyText}>{message}</Text>;
  }
  const totalPnlTone = marketTone(state.portfolio.totalPnl);
  return (
    <View>
      <View style={styles.metricsRow}>
        <Metric
          label="总市值"
          value={formatNumber(state.portfolio.totalMarketValue, state.portfolio.baseCurrency)}
          styles={styles}
        />
        <Metric label="总成本" value={formatNumber(state.portfolio.totalCost, state.portfolio.baseCurrency)} styles={styles} />
        <Metric
          label="累计盈亏"
          value={formatNumber(state.portfolio.totalPnl, state.portfolio.baseCurrency)}
          {...(totalPnlTone ? { tone: totalPnlTone } : {})}
          styles={styles}
        />
        <Metric label="现金" value={formatNumber(state.portfolio.cashValue, state.portfolio.baseCurrency)} styles={styles} />
      </View>
      <Text style={styles.sectionTitle}>持仓</Text>
      {state.portfolio.positions.length === 0 ? (
        <Text style={styles.emptyText}>暂无持仓，可在「账户」录入持仓。</Text>
      ) : null}
      {state.portfolio.positions.map((position) => (
        <View key={position.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.symbol}>{position.symbol || '未知标的'}</Text>
            <Text style={position.stale ? styles.staleText : styles.mutedText}>
              {position.stale ? '行情陈旧' : '已估值'}
            </Text>
          </View>
          <Text style={styles.cardText}>
            数量 {position.quantity} · 成本 {formatNumber(position.costPrice, position.currency)}
          </Text>
          <Text style={styles.cardText}>
            市值 {formatNumber(position.marketValue, position.currency)} · 盈亏{' '}
            <Text style={marketToneStyle(marketTone(position.pnl), styles)}>
              {formatNumber(position.pnl, position.currency)}
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}
