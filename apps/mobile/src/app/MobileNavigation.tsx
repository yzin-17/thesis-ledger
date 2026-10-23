import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountNavigator } from './AccountNavigator';
import { useMobileRuntime } from './MobileRuntime';
import { mobileDestinations } from './navigation-state';
import type { PortfolioStackParams, RootTabParams, SettingsStackParams } from './navigation-types';
import { PortfolioScreen } from '../features/portfolio/PortfolioScreen';
import { RiskEventsScreen } from '../features/risk-events/RiskEventsScreen';
import { RiskRulesScreen } from '../features/risk-rules/RiskRulesScreen';
import { RiskRuleEditor } from '../features/risk-rules/RiskRuleEditor';
import { RiskEvaluateScreen } from '../features/risk-rules/RiskEvaluateScreen';
import { RiskAuditScreen } from '../features/risk-events/RiskAuditScreen';
import { RiskEventDetail } from '../features/risk-events/RiskEventDetail';
import { RiskNotifications } from '../features/risk-events/RiskNotifications';
import { PerformanceScreen } from '../features/performance-read/PerformanceScreen';
import { TargetsScreen } from '../features/performance-targets/TargetsScreen';
import { TradesScreen } from '../features/portfolio/TradesScreen';
import { TradeDetailScreen } from '../features/portfolio/TradeDetailScreen';
import { MarketNavigator } from './MarketNavigator';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ChartPreview } from '../features/settings/ChartPreview';
import { Choices, Copy, Page, Section, ui } from '../components/MobilePrimitives';
const Tabs = createBottomTabNavigator<RootTabParams>();
const Portfolio = createNativeStackNavigator<PortfolioStackParams>();
const Settings = createNativeStackNavigator<SettingsStackParams>();
function PortfolioNavigator() {
  return (
    <Portfolio.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Portfolio.Screen
        name="PortfolioHome"
        component={PortfolioScreen}
        options={{ headerShown: false }}
      />
      <Portfolio.Screen name="Risk" component={RiskEventsScreen} />
      <Portfolio.Screen name="RiskRules" component={RiskRulesScreen} />
      <Portfolio.Screen name="RiskRuleEditor" component={RiskRuleEditor} />
      <Portfolio.Screen name="RiskEvaluate" component={RiskEvaluateScreen} />
      <Portfolio.Screen name="RiskAudit" component={RiskAuditScreen} />
      <Portfolio.Screen name="RiskEventDetail" component={RiskEventDetail} />
      <Portfolio.Screen name="RiskNotifications" component={RiskNotifications} />
      <Portfolio.Screen name="Performance" component={PerformanceScreen} />
      <Portfolio.Screen name="PerformanceTargets" component={TargetsScreen} />
      <Portfolio.Screen name="Trades" component={TradesScreen} />
      <Portfolio.Screen name="TradeDetail" component={TradeDetailScreen} />
    </Portfolio.Navigator>
  );
}
function SettingsNavigator() {
  return (
    <Settings.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Settings.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Settings.Screen name="ChartPreview" component={ChartPreview} />
    </Settings.Navigator>
  );
}
function ResearchDestination() {
  const route = useRoute<RouteProp<RootTabParams, 'Research'>>();
  const { mode } = useMobileRuntime();
  return (
    <Page title="研究">
      {route.params && route.params.mode === mode ? (
        <Section title="已定位复盘对象">
          <Copy>账户 {route.params.accountId}</Copy>
          <Copy>交易 {route.params.tradeId ?? '未指定'}</Copy>
          {route.params.closeSliceId ? <Copy>平仓片段 {route.params.closeSliceId}</Copy> : null}
        </Section>
      ) : null}
      <Copy muted>研究与完整复盘工作区暂未开放。</Copy>
    </Page>
  );
}
function TabBar({ state, navigation }: BottomTabBarProps) {
  const runtime = useMobileRuntime();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderColor: runtime.theme.border,
        backgroundColor: runtime.theme.surface1,
        paddingBottom: Math.max(8, insets.bottom),
      }}
    >
      {state.routes.map((route, index) => (
        <Pressable
          key={route.key}
          accessibilityRole="tab"
          accessibilityLabel={mobileDestinations[route.name as keyof RootTabParams]}
          accessibilityState={{ selected: state.index === index }}
          onPress={() => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented && state.index !== index)
              void runtime.transition(() => navigation.navigate(route.name));
          }}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              color: state.index === index ? runtime.theme.textPrimary : runtime.theme.textMuted,
              fontSize: 14,
              fontWeight: state.index === index ? '600' : '400',
            }}
          >
            {mobileDestinations[route.name as keyof RootTabParams]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function NavigationFrame() {
  const runtime = useMobileRuntime();
  const { width, height } = useWindowDimensions();
  const dark = runtime.theme.pageBackground === '#111417';
  const theme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme.colors : DefaultTheme.colors),
      background: runtime.theme.pageBackground,
      card: runtime.theme.surface1,
      text: runtime.theme.textPrimary,
      border: runtime.theme.border,
      primary: runtime.theme.textPrimary,
    },
  };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[ui.flex, { backgroundColor: runtime.theme.pageBackground }]}
    >
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={[ui.row, { paddingHorizontal: 18, paddingVertical: 8 }]}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: runtime.theme.textPrimary }}>
          ThesisLedger
        </Text>
        <Choices
          label="账户范围"
          inline={width > height}
          value={runtime.mode}
          options={[
            { value: 'actual', label: '实际' },
            { value: 'shadow', label: '模拟' },
          ]}
          onChange={(mode) => void runtime.changeMode(mode)}
        />
      </View>
      <NavigationContainer<RootTabParams>
        key={`${runtime.baseUrl}:${runtime.mode}`}
        theme={theme}
        linking={{
          prefixes: ['thesis-ledger://'],
          config: {
            screens: {
              Portfolio: {
                screens: {
                  PortfolioHome: 'portfolio',
                  Risk: 'risk',
                  Trades: 'trades',
                  TradeDetail: 'trades/:accountId/:tradeId',
                },
              },
              Accounts: {
                screens: { AccountsHome: 'accounts', AccountWorkspace: 'accounts/:accountId' },
              },
              Market: 'market',
              Research: 'review',
              Settings: { screens: { SettingsHome: 'settings' } },
            },
          },
        }}
      >
        <Tabs.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <TabBar {...props} />}
        >
          <Tabs.Screen name="Portfolio" component={PortfolioNavigator} />
          <Tabs.Screen name="Accounts" component={AccountNavigator} />
          <Tabs.Screen name="Market" component={MarketNavigator} />
          <Tabs.Screen name="Research" component={ResearchDestination} />
          <Tabs.Screen name="Settings" component={SettingsNavigator} />
        </Tabs.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}
export function MobileNavigation() {
  return (
    <SafeAreaProvider>
      <KeyboardAvoidingView
        style={ui.flex}
        behavior={Platform.OS === 'android' ? 'height' : undefined}
      >
        <NavigationFrame />
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}
