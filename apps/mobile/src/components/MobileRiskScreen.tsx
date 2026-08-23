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
  if (state.riskEvents.length === 0) return <Text style={styles.emptyText}>暂无风险事件。</Text>;
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
