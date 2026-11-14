import { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArenaLiveScreen } from '../src/features/model-arena/ArenaLiveScreen';
import { ArenaLiveSetupScreen } from '../src/features/model-arena/ArenaLiveSetupScreen';
import { ArenaSetupScreen } from '../src/features/model-arena/ArenaSetupScreen';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
Object.assign(window, { arenaLiveRefresh: () => client.invalidateQueries() });
function Fixture() {
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(location.search).get('view');
    return requested === 'ArenaCreate' || requested === 'ArenaDailyCreate' ? requested : 'ArenaMatch';
  });
  const [match, setMatch] = useState(new URLSearchParams(location.search).get('match') ?? '');
  const navigation = { navigate: (name: string, params?: { match?: string }) => { setView(name); if (params?.match) setMatch(params.match); }, replace: (name: string, params?: { match?: string }) => { setView(name); if (params?.match) setMatch(params.match); } };
  if (view === 'ArenaCreate') return <ArenaLiveSetupScreen {...({ route: { params: undefined }, navigation } as unknown as ComponentProps<typeof ArenaLiveSetupScreen>)} />;
  if (view === 'ArenaDailyCreate') return <ArenaSetupScreen {...({ route: { params: undefined }, navigation } as unknown as ComponentProps<typeof ArenaSetupScreen>)} />;
  return <ArenaLiveScreen {...({ route: { params: view === 'ArenaHome' ? undefined : { match } }, navigation } as unknown as ComponentProps<typeof ArenaLiveScreen>)} />;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><div style={{ display: 'flex', height: '100dvh', minWidth: 0 }}><Fixture /></div></QueryClientProvider>);
