import { ActivityIndicator, Text, View } from 'react-native';
import type { MobileDashboardState } from '../index';
import type { MobileThemeColors } from '../theme';
import type { MobileStyles } from '../styles/mobileStyles';

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '不可用' : money.format(value);

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
  if (state.status === 'empty' || state.portfolio === null) {
    return <Text style={styles.emptyText}>暂无持仓，请先在 Desktop 创建账户或导入持仓。</Text>;
  }
  const totalPnlTone = marketTone(state.portfolio.totalPnl);
  return (
    <View>
      <View style={styles.metricsRow}>
        <Metric
          label="总市值"
          value={formatNumber(state.portfolio.totalMarketValue)}
          styles={styles}
        />
        <Metric label="总成本" value={formatNumber(state.portfolio.totalCost)} styles={styles} />
        <Metric
          label="累计盈亏"
          value={formatNumber(state.portfolio.totalPnl)}
          {...(totalPnlTone ? { tone: totalPnlTone } : {})}
          styles={styles}
        />
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
            市值 {formatNumber(position.marketValue)} · 盈亏{' '}
            <Text style={marketToneStyle(marketTone(position.pnl), styles)}>
              {formatNumber(position.pnl)}
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}
