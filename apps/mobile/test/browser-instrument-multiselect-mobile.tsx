import { type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContext } from '@react-navigation/native';
import { ArenaLiveSetupScreen } from '../src/features/model-arena/ArenaLiveSetupScreen';
import { ArenaSetupScreen } from '../src/features/model-arena/ArenaSetupScreen';

const navigation = { navigate: () => {}, replace: () => {}, isFocused: () => true, addListener: () => () => {} };
const requested = new URLSearchParams(location.search).get('view');
const props = { route: { params: undefined }, navigation };
const content = requested === 'ArenaDailyCreate'
  ? <ArenaSetupScreen {...(props as unknown as ComponentProps<typeof ArenaSetupScreen>)} />
  : <ArenaLiveSetupScreen {...(props as unknown as ComponentProps<typeof ArenaLiveSetupScreen>)} />;
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <NavigationContext.Provider value={navigation as unknown as ComponentProps<typeof NavigationContext.Provider>['value']}>
      <div style={{ display: 'flex', height: '100dvh', minWidth: 0 }}>{content}</div>
    </NavigationContext.Provider>
  </QueryClientProvider>,
);
