import { isStrategyCapabilityGap } from '@thesis-ledger/schemas';
import { StrategyCapabilityGap } from './StrategyCapabilityGap.js';
import type { OptimizationAdoptionContext } from '@thesis-ledger/schemas';
import { Link, useLocation, useParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/date-display';
import { cn } from '@/lib/utils';
import { AiExecutionFacts } from '../ai/AiExecutionFacts.js';
import type {
  OptimizationExperimentSummary,
  OptimizationAttempt,
} from './strategy-optimization.api.js';
import {
  experimentCostText,
  experimentUsageText,
  tradingCostText,
} from './strategy-experiment-detail.model.js';
import { backtestExperimentReturnState, strategyCenterPath } from './strategy-center.navigation.js';
import { ExperimentDefinitionDiffEntries } from './StrategyExperimentCandidateDiff.js';
export { ExperimentCandidateDiff } from './StrategyExperimentCandidateDiff.js';

const runSplitLabels: Record<string, string> = {
  development: '开发回测',
  validation: '验证回测',
  test: '封存测试',
};
const runSplitOrder: Record<string, number> = { development: 0, validation: 1, test: 2 };
const attemptStatusLabels: Record<string, string> = {
  reserved: '等待调用',
  running: '运行中',
  succeeded: '已成功',
  failed: '已失败',
  cancelled: '已取消',
  unknown_outcome: '结果未知',
};

export function ExperimentRunLinks({
  runRefs,
  className,
}: {
  runRefs: Record<string, string>;
  className?: string;
}) {
  const { experimentId } = useParams();
  const location = useLocation();
  const entries = Object.entries(runRefs).sort(
    ([left], [right]) => (runSplitOrder[left] ?? 3) - (runSplitOrder[right] ?? 3),
  );
  if (entries.length === 0) return <span className="text-muted-foreground">暂无回测记录</span>;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {entries.map(([split, jobId]) => (
        <Button
          key={`${split}:${jobId}`}
          nativeButton={false}
          render={
            <Link
              to={strategyCenterPath.job(jobId)}
              state={
                experimentId
                  ? backtestExperimentReturnState(experimentId, location.search)
                  : undefined
              }
            >
              {runSplitLabels[split] ?? '回测详情'}
            </Link>
          }
          variant="outline"
          size="xs"
        />
      ))}
    </div>
  );
}

function AdoptionDiffGroup({
  title,
  entries,
}: {
  title: string;
  entries: OptimizationAdoptionContext['candidateVsBaseline'];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="font-medium">{title}</div>
      <div className="mt-2">
        <ExperimentDefinitionDiffEntries entries={entries} beforeLabel="原值" />
      </div>
    </div>
  );
}

export function ExperimentAdoptionReview({
  context,
  acknowledgeExposure,
}: {
  context: OptimizationAdoptionContext;
  acknowledgeExposure: boolean;
}) {
  const currentChanged = context.current && context.current.id !== context.baseline.id;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-xs text-muted-foreground">实验基线</div>
          <div className="mt-1 font-medium">v{context.baseline.version}</div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-xs text-muted-foreground">当前正式版本</div>
          <div className="mt-1 font-medium">
            {context.current ? `v${context.current.version}` : '无正式版本'}
          </div>
          {currentChanged ? (
            <Badge className="mt-2" variant="outline">
              基线已变化
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-xs text-muted-foreground">待采纳候选</div>
          <div className="mt-1 font-medium">完整候选定义</div>
        </div>
      </div>
      <AdoptionDiffGroup title="候选相对实验基线" entries={context.candidateVsBaseline} />
      <AdoptionDiffGroup title="候选相对当前版本" entries={context.candidateVsCurrent} />
      {acknowledgeExposure ? (
        <div className="flex gap-2 bg-caution/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          已查看封存测试结果，确认后将记录本次测试后的采纳选择。
        </div>
      ) : null}
    </div>
  );
}

export function ExperimentRuntimeDetails({
  experiment,
  attempts,
}: {
  experiment: OptimizationExperimentSummary;
  attempts: OptimizationAttempt[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-label="运行概况" className="flex flex-col gap-4">
        <h3 className="text-xl font-medium">运行概况</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-4">
          <Card className="rounded-none border-0 bg-transparent py-0">
            <CardHeader className="px-0">
              <CardDescription>AI 调用</CardDescription>
              <CardTitle className="text-lg">{experiment.aiCallsUsed}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-none border-0 bg-transparent py-0">
            <CardHeader className="px-0">
              <CardDescription>回测运行</CardDescription>
              <CardTitle className="text-lg">{experiment.backtestRunsUsed}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-none border-0 bg-transparent py-0">
            <CardHeader className="px-0">
              <CardDescription>Token 输入 / 输出</CardDescription>
              <CardTitle className="text-lg">{experimentUsageText(experiment, attempts)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-none border-0 bg-transparent py-0">
            <CardHeader className="px-0">
              <CardDescription>AI 费用（已确认汇总）</CardDescription>
              <CardTitle className="text-lg">
                {experimentCostText(experiment.costSummary)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>
      <Separator />
      <section aria-label="回测交易成本假设" className="flex flex-col gap-4">
        <h3 className="text-xl font-medium">回测交易成本假设</h3>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {tradingCostText(experiment.tradingCost).map((line, index) => (
            <p
              key={line}
              className={cn(
                'text-sm leading-relaxed',
                index === 2 && 'text-xs text-muted-foreground sm:col-span-2',
              )}
            >
              {line}
            </p>
          ))}
        </div>
      </section>
      <Separator />
      <Card
        role="region"
        aria-label="模型路由与调用"
        className="gap-4 rounded-none border-0 bg-transparent py-0"
      >
        <CardHeader className="px-0">
          <CardTitle className="text-xl">模型路由与调用</CardTitle>
          <CardDescription>每次尝试独立保留状态、耗时、Token 和脱敏失败信息。</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border px-0">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="grid min-w-0 items-start gap-x-6 gap-y-2 py-4 text-sm first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_max-content_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <div className="min-w-0 break-words">
                <div className="font-medium">{attempt.modelKey}</div>
                <div className="text-xs text-muted-foreground">第 {attempt.attempt} 次尝试</div>
              </div>
              <Badge variant="outline" className="w-fit">
                {isStrategyCapabilityGap(attempt.proposal)
                  ? '能力缺口'
                  : (attemptStatusLabels[attempt.status] ?? '未知状态')}
              </Badge>
              <div className="min-w-0 break-words text-xs text-muted-foreground">
                耗时：{attempt.durationMs == null ? '未记录' : `${attempt.durationMs} ms`}
                <AiExecutionFacts
                  compact
                  {...(attempt.execution === undefined ? {} : { execution: attempt.execution })}
                  legacy={{
                    ...(attempt.inputTokens == null ? {} : { inputTokens: attempt.inputTokens }),
                    ...(attempt.outputTokens == null ? {} : { outputTokens: attempt.outputTokens }),
                  }}
                />
              </div>
              <div className="min-w-0 break-words text-xs text-muted-foreground">
                {isStrategyCapabilityGap(attempt.proposal)
                  ? '模型已保存能力报告'
                  : (attempt.error ?? '没有失败信息')}
              </div>
              <StrategyCapabilityGap value={attempt.proposal} />
            </div>
          ))}
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚无模型调用记录。</p>
          ) : null}
        </CardContent>
      </Card>
      <Separator />
      <Card
        role="region"
        aria-label="诊断与复现"
        className="gap-4 rounded-none border-0 bg-transparent py-0"
      >
        <CardHeader className="px-0">
          <CardTitle className="text-xl">诊断与复现</CardTitle>
          <CardDescription>内部标识保留在技术区域，不占用默认阅读路径。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 px-0 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="min-w-0 break-words">
            实验 ID：<span className="font-mono text-foreground">{experiment.id}</span>
          </div>
          <div className="min-w-0 break-words">
            基线版本 ID：
            <span className="font-mono text-foreground">
              {experiment.baselineStrategyVersionId}
            </span>
          </div>
          <div className="min-w-0 break-words">
            创建时间：{formatDateTime(experiment.createdAt, '未知')}
          </div>
          <div className="min-w-0 break-words">
            更新时间：{formatDateTime(experiment.updatedAt, '未知')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
