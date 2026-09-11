import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runConfigSchemaV2, strategySchemaV2, type OptimizationExperimentCreate } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  adoptOptimizationCandidate,
  cancelOptimizationExperiment,
  createOptimizationExperiment,
  fetchOptimizationCapabilities,
  fetchOptimizationCompare,
  fetchOptimizationExperiments,
  fetchStrategyOptimizationParameters,
  finalizeOptimizationExperiment,
  type OptimizationCandidate,
} from './strategy-optimization.api.js';
import type { StrategyRecord } from './strategy.types.js';

const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};
const addDays = (dateOnly: string, days: number) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};
const metricText = (candidate: OptimizationCandidate) => {
  const validation = candidate.metrics?.validation;
  if (!validation || typeof validation !== 'object') return '验证指标不可用';
  const value = validation as Record<string, unknown>;
  const parts = [
    typeof value.totalReturn === 'string' ? `收益 ${value.totalReturn}` : null,
    typeof value.maxDrawdown === 'string' ? `回撤 ${value.maxDrawdown}` : null,
    typeof value.tradeCount === 'number' ? `交易 ${value.tradeCount}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || '验证指标不可用';
};

export function StrategyOptimizationExperimentPanel({ strategies }: { strategies: StrategyRecord[] }) {
  const queryClient = useQueryClient();
  const versions = useMemo(
    () =>
      strategies.flatMap((strategy) =>
        strategy.versions
          .filter((version) => version.version > 0 && version.schemaVersion === 2 && version.schema)
          .map((version) => ({ strategy, version })),
      ),
    [strategies],
  );
  const [strategyVersionId, setStrategyVersionId] = useState(versions[0]?.version.id ?? '');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [objective, setObjective] = useState<'return' | 'drawdown' | 'balanced' | 'lowTurnover'>('balanced');
  const [startDate, setStartDate] = useState(daysAgo(360));
  const [developmentEnd, setDevelopmentEnd] = useState(daysAgo(181));
  const [validationEnd, setValidationEnd] = useState(daysAgo(91));
  const [endDate, setEndDate] = useState(daysAgo(1));
  const [initialCash, setInitialCash] = useState('100000');
  const [executionModelJson, setExecutionModelJson] = useState('');
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [lockedCandidateIds, setLockedCandidateIds] = useState<string[]>([]);
  const [preselectedCandidateId, setPreselectedCandidateId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const capabilities = useQuery({
    queryKey: [...optimizationKey, 'capabilities'],
    queryFn: () => fetchOptimizationCapabilities(),
    staleTime: 30_000,
  });
  const parameters = useQuery({
    queryKey: [...optimizationKey, 'parameters', strategyVersionId],
    queryFn: () => fetchStrategyOptimizationParameters(strategyVersionId),
    enabled: Boolean(strategyVersionId),
  });
  const experiments = useQuery({
    queryKey: [...optimizationKey, 'experiments'],
    queryFn: () => fetchOptimizationExperiments(),
    refetchInterval: (query) =>
      query.state.data?.some((item) => !terminalStatuses.has(item.status)) ? 3_000 : false,
  });
  const compare = useQuery({
    queryKey: [...optimizationKey, 'compare', selectedExperimentId],
    queryFn: () => fetchOptimizationCompare(selectedExperimentId ?? ''),
    enabled: Boolean(selectedExperimentId),
    refetchInterval: (query) => {
      const status = query.state.data?.experiment.status;
      return status && !terminalStatuses.has(status) ? 3_000 : false;
    },
  });

  useEffect(() => {
    if (!selectedExperimentId && experiments.data?.[0]) setSelectedExperimentId(experiments.data[0].id);
  }, [experiments.data, selectedExperimentId]);
  useEffect(() => {
    if (parameters.data?.length && selectedParameters.length === 0)
      setSelectedParameters(parameters.data.filter((item) => item.optimizationRange).map((item) => item.parameterId));
  }, [parameters.data, selectedParameters.length]);
  useEffect(() => {
    const providers = capabilities.data?.providers ?? [];
    if (providers.length > 0 && selectedModels.length === 0)
      setSelectedModels(providers.slice(0, Math.min(2, providers.length)).map((item) => `${item.provider}:${item.model}`));
  }, [capabilities.data?.providers, selectedModels.length]);

  const selectedVersion = versions.find((entry) => entry.version.id === strategyVersionId) ?? versions[0];
  const strategy = selectedVersion?.version.schema ? strategySchemaV2.safeParse(selectedVersion.version.schema) : null;
  const currency = strategy?.success ? strategy.data.executionInstrument.currency : 'CNY';

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: optimizationKey });
    await queryClient.invalidateQueries({ queryKey: ['desktop', 'strategy', 'strategies'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!strategyVersionId) throw new Error('请选择策略版本');
      if (selectedModels.length === 0) throw new Error('至少选择一个模型');
      if (selectedParameters.length === 0) throw new Error('至少授权一个参数');
      const routes = selectedModels.map((key) => {
        const separator = key.indexOf(':');
        return { provider: key.slice(0, separator), model: key.slice(separator + 1) };
      });
      const executionModel = executionModelJson.trim() ? (JSON.parse(executionModelJson) as unknown) : undefined;
      const runConfig = runConfigSchemaV2.parse({
        startDate,
        endDate,
        dataAsOf: new Date().toISOString(),
        baseCurrency: currency,
        initialCash: { [currency]: initialCash },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
        ...(executionModel === undefined ? {} : { executionModel }),
      });
      const input: OptimizationExperimentCreate = {
        strategyVersionId,
        models: routes,
        allowedParameterIds: selectedParameters,
        objective: { mode: objective, minClosedTrades: 1 },
        split: {
          development: { start: startDate, end: developmentEnd },
          validation: { start: addDays(developmentEnd, 1), end: validationEnd },
          test: { start: addDays(validationEnd, 1), end: endDate },
        },
        runConfig,
        budget: { maxAiCalls: 6, maxBacktestRuns: 20, maxDurationSeconds: 1800 },
        maxRounds: 2,
        idempotencyKey: crypto.randomUUID(),
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: async (experiment) => {
      setSelectedExperimentId(experiment.id);
      setFeedback('实验已创建。开发集与验证集会先运行，测试集保持封存。');
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '创建优化实验失败'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelOptimizationExperiment(id),
    onSuccess: invalidate,
  });
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedExperimentId || !preselectedCandidateId || lockedCandidateIds.length === 0)
        throw new Error('请选择进入封存测试的候选，并预选最终候选');
      return finalizeOptimizationExperiment(selectedExperimentId, {
        candidateIds: lockedCandidateIds,
        selectedCandidateId: preselectedCandidateId,
        expectedStage: 'awaiting_finalization',
      });
    },
    onSuccess: async () => {
      setFeedback('封存测试已完成；测试集结果已经揭示。');
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '封存测试失败'),
  });
  const adoptMutation = useMutation({
    mutationFn: async (candidate: OptimizationCandidate) => {
      if (!selectedExperimentId) throw new Error('未选择实验');
      const baseline = versions.find(
        (entry) => entry.version.id === compare.data?.experiment.baselineStrategyVersionId,
      );
      if (!baseline) throw new Error('找不到基线正式策略版本');
      return adoptOptimizationCandidate(selectedExperimentId, {
        candidateId: candidate.id,
        candidateHash: candidate.executionHash,
        expectedStrategyVersion: baseline.version.version,
        idempotencyKey: crypto.randomUUID(),
        acknowledgeTestExposure: candidate.id !== compare.data?.experiment.selectedCandidateId,
      });
    },
    onSuccess: async (result) => {
      setFeedback(`已采纳为正式策略 v${result.strategyVersion.version}；风险应用仍保持人工确认。`);
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '采纳候选失败'),
  });

  const toggleModel = (key: string) =>
    setSelectedModels((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : current.length < 3 ? [...current, key] : current,
    );
  const toggleParameter = (id: string) =>
    setSelectedParameters((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const toggleLockedCandidate = (id: string) =>
    setLockedCandidateIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI 策略优化</CardTitle>
          <CardDescription>AI 只负责提出白名单参数候选；排名、硬约束和最终结果只使用真实 V2 回测。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!capabilities.data?.aiOptimizationEnabled ? <p className="text-sm text-muted-foreground">AI 优化功能当前已关闭。</p> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">基线策略版本</span>
              <Select value={strategyVersionId} onValueChange={(value) => value && setStrategyVersionId(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {versions.map(({ strategy: record, version }) => (
                    <SelectItem key={version.id} value={version.id}>{record.name} · v{version.version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">优化目标</span>
              <Select value={objective} onValueChange={(value) => value && setObjective(value as typeof objective)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">收益 / 回撤平衡</SelectItem>
                  <SelectItem value="return">优先收益</SelectItem>
                  <SelectItem value="drawdown">优先低回撤</SelectItem>
                  <SelectItem value="lowTurnover">兼顾低换手</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">模型（最多 3 个，严格 Provider + Model，不自动 fallback）</div>
            <div className="flex flex-wrap gap-2">
              {(capabilities.data?.providers ?? []).map((route) => {
                const key = `${route.provider}:${route.model}`;
                return <Button key={key} type="button" size="sm" variant={selectedModels.includes(key) ? 'default' : 'outline'} onClick={() => toggleModel(key)}>{key}</Button>;
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">允许 AI 修改的参数</div>
            <div className="flex flex-wrap gap-2">
              {(parameters.data ?? []).map((parameter) => (
                <Button key={parameter.parameterId} type="button" size="sm" variant={selectedParameters.includes(parameter.parameterId) ? 'default' : 'outline'} onClick={() => toggleParameter(parameter.parameterId)} disabled={!parameter.optimizationRange}>
                  {parameter.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="开发集开始" />
            <Input type="date" value={developmentEnd} onChange={(event) => setDevelopmentEnd(event.target.value)} aria-label="开发集结束" />
            <Input type="date" value={validationEnd} onChange={(event) => setValidationEnd(event.target.value)} aria-label="验证集结束" />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="测试集结束" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">初始资金（{currency}）</span><Input value={initialCash} onChange={(event) => setInitialCash(event.target.value)} /></label>
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">执行模型 JSON（可选；需要研究模型的市场请填写）</span><Textarea value={executionModelJson} onChange={(event) => setExecutionModelJson(event.target.value)} placeholder="留空则完全依赖 Provider executionRules" /></label>
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={createMutation.isPending || !capabilities.data?.aiOptimizationEnabled} onClick={() => createMutation.mutate()}>{createMutation.isPending ? '创建中…' : '创建优化实验'}</Button>
            {feedback ? <span className="text-sm text-muted-foreground">{feedback}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>实验记录</CardTitle><CardDescription>实验可恢复、可取消；测试集在用户锁定候选前不会运行。</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(experiments.data ?? []).map((experiment) => (
            <button key={experiment.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setSelectedExperimentId(experiment.id)}>
              <div><div className="font-medium">{experiment.stage}</div><div className="text-xs text-muted-foreground">AI {experiment.aiCallsUsed} 次 · 回测 {experiment.backtestRunsUsed} 次 · 成本 {String(experiment.costUsed)}</div></div>
              <div className="flex items-center gap-2"><Badge variant={experiment.status === 'succeeded' ? 'default' : 'outline'}>{experiment.status}</Badge>{!terminalStatuses.has(experiment.status) ? <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); cancelMutation.mutate(experiment.id); }}>取消</Button> : null}</div>
            </button>
          ))}
          {experiments.data?.length === 0 ? <p className="text-sm text-muted-foreground">暂无优化实验。</p> : null}
        </CardContent>
      </Card>

      {compare.data ? (
        <Card>
          <CardHeader><CardTitle>多模型候选对比</CardTitle><CardDescription>{compare.data.note}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {compare.data.experiment.testExposedAt ? <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">测试集已揭示。若改选原预选候选之外的方案，采纳时会显式记录测试暴露。</div> : null}
            {compare.data.candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium">候选 {candidate.candidateNumber} · {candidate.modelKey}</div><div className="text-xs text-muted-foreground">{metricText(candidate)} · score {candidate.validationScore ?? '—'}</div></div><Badge variant={candidate.validationStatus.includes('valid') ? 'default' : 'outline'}>{candidate.validationStatus}</Badge></div>
                <div className="mt-2 text-xs text-muted-foreground">{candidate.diff.map((item) => `${String(item.label ?? item.parameterId)}: ${String(item.before)} → ${String(item.after)}`).join('；') || '无参数变化'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {compare.data.experiment.stage === 'awaiting_finalization' && candidate.validationStatus === 'valid' ? <><Button size="sm" variant={lockedCandidateIds.includes(candidate.id) ? 'default' : 'outline'} onClick={() => toggleLockedCandidate(candidate.id)}>进入封存测试</Button><Button size="sm" variant={preselectedCandidateId === candidate.id ? 'default' : 'outline'} onClick={() => { setPreselectedCandidateId(candidate.id); if (!lockedCandidateIds.includes(candidate.id)) toggleLockedCandidate(candidate.id); }}>预选最终候选</Button></> : null}
                  {compare.data.experiment.status === 'succeeded' && candidate.validationStatus === 'test_valid' ? <Button size="sm" disabled={adoptMutation.isPending} onClick={() => adoptMutation.mutate(candidate)}>采纳为正式版本</Button> : null}
                </div>
              </div>
            ))}
            {compare.data.experiment.stage === 'awaiting_finalization' ? <Button disabled={finalizeMutation.isPending || !preselectedCandidateId || lockedCandidateIds.length === 0} onClick={() => finalizeMutation.mutate()}>{finalizeMutation.isPending ? '测试中…' : '锁定候选并运行测试集'}</Button> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
