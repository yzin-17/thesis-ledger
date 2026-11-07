import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../MobileRuntime';
export function useMobileIdentity() {
  const { api, scope } = useMobileRuntime();
  const focused = useIsFocused();
  return useQuery({
    queryKey: [...scope, 'watchlist-identity'],
    queryFn: ({ signal }) =>
      api.request<{ principal: { id: string } | null }>('/identity/context', { signal }),
    enabled: focused,
    retry: false,
    staleTime: 0,
  });
}
