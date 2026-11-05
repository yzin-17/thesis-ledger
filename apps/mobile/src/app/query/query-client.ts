import { QueryClient } from '@tanstack/react-query';

export function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: true },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
