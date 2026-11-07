import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  backtestNavPreparationResultV3Schema,
  backtestRunPreparationResultV3Schema,
  optimizationRunPreparationResultSchema,
  type StrategySubmissionReceipt,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { PreparedNavReview } from './NavBacktestSetupSections.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { submissionKey } from './use-strategy-submission.js';
import { BacktestLifecyclePreparationDisclosure } from './BacktestLifecyclePreparationDisclosure.js';

const labels = {
  queued: '已登记',
  preparing: '准备中',
  ready: '等待创建',
  creating: '正在创建',
  awaiting_confirmation: '待确认',
  submitted: '已提交',
  blocked: '已阻塞',
};
const names = { ordinary: '普通回测', nav: '净值回测', optimization: '优化实验' };
export function StrategySubmissionList() {
  const api = getDesktopApiClient().strategySubmissions;
  const list = useQuery({
    queryKey: submissionKey,
    queryFn: ({ signal }) => api.list(signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((r) => ['queued', 'ready', 'creating', 'preparing'].includes(r.state))
        ? 3000
        : false,
  });
  if (list.isError)
    return (
      <p role="status">
        后台提交记录读取失败{' '}
        <Button variant="link" onClick={() => void list.refetch()}>
          重新读取
        </Button>
      </p>
    );
  if (!list.data?.length) return null;
  return (
    <details
      open={list.data.some((r) => r.state === 'awaiting_confirmation') || undefined}
      className="mb-card rounded-md border p-3"
    >
      <summary>后台提交（{list.data.length}）</summary>
      {list.data.map((row) => (
        <Receipt key={row.id} row={row} refresh={() => void list.refetch()} />
      ))}
    </details>
  );
}
function Receipt({ row, refresh }: { row: StrategySubmissionReceipt; refresh: () => void }) {
  const [reviewed, setReviewed] = useState(false);
  const confirm = useMutation({
    mutationFn: () => getDesktopApiClient().strategySubmissions.confirm(row.id),
    retry: false,
    onSuccess: refresh,
  });
  const nav = backtestNavPreparationResultV3Schema.safeParse(row.prepared);
  const stock = backtestRunPreparationResultV3Schema.safeParse(row.prepared);
  const optimization = optimizationRunPreparationResultSchema.safeParse(row.prepared);
  const price =
    (stock.success && stock.data) || (optimization.success && optimization.data) || null;
  const outcome =
    row.outcome && typeof row.outcome === 'object' && !Array.isArray(row.outcome)
      ? row.outcome
      : null;
  const href = {
    nav: strategyCenterPath.navBacktestRun,
    ordinary: strategyCenterPath.job,
    optimization: strategyCenterPath.experiment,
  }[row.kind];
  const diagnostics = (nav.success && nav.data.status==='blocked' && nav.data.diagnostics) ||
    (price?.status==='blocked' && price.diagnostics) || [];
  const waiting = row.state === 'awaiting_confirmation';
  const value = nav.success && nav.data.status === 'prepared' ? nav.data : null;
  const expired = value?.receipt ? Date.parse(value.receipt.expiresAt) <= Date.now() : false;
  return (
    <div className="grid gap-1 border-t py-2">
      <p>
        {names[row.kind]} · {labels[row.state]} · {new Date(row.createdAt).toLocaleString('zh-CN')}
      </p>
      {outcome && typeof outcome.reason === 'string' && <p>{outcome.reason}</p>}
      {diagnostics.map((d,i)=><p key={i}>{d.message} {'suggestedActions' in d && d.suggestedActions.map(a=>a.description).join('；')}</p>)}
      {row.state === 'submitted' && typeof outcome?.id === 'string' && (
        <Link to={href(outcome.id)}>查看任务</Link>
      )}
      {waiting && value && (
        <PreparedNavReview
          prepared={value}
          reviewed={reviewed}
          onReviewedChange={setReviewed}
          receiptExpired={expired}
        />
      )}
      {waiting && price?.status === 'prepared' && (
        <>
          <p>
            {price.runConfig.startDate} 至 {price.runConfig.endDate} ·{' '}
            {price.actualSource.provenance.providerId} /{' '}
            {price.actualSource.provenance.upstreamSource} · 冻结于{' '}
            {new Date(price.runConfig.dataAsOf).toLocaleString('zh-CN')}
          </p>
          {price.runConfig.knownCashPreparation && (
            <p>
              分红记录 {price.runConfig.knownCashPreparation.input.records.length}{' '}
              条，覆盖未知；仅按已知登记资格和计划发放日模拟税前现金。
            </p>
          )}
          <BacktestLifecyclePreparationDisclosure config={price.runConfig} />
        </>
      )}
      {waiting && !value && price?.status!=='prepared' && <p>冻结资料无法核对，请重新读取。</p>}
      {waiting && (
        <Button
          variant="outline"
          disabled={confirm.isPending || expired || (!value && price?.status!=='prepared') || Boolean(value && !reviewed)}
          onClick={() => confirm.mutate()}
        >
          确认本次冻结输入并创建
        </Button>
      )}
      {confirm.isError && <p role="alert">{confirm.error.message}</p>}
    </div>
  );
}
