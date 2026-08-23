import { Text, View } from 'react-native';
import { mobileStateCopy, type MobileDashboardState } from '../index';
import type { MobileThemeColors } from '../theme';
import type { MobileStyles } from '../styles/mobileStyles';

const stateTone = (theme: MobileThemeColors, state: MobileDashboardState['status']) => {
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
};

export function MobileStatusBanner({
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
