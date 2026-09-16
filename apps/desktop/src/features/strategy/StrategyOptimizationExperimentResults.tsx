import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
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
  finalizeOptimizationExperiment,
} from './strategy-optimization.api.js';

const metricText = (value: unknown) => {
  if (!value || typeof value !== 'object') return '指标不可用';
  const metric = value as Record<string, unknown>;
  return (
    [
      typeof metric.totalReturn === 'string' ? `收益 ${metric.totalReturn}` : null,
      typeof metric.maxDrawdown === 'string' ? `回撤 ${metric.maxDrawdown}` : null,
      typeof metric.turnover === 'string' ? `换手 ${metric.turnover}` : null,
      typeof metric.tradeCount === 'number' ? `交易 ${metric.tradeCount}` : null,
      typeof metric.fillCount === 'number' ? `成交 ${metric.fillCount}` : null,
      typeof metric.rejectedOrderCount === 'number' ? `拒绝 ${metric.rejectedOrderCount}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '指标不可用'
  );
};
const validationMetricText = (candidate: OptimizationCandidate) =>
  metricText(candidate.metrics.validation);
const numericValue = (value: string | number | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
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
const riskChangeText = (change: string) =>
  change === 'added'
    ? '新增'
    : change === 'removed'
      ? '移除'
      : change === 'changed'
        ? '修改'
        : '无变化';

type Props = {
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
  const [lockedCandidateIds, setLockedCandidateIds] = useState<string[]>([]);
  const [preselectedCandidateId, setPreselectedCandidateId] = useState<string | null>(null);
  const [adoptionDiffs, setAdoptionDiffs] = useState<AdoptionRiskApplicationDiff[]>([]);
  const [adoptionIntentKeys, setAdoptionIntentKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    setAdoptionDiffs([]);
    setAdoptionIntentKeys({});
  }, [selectedExperimentId]);
  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!selectedExperimentId || !preselectedCandidateId || lockedCandidateIds.length === 0)
        throw new Error('请选择进入封存测试的候选，并预选最终候选');
      return finalizeOptimizationExperiment(selectedExperimentId, {
        candidateIds: lockedCandidateIds,
        selectedCandidateId: preselectedCandidateId,
        expectedStage: 'awaiting_finalization',
      });
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
      const idempotencyKey = adoptionIntentKeys[candidate.id] ?? crypto.randomUUID();
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
      setAdoptionDiffs(result.riskApplicationDiffs ?? []);
      onFeedback(
        `已采纳为正式策略 v${result.strategyVersion.version}；${result.riskApplicationDiffs.length} 个现有风险应用可查看升级差异，仍需人工确认。`,
      );
      await onInvalidate();
    },
    onError: (error) => onFeedback(error instanceof Error ? error.message : '采纳候选失败'),
  });
  const toggleLockedCandidate = (id: string) =>
    setLockedCandidateIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length < 3) return [...current, id];
      return current;
    });
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>实验记录</CardTitle>
          <CardDescription>实验可恢复、可取消；测试集在用户锁定候选前不会运行。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {experiments.map((experiment) => (
            <div
              key={experiment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <div className="font-medium">{experiment.stage}</div>
                <div className="text-xs text-muted-foreground">
                  AI {experiment.aiCallsUsed} 次 · 回测 {experiment.backtestRunsUsed} 次 · Token{' '}
                  {experiment.inputTokensUsed}/{experiment.outputTokensUsed} ·{' '}
                  {experiment.modelConfig.some((route) => route.costStatus === 'unknown')
                    ? '成本 未知'
                    : `成本 ${String(experiment.costUsed)}`}
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
                  size="sm"
                  variant="outline"
                  disabled={clonePending}
                  onClick={() => onCloneExperiment(experiment.id)}
                >
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
          {experiments.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无优化实验。</p>
          ) : null}
        </CardContent>
      </Card>

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
            {compare.experiment.testExposedAt ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                测试集已揭示。改选原预选候选之外的方案会显式记录测试暴露。
              </div>
            ) : null}
            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">基准策略</div>
                <Badge variant="outline">固定对照</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                验证集：{metricText(compare.baseline.metrics.validation)}
              </div>
              {compare.baseline.metrics.test ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  测试集：{metricText(compare.baseline.metrics.test)}
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {compare.experiment.modelConfig.map((route) => {
                const key = `${route.provider}:${route.model}`;
                const attempts = compare.attempts.filter((attempt) => attempt.modelKey === key);
                const latest = attempts.at(-1);
                const aiCalls = attempts.filter((attempt) => Boolean(attempt.aiRunId)).length;
                const inputTokens = attempts.reduce(
                  (sum, attempt) => sum + (attempt.inputTokens ?? 0),
                  0,
                );
                const outputTokens = attempts.reduce(
                  (sum, attempt) => sum + (attempt.outputTokens ?? 0),
                  0,
                );
                const durationMs = attempts.reduce(
                  (sum, attempt) => sum + (attempt.durationMs ?? 0),
                  0,
                );
                const costUnknown =
                  route.costStatus === 'unknown' ||
                  attempts.some((attempt) => attempt.modelMetadata?.costStatus === 'unknown');
                const cost = attempts.reduce((sum, attempt) => sum + numericValue(attempt.cost), 0);
                return (
                  <div key={key} className="rounded-md border p-3">
                    <div className="font-medium">{key}</div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>AI calls</span>
                      <span>{aiCalls}</span>
                      <span>Input / Output</span>
                      <span>
                        {inputTokens} / {outputTokens}
                      </span>
                      <span>Duration</span>
                      <span>{durationText(durationMs)}</span>
                      <span>Cost</span>
                      <span>{costUnknown ? '费用未知' : cost.toFixed(4)}</span>
                      <span>Latest status</span>
                      <span>{String(latest?.status ?? '尚未开始')}</span>
                    </div>
                    {latest?.error ? (
                      <div className="mt-2 text-xs text-destructive">
                        Failure: {String(latest.error)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {compare.candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      候选 {candidate.candidateNumber} · {candidate.modelKey}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      验证集：{validationMetricText(candidate)} · score{' '}
                      {candidate.validationScore ?? '—'}
                    </div>
                    {candidate.metrics.test ? (
                      <div className="text-xs text-muted-foreground">
                        测试集：{metricText(candidate.metrics.test)}
                      </div>
                    ) : null}
                  </div>
                  <Badge
                    variant={candidate.validationStatus.includes('valid') ? 'default' : 'outline'}
                  >
                    {candidate.validationStatus}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {candidate.diff.length > 0
                    ? candidate.diff
                        .map((item) =>
                          item.kind === 'full-strategy'
                            ? '完整 StrategySchemaV2 候选'
                            : `${String(item.label ?? item.parameterId)}: ${String(item.before)} → ${String(item.after)}`,
                        )
                        .join('；')
                    : '无参数变化'}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {compare.experiment.stage === 'awaiting_finalization' &&
                  candidate.validationStatus === 'valid' ? (
                    <>
                      <Button
                        size="sm"
                        variant={lockedCandidateIds.includes(candidate.id) ? 'default' : 'outline'}
                        onClick={() => toggleLockedCandidate(candidate.id)}
                      >
                        进入封存测试
                      </Button>
                      <Button
                        size="sm"
                        variant={preselectedCandidateId === candidate.id ? 'default' : 'outline'}
                        onClick={() => {
                          setPreselectedCandidateId(candidate.id);
                          if (!lockedCandidateIds.includes(candidate.id))
                            toggleLockedCandidate(candidate.id);
                        }}
                      >
                        预选最终候选
                      </Button>
                    </>
                  ) : null}
                  {compare.experiment.status === 'succeeded' &&
                  candidate.validationStatus === 'test_valid' ? (
                    <Button
                      size="sm"
                      disabled={adoptMutation.isPending}
                      onClick={() => adoptMutation.mutate(candidate)}
                    >
                      采纳为正式版本
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {compare.experiment.stage === 'awaiting_finalization' ? (
              <Button
                disabled={
                  finalizeMutation.isPending ||
                  !preselectedCandidateId ||
                  lockedCandidateIds.length === 0
                }
                onClick={() => finalizeMutation.mutate()}
              >
                {finalizeMutation.isPending ? '测试中…' : '锁定候选并运行测试集'}
              </Button>
            ) : null}
            {adoptionDiffs.length > 0 ? (
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
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
