import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
export function useRiskRules() {
  const { api, scope } = useMobileRuntime();
  return useQuery({
    queryKey: [...scope, 'risk-rules'],
    queryFn: ({ signal }) => api.risk.getRules({ includeArchived: true }, signal),
  });
}
