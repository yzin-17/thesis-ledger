import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ArenaLiveScreen } from '../features/model-arena/ArenaLiveScreen';
import { ArenaLiveSetupScreen } from '../features/model-arena/ArenaLiveSetupScreen';
import { ArenaScreen } from '../features/model-arena/ArenaScreen';
export type ArenaStackParams = {
  ArenaHome: undefined;
  ArenaMatch: { match: string; entrant?: string };
  ArenaCreate: undefined;
  ModelArena: { match?: string; round?: string; entrant?: string } | undefined;
  ArenaSetup: undefined;
};
const Stack = createNativeStackNavigator<ArenaStackParams>();
export function ArenaNavigator() {
  return <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
    <Stack.Screen name="ArenaHome" component={ArenaLiveScreen} options={{ headerShown: false }} />
    <Stack.Screen name="ArenaMatch" component={ArenaLiveScreen} />
    <Stack.Screen name="ArenaCreate" component={ArenaLiveSetupScreen} />
    <Stack.Screen name="ModelArena" component={ArenaScreen} />
    <Stack.Screen name="ArenaSetup" component={ArenaLiveSetupScreen} />
  </Stack.Navigator>;
}
