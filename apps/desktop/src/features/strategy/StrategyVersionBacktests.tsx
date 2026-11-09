import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { formatDateTime } from '@/lib/date-display';
import { fetchStrategyBacktestGroups } from './strategy-optimization.api.js';
import { BacktestResultCell, BacktestStatusCell } from './StrategyListPresentation.js';
import { backtestPeriodLabel } from './strategy-list-presentation.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { StrategyVersionRecordRegion, useVersionRecordPage } from './StrategyVersionRecordRegion.js';

export function StrategyVersionBacktests({ strategyVersionId }: { strategyVersionId: string }) {
  const paging = useVersionRecordPage();
  const filters = { strategyVersionId, limit: 20, ...(paging.cursor ? { cursor: paging.cursor } : {}) };
  const query = useQuery({
    queryKey: ['desktop', 'strategy', 'backtest-groups', filters],
    queryFn: ({ signal }) => fetchStrategyBacktestGroups(filters, undefined, signal),
    staleTime: 5_000,
    refetchInterval: (q) => q.state.data?.items.some((g) => g.jobs.some((j) => !['succeeded', 'failed', 'cancelled'].includes(j.status))) ? 30_000 : false,
  });
  const jobs = (query.data?.items ?? []).flatMap((group) => group.jobs).filter((job) => job.strategyVersionId === strategyVersionId);
  return <div className="flex min-w-0 flex-col gap-4">
    <h3 className="text-xl font-semibold">当前版本回测</h3>
    <StrategyVersionRecordRegion loading={query.isPending} refreshing={query.isFetching}
      error={query.error} empty={jobs.length === 0} label="回测记录" retry={() => void query.refetch()}
      {...paging} nextCursor={query.data?.pageInfo.nextCursor}>
      <TableContainer><table className="w-full min-w-[680px] table-fixed text-sm">
        <TableHeader><tr><TableHead className="w-[24%]">发起时间</TableHead><TableHead className="w-[28%]">回测区间</TableHead><TableHead className="w-[16%]">状态</TableHead><TableHead>结果摘要</TableHead></tr></TableHeader>
        <tbody>{jobs.map((job) => <tr key={job.id} className="border-b last:border-0">
          <td className="px-4 py-3"><Link className="font-medium text-foreground hover:text-primary/80" to={strategyCenterPath.job(job.id)}>{formatDateTime(job.createdAt, '查看任务详情')}</Link></td>
          <td className="px-4 py-3">{backtestPeriodLabel(job)}</td>
          <td className="px-4 py-3"><BacktestStatusCell job={job} /></td>
          <td className="px-4 py-3"><BacktestResultCell job={job} /></td>
        </tr>)}</tbody>
      </table></TableContainer>
    </StrategyVersionRecordRegion>
  </div>;
}
