import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { formatDateTime } from '@/lib/date-display';
import { fetchOptimizationExperiments } from './strategy-optimization.api.js';
import { experimentProgressLabel, experimentSourceLabel, experimentStageLabel, experimentStatusLabel, experimentStatusVariant } from './strategy-list-presentation.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { StrategyVersionRecordRegion, useVersionRecordPage } from './StrategyVersionRecordRegion.js';

export function StrategyVersionExperiments({ strategyVersionId, canCreate }: { strategyVersionId: string; canCreate: boolean }) {
  const paging = useVersionRecordPage();
  const filters = { strategyVersionId, limit: 20, ...(paging.cursor ? { cursor: paging.cursor } : {}) };
  const query = useQuery({
    queryKey: ['desktop', 'strategy', 'optimization', 'experiments', filters],
    queryFn: ({ signal }) => fetchOptimizationExperiments(filters, undefined, signal),
    staleTime: 5_000,
    refetchInterval: (q) => q.state.data?.items.some((e) => !['succeeded', 'failed', 'cancelled', 'awaiting_finalization'].includes(e.status)) ? 30_000 : false,
  });
  const items = query.data?.items ?? [];
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-xl font-semibold">当前版本 AI 实验</h3>
      {canCreate && <Button nativeButton={false} render={<Link to={`${strategyCenterPath.newExperiment}?strategyVersionId=${encodeURIComponent(strategyVersionId)}`}>新建 AI 实验</Link>} />}
    </div>
    <StrategyVersionRecordRegion loading={query.isPending} refreshing={query.isFetching}
      error={query.error} empty={items.length === 0} label="AI 实验" retry={() => void query.refetch()}
      {...paging} nextCursor={query.data?.pageInfo.nextCursor}>
      <TableContainer><table className="w-full min-w-[680px] table-fixed text-sm">
        <TableHeader><tr><TableHead className="w-[32%]">实验名称</TableHead><TableHead className="w-[22%]">状态</TableHead><TableHead className="w-[24%]">进展与产出</TableHead><TableHead>创建时间</TableHead></tr></TableHeader>
        <tbody>{items.map((experiment) => <tr key={experiment.id} className="border-b last:border-0">
          <td className="px-4 py-3"><Link className="font-medium whitespace-normal wrap-anywhere text-foreground hover:text-primary/80" to={strategyCenterPath.experiment(experiment.id)}>{experiment.name}</Link><p className="mt-1 whitespace-normal wrap-anywhere text-xs text-muted-foreground">{experiment.baselineStrategyVersionId === strategyVersionId ? '基于此版本' : '生成此版本'} · {experimentSourceLabel(experiment)}</p></td>
          <td className="px-4 py-3"><Badge variant={experimentStatusVariant(experiment.status)}>{experimentStatusLabel(experiment.status)}</Badge><p className="mt-1 text-xs text-muted-foreground">{experimentStageLabel(experiment.stage)}</p></td>
          <td className="px-4 py-3">{experimentProgressLabel(experiment)}</td>
          <td className="px-4 py-3">{formatDateTime(experiment.createdAt)}</td>
        </tr>)}</tbody>
      </table></TableContainer>
    </StrategyVersionRecordRegion>
  </div>;
}
