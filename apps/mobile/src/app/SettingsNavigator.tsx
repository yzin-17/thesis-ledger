import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SettingsStackParams } from './navigation-types';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ChartPreview } from '../features/settings/ChartPreview';
import { AiProvidersScreen } from '../features/ai-providers/AiProvidersScreen';
import { AiProviderEditor } from '../features/ai-providers/AiProviderEditor';
import { MarketProvidersScreen } from '../features/market-providers/MarketProvidersScreen';
import { MarketProviderEditor } from '../features/market-providers/MarketProviderEditor';
import { ProviderOAuthScreen } from '../features/provider-oauth/ProviderOAuthScreen';
import { MarketPolicyScreen } from '../features/market-policy/MarketPolicyScreen';
import { MarketCatalogScreen } from '../features/market-catalog/MarketCatalogScreen';
import { AutomationsScreen } from '../features/automation/AutomationsScreen';
import { AutomationEditor } from '../features/automation/AutomationEditor';
import { AutomationHistoryScreen } from '../features/automation/AutomationHistoryScreen';
import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
const Stack = createNativeStackNavigator<SettingsStackParams>();
export function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="ChartPreview" component={ChartPreview} />
      <Stack.Screen name="AiProviders" component={AiProvidersScreen} />
      <Stack.Screen name="AiProviderEditor" component={AiProviderEditor} />
      <Stack.Screen name="MarketProviders" component={MarketProvidersScreen} />
      <Stack.Screen name="MarketProviderEditor" component={MarketProviderEditor} />
      <Stack.Screen name="ProviderOAuth" component={ProviderOAuthScreen} />
      <Stack.Screen name="MarketPolicy" component={MarketPolicyScreen} />
      <Stack.Screen name="MarketCatalog" component={MarketCatalogScreen} />
      <Stack.Screen name="Automations" component={AutomationsScreen} />
      <Stack.Screen name="AutomationEditor" component={AutomationEditor} />
      <Stack.Screen name="AutomationHistory" component={AutomationHistoryScreen} />
      <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
    </Stack.Navigator>
  );
}
