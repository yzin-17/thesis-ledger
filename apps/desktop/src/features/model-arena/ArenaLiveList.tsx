import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { PageHeader } from '../shared/PageHeader.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { ArenaCatalogControls, ArenaCatalogPagination } from './ArenaCatalogControls.js';
import { ArenaCatalogTable } from './ArenaCatalogTable.js';
import { readArenaCatalogParams, updateArenaCatalogParams } from './arena-catalog-navigation.js';

export function ArenaLiveList({ scope }: { scope: string[] }) {
  const [params, setParams] = useSearchParams(), filters = readArenaCatalogParams(params);
  const query = useQuery({ queryKey: [...scope, 'catalog', filters],
    queryFn: ({ signal }) => getDesktopApiClient().arenaMatches.catalog(filters, signal) });
  const data = query.data, returnPath = '/arena' + (params.size ? '?' + params.toString() : '');
  const change = (name: string, value: string | number) => setParams((current) => updateArenaCatalogParams(current, { [name]: value }));
  const clear = () => setParams((current) => updateArenaCatalogParams(current, { search: '', kind: 'all', market: 'all', state: 'all' }));
  useEffect(() => {
    if (params.has('sort') || data && data.page !== filters.page)
      setParams((current) => updateArenaCatalogParams(current, { page: data?.page ?? filters.page }), { replace: true });
  }, [data, filters.page, params, setParams]);
  const empty = data && data.total === 0 && data.totalUnfiltered === 0;

  return <>
    <PageHeader eyebrow="MODEL ARENA" title="模型竞技场" className="mb-card" actions={
      <RefreshIconButton label="刷新比赛" refreshing={query.isFetching} onClick={() => void query.refetch()} />
    } />
    <ArenaCatalogControls query={filters} onChange={change} onClear={clear} actions={
      <Link to="/arena/new" state={{ arenaReturn: returnPath }} className={buttonVariants()}><Plus data-icon="inline-start" aria-hidden="true" />新建模拟比赛</Link>
    } />
    <ListRefreshRegion refreshing={Boolean(data) && query.isFetching} label="正在刷新比赛列表" className="grid gap-3">
      {!data && query.isPending && <LoadingState label="正在读取比赛" />}
      {query.isError && <p role="alert" className="text-sm text-destructive">比赛读取失败，筛选条件已保留，请刷新重试。</p>}
      {data && data.total === 0 && <Empty className="p-6 sm:p-8">
        <EmptyHeader><EmptyTitle>{empty ? '暂无比赛' : '没有匹配的比赛'}</EmptyTitle>
          <EmptyDescription>{empty ? '创建一场比赛，让不同模型独立管理模拟账户并持续比较收益。' : '请调整关键词、类型、市场或状态，或清空筛选。'}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
      {data && data.items.length > 0 && <ArenaCatalogTable items={data.items} returnPath={returnPath} />}
    </ListRefreshRegion>
    {data && <ArenaCatalogPagination data={data} query={filters} busy={query.isFetching} onChange={change} />}
  </>;
}
