import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
export function useStrategyLibrary() {
  const { api, scope } = useMobileRuntime();
  return useQuery({
    queryKey: [...scope, 'strategy-library'],
    queryFn: ({ signal }) => api.strategy.definitions.list(signal),
    retry: false,
  });
}
