import type { OptimizationAdoptionContext } from '@thesis-ledger/schemas';
import { Link } from 'react-router';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/date-display';
import { AiExecutionFacts } from '../ai/AiExecutionFacts.js';
import type {
  OptimizationCandidate,
  OptimizationExperimentSummary,
  OptimizationAttempt,
} from './strategy-optimization.api.js';
import {
  experimentCostText,
  experimentUsageText,
  scalarText,
  tradingCostText,
} from './strategy-experiment-detail.model.js';
import { strategyCenterPath } from './strategy-center.navigation.js';

export function ExperimentRunLinks({ runRefs }: { runRefs: Record<string, string> }) {
  const entries = Object.entries(runRefs);
  if (entries.length === 0) return <span className="text-muted-foreground">暂无回测记录</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([split, jobId]) => (
        <Button
          key={`${split}:${jobId}`}
          nativeButton={false}
          render={
            <Link to={`${strategyCenterPath.jobs}?jobId=${encodeURIComponent(jobId)}`}>
              {split} 回测
              <ExternalLink aria-hidden="true" />
            </Link>
          }
          variant="outline"
          size="xs"
        />
      ))}
    </div>
  );
}

export function ExperimentCandidateDiff({ candidate }: { candidate: OptimizationCandidate }) {
  return (
    <details className="rounded-md border bg-muted/20 px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium">查看完整参数差异</summary>
      <div className="mt-3 space-y-2">
        {candidate.diff.map((item, index) => (
          <div
            key={`${String(item.parameterId ?? item.path ?? item.kind)}:${index}`}
            className="grid gap-1 rounded border bg-background p-2 text-xs sm:grid-cols-[minmax(130px,0.8fr)_1fr_1fr]"
          >
            <span className="font-medium text-foreground">
              {scalarText(item.label ?? item.parameterId ?? item.path ?? item.kind, '策略定义')}
            </span>
            <span className="break-all text-muted-foreground">
              原值：
              {scalarText(item.before, item.kind === 'full-strategy' ? '完整基线定义' : '无')}
            </span>
            <span className="break-all text-muted-foreground">
              新值：
              {scalarText(item.after, item.kind === 'full-strategy' ? '完整候选定义' : '无')}
            </span>
          </div>
        ))}
        {candidate.diff.length === 0 ? (
          <p className="text-xs text-muted-foreground">此候选没有服务端记录的参数差异。</p>
        ) : null}
      </div>
    </details>
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
    <div className="rounded-md border p-3">
      <div className="font-medium">{title}</div>
      <div className="mt-2 space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.path}
            className="grid gap-1 rounded bg-muted/40 p-2 text-xs sm:grid-cols-[minmax(150px,0.7fr)_1fr_1fr]"
          >
            <span className="font-mono text-foreground">{entry.path}</span>
            <span className="break-all text-muted-foreground">
              原值：{scalarText(entry.before)}
            </span>
            <span className="break-all text-muted-foreground">候选：{scalarText(entry.after)}</span>
          </div>
        ))}
        {entries.length === 0 ? <p className="text-xs text-muted-foreground">没有差异。</p> : null}
      </div>
    </div>
  );
}

export function ExperimentAdoptionReview({
  context,
  pending,
  acknowledgeExposure,
  onConfirm,
  onCancel,
}: {
  context: OptimizationAdoptionContext;
  pending: boolean;
  acknowledgeExposure: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const currentChanged = context.current && context.current.id !== context.baseline.id;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>确认采纳候选</CardTitle>
        <CardDescription>
          新版本采用候选的完整策略定义，不自动合并实验开始后对正式版本所做的修改。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">实验基线</div>
            <div className="mt-1 font-medium">v{context.baseline.version}</div>
          </div>
          <div className="rounded-md border p-3">
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
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">待采纳候选</div>
            <div className="mt-1 font-medium">完整候选定义</div>
          </div>
        </div>
        <AdoptionDiffGroup title="候选相对实验基线" entries={context.candidateVsBaseline} />
        <AdoptionDiffGroup title="候选相对当前版本" entries={context.candidateVsCurrent} />
        {acknowledgeExposure ? (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            当前候选不是测试前预选候选。确认后会记录测试结果暴露下的改选。
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            返回候选
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? '正在采纳…' : '确认采纳'}
          </Button>
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>AI 调用</CardDescription>
            <CardTitle className="text-lg">{experiment.aiCallsUsed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>回测运行</CardDescription>
            <CardTitle className="text-lg">{experiment.backtestRunsUsed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Token 输入 / 输出</CardDescription>
            <CardTitle className="text-lg">{experimentUsageText(experiment, attempts)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>AI 费用（已确认汇总）</CardDescription>
            <CardTitle className="text-lg">{experimentCostText(experiment.costSummary)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>回测交易成本假设</CardDescription>
            <CardTitle className="flex flex-col gap-1 text-sm">
              {tradingCostText(experiment.tradingCost).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>模型路由与调用</CardTitle>
          <CardDescription>每次尝试独立保留状态、耗时、Token 和脱敏失败信息。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[minmax(180px,1fr)_100px_minmax(240px,1fr)_minmax(180px,1fr)]"
            >
              <div>
                <div className="font-medium">{attempt.modelKey}</div>
                <div className="text-xs text-muted-foreground">第 {attempt.attempt} 次尝试</div>
              </div>
              <Badge variant="outline" className="w-fit">
                {attempt.status}
              </Badge>
              <div className="text-xs text-muted-foreground">
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
              <div className="text-xs text-muted-foreground">{attempt.error ?? '没有失败信息'}</div>
            </div>
          ))}
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚无模型调用记录。</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>诊断与复现</CardTitle>
          <CardDescription>内部标识保留在技术区域，不占用默认阅读路径。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded border p-2">
            实验 ID：<span className="font-mono text-foreground">{experiment.id}</span>
          </div>
          <div className="rounded border p-2">
            基线版本 ID：
            <span className="font-mono text-foreground">
              {experiment.baselineStrategyVersionId}
            </span>
          </div>
          <div className="rounded border p-2">
            创建时间：{formatDateTime(experiment.createdAt, '未知')}
          </div>
          <div className="rounded border p-2">
            更新时间：{formatDateTime(experiment.updatedAt, '未知')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
