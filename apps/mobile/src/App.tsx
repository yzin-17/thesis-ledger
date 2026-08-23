import { useEffect, useMemo, useState } from 'react';
import {
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

export function MobileApp() {
  const bootstrap = useMemo(() => createMobileBootstrap({ apiBaseUrl }), []);
  const systemTheme = useColorScheme();
  const [state, setState] = useState<MobileDashboardState>(bootstrap.store.getState());
  const [screen, setScreen] = useState<'portfolio' | 'risk'>('portfolio');
  const [themePreference, setThemePreference] = useState<MobileThemePreference>('system');
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const resolvedTheme = resolveMobileTheme(themePreference, systemTheme);
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
          <MobilePortfolioScreen state={state} theme={theme} styles={styles} />
        ) : (
          <MobileRiskScreen state={state} styles={styles} />
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
