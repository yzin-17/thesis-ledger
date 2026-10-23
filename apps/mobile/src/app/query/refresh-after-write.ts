import type { QueryClient, QueryKey } from '@tanstack/react-query';

export function refreshAfterMobileWrite(client: QueryClient, scope: QueryKey) {
  // 行情估值可能等待外部来源；其刷新状态由组合 Query 自身呈现。
  const valuations = client.invalidateQueries(
    {
      queryKey: scope,
      predicate: (query) => query.queryKey[scope.length] === 'valuation',
    },
    { throwOnError: true },
  );
  void valuations.catch(() => undefined);
  return client.invalidateQueries(
    {
      queryKey: scope,
      predicate: (query) => query.queryKey[scope.length] !== 'valuation',
    },
    { throwOnError: true },
  );
}
