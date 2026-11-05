import { matchQuery, useIsFetching, useQueryClient, type QueryFilters } from '@tanstack/react-query';

/** 页面声明只读范围，调度当前已启用且正在展示的查询，查询自身保留筛选与分页。 */
export function usePageRefresh(scopes: readonly QueryFilters[]) {
  const client = useQueryClient();
  const filter: QueryFilters = {
    type: 'active',
    predicate: (query) => scopes.some((scope) => matchQuery(scope, query)),
  };
  const refreshing = useIsFetching(filter) > 0;
  const refresh = () => client.refetchQueries(filter);
  return { refreshing, refresh };
}
