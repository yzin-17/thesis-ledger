import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArenaLivePage } from '../src/features/model-arena/ArenaLivePage';
import { ArenaWeekPage } from '../src/features/model-arena/ArenaWeekPage';
import '../src/ui/styles.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
Object.assign(window, { arenaLiveRefresh: () => client.invalidateQueries({ queryKey: ['desktop'] }) });
function NavigationProbe() {
  const location = useLocation(), navigate = useNavigate();
  useEffect(() => { Object.assign(window, { arenaLiveLocation: () => location.pathname + location.search + location.hash, arenaLiveHistory: (delta: number) => navigate(delta) }); }, [location, navigate]);
  return null;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[new URLSearchParams(location.search).get('path') ?? '/arena']}>
  <QueryClientProvider client={client}><NavigationProbe /><main className="mx-auto min-w-0 max-w-7xl p-4 sm:p-6"><Routes><Route path="/arena/*" element={<ArenaLivePage />} /><Route path="/journal/model-weeklies/:match?/:id?" element={<ArenaWeekPage />} /></Routes></main></QueryClientProvider>
</MemoryRouter>);
