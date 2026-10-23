import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import { Copy, Page, QueryStatus } from '../../components/MobilePrimitives';
import { TargetsForm } from './TargetsForm';
export function TargetsScreen() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'PerformanceTargets'>>();
  const { api, scope, mode } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === params.accountId);
  const valid = !params.accountId || Boolean(account);
  const query = useQuery({
    queryKey: [...scope, 'performance-target-editor', params.accountId],
    enabled: valid && accounts.isSuccess,
    queryFn: ({ signal }) =>
      api.performance.getTargets(
        { mode, ...(params.accountId ? { accountId: params.accountId } : {}) },
        signal,
      ),
  });
  const readable =
    valid &&
    canUseReadForWrite(accounts) &&
    canUseReadForWrite(query) &&
    (!params.accountId || Boolean(account?.active));
  return (
    <Page title="配置目标">
      <Copy>
        {params.accountId ? (account?.name ?? '账户不在当前范围') : '组合目标 · 实际与模拟共享'}
      </Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.data ? (
        <TargetsForm
          key={`${scope.join(':')}:${params.accountId}`}
          data={query.data}
          accountId={params.accountId}
          readable={readable}
          reload={async () => {
            const result = await query.refetch();
            return !result.isError && result.data ? result.data : null;
          }}
        />
      ) : null}
    </Page>
  );
}
