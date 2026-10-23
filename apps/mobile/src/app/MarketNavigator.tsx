import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MarketStackParams } from './navigation-types';
import { MarketScreen } from '../features/market/MarketScreen';
import { MarketDetailScreen } from '../features/market-detail/MarketDetailScreen';
import { MarketStaticScreen } from '../features/market-static/MarketStaticScreen';
import { MarketNewsScreen } from '../features/market-news/MarketNewsScreen';
import { AnnouncementsScreen } from '../features/market-news/AnnouncementsScreen';
import { DocumentsScreen } from '../features/market-news/DocumentsScreen';
const Stack = createNativeStackNavigator<MarketStackParams>();
export function MarketNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitle: '', headerBackTitle: '返回' }}>
      <Stack.Screen name="MarketHome" component={MarketScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MarketDetail" component={MarketDetailScreen} />
      <Stack.Screen name="MarketStatic" component={MarketStaticScreen} />
      <Stack.Screen name="MarketNews" component={MarketNewsScreen} />
      <Stack.Screen name="MarketAnnouncements" component={AnnouncementsScreen} />
      <Stack.Screen name="MarketDocuments" component={DocumentsScreen} />
    </Stack.Navigator>
  );
}
