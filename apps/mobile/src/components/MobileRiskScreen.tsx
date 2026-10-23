import { Text, View } from 'react-native';
import type { MobileDashboardState } from '../index';
import type { MobileStyles } from '../styles/mobileStyles';

export function MobileRiskScreen({
  state,
  styles,
}: {
  state: MobileDashboardState;
  styles: MobileStyles;
}) {
  if (state.riskEvents.length === 0) {
    const message =
      state.status === 'error' ? '暂时无法读取风险事件，请刷新重试。' : '暂无风险事件。';
    return <Text style={styles.emptyText}>{message}</Text>;
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
