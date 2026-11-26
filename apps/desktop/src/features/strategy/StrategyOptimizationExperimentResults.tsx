import { isStrategyCapabilityGap } from '@thesis-ledger/schemas';
import { formatDecimalRatioPercent } from '@thesis-ledger/domain';
import { StrategyCapabilityGap } from './StrategyCapabilityGap.js';
import { createClientRequestId } from '../../lib/client-request-id';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { OptimizationResearchDisclosure } from './OptimizationResearchDisclosure.js';
import { ExperimentFailureNotice } from './ExperimentFailureNotice.js';
import { ExperimentEvaluationNote } from './ExperimentEvaluationNote.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  AdoptionRiskApplicationDiff,
  OptimizationCandidate,
  OptimizationCompare,
  OptimizationExperimentSummary,
} from './strategy-optimization.api.js';
import {
  adoptOptimizationCandidate,
  completeOptimizationExperiment,
} from './strategy-optimization.api.js';
import {
  experimentCostText,
  experimentUsageText,
  optimizationAttemptExecutionText,
  tradingCostText,
  candidateAdoptionEligibility,
} from './strategy-experiment-detail.model.js';
const metricText = (value: unknown, currency = '基准币种') => {
  if (!value || typeof value !== 'object') return '指标不可用';
  const metric = value as Record<string, unknown>;
  return (
    [
      typeof metric.totalReturn === 'string' ? `收益 ${formatDecimalRatioPercent(metric.totalReturn)}` : null,
      typeof metric.maxDrawdown === 'string' ? `回撤 ${formatDecimalRatioPercent(metric.maxDrawdown)}` : null,
      typeof metric.turnoverRate === 'string' ? `区间双边资金周转率 ${formatDecimalRatioPercent(metric.turnoverRate)}` : null,
      typeof metric.tradedNotional === 'string' ? `成交额 ${metric.tradedNotional} ${currency}` : null,
      typeof metric.turnover === 'string' ? `成交额（旧口径） ${metric.turnover} ${currency}` : null,
      typeof metric.tradeCount === 'number' ? `交易 ${metric.tradeCount}` : null,
      typeof metric.fillCount === 'number' ? `成交 ${metric.fillCount}` : null,
      typeof metric.rejectedOrderCount === 'number' ? `拒绝 ${metric.rejectedOrderCount}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '指标不可用'
  );
};
const validationMetricText = (candidate: OptimizationCandidate, currency: string) =>
  metricText(candidate.metrics.validation, currency);
const metricCurrency = (config: unknown) =>
  config && typeof config === 'object' && 'baseCurrency' in config &&
  typeof config.baseCurrency === 'string' ? config.baseCurrency : '币种未记录';
const durationText = (durationMs: number) =>
  durationMs >= 1_000 ? `${(durationMs / 1_000).toFixed(1)}s` : `${durationMs}ms`;
const displayScalar = (value: unknown, fallback = '—') =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : fallback;
const riskRuleText = (value: unknown) => {
  if (!value || typeof value !== 'object') return '—';
  const rule = value as Record<string, unknown>;
  const identity = displayScalar(rule.label, displayScalar(rule.sourceKey, '规则'));
  const comparison =
    rule.operator !== undefined || rule.threshold !== undefined
      ? `${displayScalar(rule.operator)} ${displayScalar(rule.threshold)}`
      : null;
  const timeframeValue = displayScalar(rule.timeframe, '');
  const timeframe = timeframeValue ? `周期 ${timeframeValue}` : null;
  return [identity, comparison, timeframe].filter(Boolean).join(' · ');
};
const riskChangeText = (change: string) => {
  if (change === 'added') return '新增';
  if (change === 'removed') return '移除';
  if (change === 'changed') return '修改';
  return '无变化';
};

type Props = {
  experimentsRefreshing?: boolean;
  candidatesRefreshing?: boolean;
  experiments: OptimizationExperimentSummary[];
  compare?: OptimizationCompare | undefined;
  settledStatuses: ReadonlySet<string>;
  selectedExperimentId: string | null;
  versions: ReadonlyArray<{ version: { id: string; version: number } }>;
  onInvalidate: () => Promise<void>;
  onFeedback: (message: string) => void;
  onSelectExperiment: (id: string) => void;
  onCloneExperiment: (id: string) => void;
  clonePending: boolean;
  onCancelExperiment: (id: string) => void;
};

export function StrategyOptimizationExperimentResults({
  experimentsRefreshing = false,
  candidatesRefreshing = false,
  experiments,
  compare,
  settledStatuses,
  selectedExperimentId,
  versions,
  onInvalidate,
  onFeedback,
  onSelectExperiment,
  onCloneExperiment,
  clonePending,
  onCancelExperiment,
}: Props) {
  const [adoptionDiffs, setAdoptionDiffs] = useState<AdoptionRiskApplicationDiff[]>([]);
  const [adoptionIntentKeys, setAdoptionIntentKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    setAdoptionDiffs([]);
    setAdoptionIntentKeys({});
  }, [selectedExperimentId]);
  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!selectedExperimentId) throw new Error('实验不存在');
      return completeOptimizationExperiment(selectedExperimentId);
    },
    onSuccess: async () => {
      onFeedback('封存测试已完成；测试集结果已经揭示。');
      await onInvalidate();
    },
    onError: (error) => onFeedback(error instanceof Error ? error.message : '封存测试失败'),
  });
  const adoptMutation = useMutation({
    mutationFn: (candidate: OptimizationCandidate) => {
      if (!selectedExperimentId) throw new Error('未选择实验');
      const baseline = versions.find(
        (entry) => entry.version.id === compare?.experiment.baselineStrategyVersionId,
      );
      if (compare?.experiment.sourceMode !== 'discovery' && !baseline)
        throw new Error('找不到基线正式策略版本');
      const idempotencyKey = adoptionIntentKeys[candidate.id] ?? createClientRequestId();
      if (!adoptionIntentKeys[candidate.id])
        setAdoptionIntentKeys((current) => ({ ...current, [candidate.id]: idempotencyKey }));
      return adoptOptimizationCandidate(selectedExperimentId, {
        candidateId: candidate.id,
        candidateHash: candidate.executionHash,
        expectedStrategyVersion:
          compare?.experiment.sourceMode === 'discovery' ? 0 : baseline!.version.version,
        idempotencyKey,
        acknowledgeTestExposure: candidate.id !== compare?.experiment.selectedCandidateId,
      });
    },
    onSuccess: async (result, candidate) => {
      setAdoptionIntentKeys((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      setAdoptionDiffs(result.detailsStatus === 'ready' ? result.riskApplicationDiffs : []);
      onFeedback(
        result.detailsStatus === 'ready'
          ? `已采纳为正式策略 v${result.strategyVersion.version}；${result.riskApplicationDiffs.length} 个现有风险应用可查看升级差异，仍需人工确认。`
          : `正式策略 v${result.strategyVersion.version} 已保存；风险规则预览暂不可用，请稍后查看。`,
      );
      await onInvalidate();
    },
    onError: (error) => onFeedback(error instanceof Error ? error.message : '采纳候选失败'),
  });
  return (
    <>
      <OptimizationExperimentRecords
        experimentsRefreshing={experimentsRefreshing}
        experiments={experiments}
        compare={compare}
        settledStatuses={settledStatuses}
        onSelectExperiment={onSelectExperiment}
        onCloneExperiment={onCloneExperiment}
        clonePending={clonePending}
        onCancelExperiment={onCancelExperiment}
      />

      {compare ? (
        <Card>
          <CardHeader>
            <CardTitle>多模型候选对比</CardTitle>
            <CardDescription>
              {compare.experiment.sourceMode === 'discovery'
                ? `从零探索 · ${compare.experiment.discoveryScope?.executionInstrument.symbol ?? '未配置标的'} · ${compare.experiment.discoveryScope?.primaryTimeframe ?? '未配置周期'}`
                : '优化现有策略'}
              。{compare.note}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {compare.experiment.status === 'failed' ? (
              <ExperimentFailureNotice
                experiment={compare.experiment}
                disabled={candidatesRefreshing}
                onRetried={onInvalidate}
              />
            ) : null}
            <OptimizationResearchDisclosure runConfig={compare.experiment.runConfig} />
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">回测交易成本假设（与 AI 费用分开）</div>
              {tradingCostText(compare.experiment.tradingCost).map((line) => (
                <div key={line} className="mt-1">
                  {line}
                </div>
              ))}
            </div>
            {compare.experiment.testExposedAt ? (
              <div className="rounded-md border border-caution/40 bg-caution/5 p-3 text-sm">
                测试集已揭示。改选原预选候选之外的方案会显式记录测试暴露。
              </div>
            ) : null}
            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">基准策略</div>
                <Badge variant="outline">固定对照</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                验证集：{metricText(compare.baseline.metrics.validation, metricCurrency(compare.experiment.runConfig))}
              </div>
              {compare.baseline.metrics.test ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  测试集：{metricText(compare.baseline.metrics.test, metricCurrency(compare.experiment.runConfig))}
                </div>
              ) : null}
            </div>
            <ExperimentModelSummaries compare={compare} />
            <ListRefreshRegion
              refreshing={candidatesRefreshing}
              label="正在刷新实验候选"
              className="flex flex-col gap-3"
            >
              {compare.candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        候选 {candidate.candidateNumber} · {candidate.modelKey}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        验证集：{validationMetricText(candidate, metricCurrency(compare.experiment.runConfig))} · score{' '}
                        {candidate.validationScore ?? '—'}
                      </div>
                      {candidate.metrics.test ? (
                        <div className="text-xs text-muted-foreground">
                          测试集：{metricText(candidate.metrics.test, metricCurrency(compare.experiment.runConfig))}
                        </div>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        candidateAdoptionEligibility(compare.experiment, candidate)
                          ? 'outline'
                          : 'default'
                      }
                    >
                      {candidateAdoptionEligibility(compare.experiment, candidate) ?? '可采纳'}
                    </Badge>
                  </div>
                  <ExperimentEvaluationNote
                    metrics={(candidate.metrics.test ?? {}) as Record<string, unknown>}
                  />
                  <div className="mt-2">
                    <ExperimentCandidateDiff candidate={candidate} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!candidateAdoptionEligibility(compare.experiment, candidate) ? (
                      <Button
                        aria-busy={adoptMutation.isPending}
                        size="sm"
                        disabled={adoptMutation.isPending}
                        onClick={() => adoptMutation.mutate(candidate)}
                      >
                        {adoptMutation.isPending && (
                          <Spinner data-icon="inline-start" aria-hidden="true" />
                        )}
                        采纳为正式版本
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </ListRefreshRegion>
            {compare.experiment.stopReason?.startsWith('final_test_retry_required:') ? (
              <Button
                aria-busy={finalizeMutation.isPending}
                disabled={finalizeMutation.isPending}
                onClick={() => finalizeMutation.mutate()}
              >
                {finalizeMutation.isPending && (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                )}
                {finalizeMutation.isPending ? '测试中…' : '重试未完成测试'}
              </Button>
            ) : null}
            <AdoptionRiskUpgradeDiffs adoptionDiffs={adoptionDiffs} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
import { ExperimentCandidateDiff } from './StrategyExperimentCandidateDiff.js';

function OptimizationExperimentRecords({
  experimentsRefreshing = false,
  experiments,
  compare,
  settledStatuses,
  onSelectExperiment,
  onCloneExperiment,
  clonePending,
  onCancelExperiment,
}: Pick<
  Props,
  | 'experimentsRefreshing'
  | 'experiments'
  | 'compare'
  | 'settledStatuses'
  | 'onSelectExperiment'
  | 'onCloneExperiment'
  | 'clonePending'
  | 'onCancelExperiment'
>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>实验记录</CardTitle>
        <CardDescription>实验可恢复、可取消；测试集在用户锁定候选前不会运行。</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <ListRefreshRegion refreshing={experimentsRefreshing} label="正在刷新实验列表">
          <div className="divide-y divide-border">
            {experiments.map((experiment) => (
              <div
                key={experiment.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div>
                  <div className="font-medium">{experiment.stage}</div>
                  <div className="text-xs text-muted-foreground">
                    AI {experiment.aiCallsUsed} 次 · 回测 {experiment.backtestRunsUsed} 次 · Token{' '}
                    {experimentUsageText(
                      experiment,
                      compare?.experiment.id === experiment.id ? compare.attempts : [],
                    )}{' '}
                    · AI 费用 {experimentCostText(experiment.costSummary)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={experiment.status === 'succeeded' ? 'default' : 'outline'}>
                    {experiment.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectExperiment(experiment.id)}
                  >
                    查看
                  </Button>
                  <Button
                    aria-busy={clonePending}
                    size="sm"
                    variant="outline"
                    disabled={clonePending}
                    onClick={() => onCloneExperiment(experiment.id)}
                  >
                    {clonePending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                    克隆
                  </Button>
                  {!settledStatuses.has(experiment.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCancelExperiment(experiment.id)}
                    >
                      取消
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </ListRefreshRegion>
        {experiments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无优化实验。</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AdoptionRiskUpgradeDiffs({
  adoptionDiffs,
}: {
  adoptionDiffs: AdoptionRiskApplicationDiff[];
}) {
  return adoptionDiffs.length > 0 ? (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="font-medium">现有风险应用升级差异</div>
      {adoptionDiffs.map((application) => {
        const changed = application.diff.filter((item) => item.change !== 'unchanged');
        return (
          <details
            key={application.applicationId}
            className="rounded-md border p-2 text-xs text-muted-foreground"
          >
            <summary className="cursor-pointer select-none font-medium text-foreground">
              {application.symbol} · r{application.currentRevision} ·{' '}
              {application.enabled ? '监控中' : '已停用'} ·{' '}
              {changed.length === 0 ? '规则无变化' : `${changed.length} 项规则变化`}
            </summary>
            {changed.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                {changed.map((item) => (
                  <div key={item.sourceKey} className="rounded border p-2">
                    <div className="font-medium text-foreground">
                      {riskChangeText(item.change)} · {item.sourceKey}
                    </div>
                    <div className="mt-1">Before: {riskRuleText(item.before)}</div>
                    <div>After: {riskRuleText(item.after)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        );
      })}
      <p className="text-xs text-muted-foreground">
        这些差异不会自动覆盖或启用风险应用；请到“策略风险规则”中逐个确认升级。
      </p>
    </div>
  ) : null;
}

function ExperimentModelSummaries({ compare }: { compare: OptimizationCompare }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {compare.experiment.modelConfig.map((route) => {
        const key = `${route.provider}:${route.model}`;
        const attempts = compare.attempts.filter((attempt) => attempt.modelKey === key);
        const latest = attempts.at(-1);
        const aiCalls = attempts.filter((attempt) => Boolean(attempt.aiRunId)).length;
        const executionDisplays = attempts.map(optimizationAttemptExecutionText);
        const tokenText =
          executionDisplays.length > 0
            ? executionDisplays.map((display) => display.tokenText).join('；')
            : '尚未开始';
        const costText =
          executionDisplays.length > 0
            ? [...new Set(executionDisplays.flatMap((display) => display.costLines))].join('；')
            : '尚未开始';
        const knownDurations = attempts.flatMap((attempt) =>
          attempt.durationMs == null ? [] : [attempt.durationMs],
        );
        const durationMs = knownDurations.reduce((sum, value) => sum + value, 0);
        const durationSummary =
          knownDurations.length === attempts.length
            ? durationText(durationMs)
            : `${durationText(durationMs)}（部分耗时未知）`;
        return (
          <div key={key} className="rounded-md border p-3">
            <div className="font-medium">{key}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>AI calls</span>
              <span>{aiCalls}</span>
              <span>Input / Output</span>
              <span>{tokenText}</span>
              <span>Duration</span>
              <span>{durationSummary}</span>
              <span>AI 费用</span>
              <span>{costText}</span>
              <span>Latest status</span>
              <span>
                {isStrategyCapabilityGap(latest?.proposal)
                  ? '能力缺口'
                  : String(latest?.status ?? '尚未开始')}
              </span>
            </div>
            {latest?.error ? (
              <div className="mt-2 text-xs text-destructive">Failure: {String(latest.error)}</div>
            ) : null}
            <StrategyCapabilityGap value={latest?.proposal} />
          </div>
        );
      })}
    </div>
  );
}
