import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { ArenaDetailHeader, ArenaNotice } from './ArenaDetailShell.js';
import { ArenaWeekReport } from './ArenaWeekReport.js';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { currentIdentitySession, subscribeIdentitySession } from '../../shared/api/identity-session.js';

export function ArenaWeekPage() {
  const origin = useLocation(), { match, id } = useParams();
  const api = getDesktopApiClient().modelArenas;
  const owner = useSyncExternalStore(subscribeIdentitySession, () => currentIdentitySession()?.principal.id ?? 'local-workspace');
  const root = ['desktop', window.location.origin, owner, 'model-weeklies', match];
  const list = useQuery({ queryKey: [...root, 'list'], enabled: !id, queryFn: ({ signal }) => api.weeklies(match, signal) });
  const item = useQuery({ queryKey: [...root, id], enabled: !!match && !!id, queryFn: ({ signal }) => api.weekly(match!, id!, signal) });
  const query = id ? item : list;
  let backPath = '/journal', backLabel = '返回投资复盘';
  if (id) { backPath = '/journal/model-weeklies/' + match; backLabel = '返回周报列表'; }
  else if (match) { backPath = '/arena/history/' + match + '?view=settings'; backLabel = '返回比赛'; }
  return <section className="grid min-w-0 gap-group text-sm">
    <ArenaDetailHeader title={item.data?.title ?? '模型周报'} backPath={backPath} backLabel={backLabel} actions={
      <RefreshIconButton label="刷新模型周报" refreshing={query.isFetching} onClick={() => void query.refetch()} />
    }>
      {item.data && <><span>{item.data.week} 当周</span><span>第 {item.data.revision} 版</span><span>{item.data.report.timeZone}</span></>}
    </ArenaDetailHeader>
    {!query.data && query.isPending && <LoadingState label="正在读取周报" />}
    {query.isError && <div role="alert" className="flex flex-wrap items-center gap-3"><p>周报读取失败。</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>重新读取周报</Button></div>}
    <ListRefreshRegion refreshing={query.isRefetching && Boolean(query.data)} label={id ? '正在刷新周报详情' : '正在刷新周报列表'} className="grid min-w-0 gap-3">
      {!id && list.data?.length === 0 && <ArenaNotice title="暂无已发布的周报">比赛生成周报后会显示在这里。</ArenaNotice>}
      {!id && list.data?.map((w) => <Link key={w.id} to={'/journal/model-weeklies/' + w.arenaId + '/' + w.id} className={buttonVariants({ variant: 'outline', className: 'h-auto min-w-0 justify-between gap-3 p-4 text-left whitespace-normal' })}>
        <span className="min-w-0 font-medium wrap-anywhere">{w.title}</span><span className="shrink-0 text-xs text-muted-foreground">{w.week} · 第 {w.revision} 版</span>
      </Link>)}
      {item.data && <ArenaWeekReport report={item.data.report} arenaId={item.data.arenaId} back={{ arenaReturn: origin.pathname + origin.search }} />}
    </ListRefreshRegion>
  </section>;
}
