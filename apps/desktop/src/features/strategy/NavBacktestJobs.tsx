import { Link } from 'react-router';
import type { BacktestNavRunSummaryV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { useNavBacktestRunsQuery } from './strategy.nav.queries.js';
import { strategyCenterPath } from './strategy-center.navigation.js';

export function NavBacktestJobsPage() {
  const query = useNavBacktestRunsQuery();

  if (query.isPending) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        正在读取基金净值回测历史…
      </div>
    );
  }
  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法读取基金净值回测历史</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{errorText(query.error, '请检查服务连接后重新读取。')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? '正在读取…' : '重新读取'}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">基金净值回测历史</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            打开任一历史任务，可继续查看结果、来源与研究假设。
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link to={strategyCenterPath.library}>返回策略库</Link>}
          variant="outline"
        />
      </div>
      {query.data && query.data.length > 0 ? (
        <NavBacktestJobsTable runs={query.data} />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>还没有基金净值回测任务</EmptyTitle>
            <EmptyDescription>
              从基金策略版本进入基金净值回测，完成准备和确认后，任务会保留在这里。
            </EmptyDescription>
          </EmptyHeader>
          <Button
            nativeButton={false}
            render={<Link to={strategyCenterPath.library}>浏览策略库</Link>}
          />
        </Empty>
      )}
    </div>
  );
}

export function NavBacktestJobsTable({ runs }: { runs: BacktestNavRunSummaryV3[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">NAV 任务</CardTitle>
        <CardDescription>按创建时间从新到旧排列；进行中的任务会自动刷新。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>基金</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>回测区间</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>最近更新</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.symbol}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'}>
                        {statusLabel(run.status)}
                      </Badge>
                      {run.status === 'queued' || run.status === 'running' ? (
                        <span className="text-xs text-muted-foreground">
                          {stageLabel(run.stage)} · {run.progress}%
                        </span>
                      ) : null}
                      {run.errorSummary ? (
                        <span className="max-w-64 whitespace-normal text-xs text-destructive">
                          {run.errorSummary}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDateOnly(run.periodStart)} 至 {formatDateOnly(run.periodEnd)}
                  </TableCell>
                  <TableCell>{formatDateTime(run.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(run.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      nativeButton={false}
                      render={<Link to={strategyCenterPath.navBacktestRun(run.id)}>打开任务</Link>}
                      size="sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function statusLabel(status: BacktestNavRunSummaryV3['status']) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '运行中';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '失败';
  return '已取消';
}

function stageLabel(stage: string | null) {
  if (!stage || stage === 'queued') return '等待执行';
  if (stage === 'loading-snapshot') return '准备运行数据';
  if (stage === 'executing') return '模拟申购与赎回';
  if (stage === 'persisting-result') return '整理回测结果';
  return '正在运行';
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
