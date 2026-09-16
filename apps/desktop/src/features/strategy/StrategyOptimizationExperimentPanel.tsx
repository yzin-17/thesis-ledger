import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  runConfigSchemaV2,
  strategySchemaV2,
  type OptimizationReasoningEffort,
  type OptimizationExperimentCreate,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  cancelOptimizationExperiment,
  cloneOptimizationExperiment,
  createOptimizationExperiment,
  fetchOptimizationCapabilities,
  fetchOptimizationCompare,
  fetchOptimizationExperiments,
  fetchStrategyOptimizationParameters,
} from './strategy-optimization.api.js';
import {
  routeKey,
  StrategyOptimizationModelSelector,
} from './StrategyOptimizationModelSelector.js';
import { StrategyOptimizationExperimentResults } from './StrategyOptimizationExperimentResults.js';
import type { StrategyRecord } from './strategy.types.js';

const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const settledStatuses = new Set(['awaiting_finalization', 'succeeded', 'failed', 'cancelled']);
const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};
export const addDays = (dateOnly: string, days: number) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};
export const objectiveLabels = {
  return: '优先收益',
  drawdown: '优先低回撤',
  balanced: '收益 / 回撤平衡',
  lowTurnover: '优先低换手',
} as const;

export function StrategyOptimizationExperimentPanel({
  strategies,
}: {
  strategies: StrategyRecord[];
}) {
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
  const [sourceMode, setSourceMode] = useState<'existing' | 'discovery'>('existing');
  const [discoverySymbol, setDiscoverySymbol] = useState('');
  const [discoveryMarket, setDiscoveryMarket] = useState<'CN' | 'HK' | 'US'>('CN');
  const [discoveryAssetType, setDiscoveryAssetType] = useState<'stock' | 'etf' | 'fund'>('stock');
  const [discoveryTimeframe, setDiscoveryTimeframe] = useState<
    '1d' | '60m' | '30m' | '15m' | '5m' | '1m'
  >('1d');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [objective, setObjective] = useState<'return' | 'drawdown' | 'balanced' | 'lowTurnover'>(
    'balanced',
  );
  const [startDate, setStartDate] = useState(daysAgo(360));
  const [developmentEnd, setDevelopmentEnd] = useState(daysAgo(181));
  const [validationEnd, setValidationEnd] = useState(daysAgo(91));
  const [endDate, setEndDate] = useState(daysAgo(1));
  const [initialCash, setInitialCash] = useState('100000');
  const [maxAiCalls, setMaxAiCalls] = useState('6');
  const [maxBacktestRuns, setMaxBacktestRuns] = useState('20');
  const [maxInputTokens, setMaxInputTokens] = useState('100000');
  const [maxOutputTokens, setMaxOutputTokens] = useState('20000');
  const [maxDurationSeconds, setMaxDurationSeconds] = useState('1800');
  const [maxCost, setMaxCost] = useState('');
  const [acknowledgeUnknownCost, setAcknowledgeUnknownCost] = useState(false);
  const [executionModelJson, setExecutionModelJson] = useState('');
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [reasoningEfforts, setReasoningEfforts] = useState<
    Record<string, OptimizationReasoningEffort | undefined>
  >({});
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
      query.state.data?.some((item) => !settledStatuses.has(item.status)) ? 3_000 : false,
  });
  const compare = useQuery({
    queryKey: [...optimizationKey, 'compare', selectedExperimentId],
    queryFn: () => fetchOptimizationCompare(selectedExperimentId ?? ''),
    enabled: Boolean(selectedExperimentId),
    refetchInterval: (query) => {
      const status = query.state.data?.experiment.status;
      return status && !settledStatuses.has(status) ? 3_000 : false;
    },
  });

  useEffect(() => {
    if (!selectedExperimentId && experiments.data?.[0])
      setSelectedExperimentId(experiments.data[0].id);
  }, [experiments.data, selectedExperimentId]);
  useEffect(() => {
    if (parameters.data?.length && selectedParameters.length === 0)
      setSelectedParameters(
        parameters.data.filter((item) => item.optimizationRange).map((item) => item.parameterId),
      );
  }, [parameters.data, selectedParameters.length]);
  useEffect(() => {
    const providers = capabilities.data?.providers ?? [];
    if (providers.length > 0 && selectedModels.length === 0)
      setSelectedModels(
        providers
          .slice(0, Math.min(2, providers.length))
          .map((item) => routeKey(item.provider, item.model)),
      );
  }, [capabilities.data?.providers, selectedModels.length]);
  const selectedProviderRoutes = (capabilities.data?.providers ?? []).filter((route) =>
    selectedModels.includes(routeKey(route.provider, route.model)),
  );
  const hasInvalidReasoningSelection = selectedProviderRoutes.some((route) => {
    const key = routeKey(route.provider, route.model);
    const effort = reasoningEfforts[key];
    if (effort === undefined) return false;
    return (
      !route.reasoning?.supportedEfforts?.includes(effort) ||
      (route.reasoning?.mandatory === true && effort === 'none')
    );
  });
  const hasUnknownCost = selectedProviderRoutes.some((route) => route.costStatus === 'unknown');
  const selectedVersion =
    versions.find((entry) => entry.version.id === strategyVersionId) ?? versions[0];
  const parsedStrategy = selectedVersion?.version.schema
    ? strategySchemaV2.safeParse(selectedVersion.version.schema)
    : null;
  let market: 'CN' | 'HK' | 'US' = discoveryMarket;
  if (sourceMode !== 'discovery') {
    market = parsedStrategy?.success ? parsedStrategy.data.executionInstrument.market : 'CN';
  }
  const currency = currencyByMarket[market];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: optimizationKey });
    await queryClient.invalidateQueries({ queryKey: ['desktop', 'strategy', 'strategies'] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (sourceMode === 'existing' && !strategyVersionId) throw new Error('请选择策略版本');
      if (sourceMode === 'discovery' && !discoverySymbol.trim()) throw new Error('请输入探索标的');
      if (selectedModels.length === 0) throw new Error('至少选择一个模型');
      if (sourceMode === 'existing' && selectedParameters.length === 0)
        throw new Error('至少授权一个参数');
      if (hasInvalidReasoningSelection)
        throw new Error('所选模型的推理强度不受 Provider 能力声明支持');
      const models = selectedProviderRoutes.map((route) => {
        const effort = reasoningEfforts[routeKey(route.provider, route.model)];
        return {
          provider: route.provider,
          model: route.model,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        };
      });
      const executionModel = executionModelJson.trim()
        ? (JSON.parse(executionModelJson) as unknown)
        : undefined;
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
        sourceMode,
        ...(sourceMode === 'existing'
          ? { strategyVersionId, allowedParameterIds: selectedParameters }
          : {
              discoveryScope: {
                executionInstrument: {
                  symbol: discoverySymbol.trim(),
                  market: discoveryMarket,
                  assetType: discoveryAssetType,
                },
                primaryTimeframe: discoveryTimeframe,
              },
            }),
        models,
        objective: { mode: objective, minClosedTrades: 1 },
        split: {
          development: { start: startDate, end: developmentEnd },
          validation: { start: addDays(developmentEnd, 1), end: validationEnd },
          test: { start: addDays(validationEnd, 1), end: endDate },
        },
        runConfig,
        budget: {
          maxAiCalls: Number(maxAiCalls),
          maxBacktestRuns: Number(maxBacktestRuns),
          maxInputTokens: Number(maxInputTokens),
          maxOutputTokens: Number(maxOutputTokens),
          maxDurationSeconds: Number(maxDurationSeconds),
          ...(maxCost.trim() ? { maxCost: maxCost.trim() } : {}),
        },
        maxRounds: 2,
        acknowledgeUnknownCost: !hasUnknownCost || acknowledgeUnknownCost,
        idempotencyKey: crypto.randomUUID(),
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: async (experiment) => {
      setSelectedExperimentId(experiment.id);
      setFeedback('实验已创建。开发集与验证集先运行，测试集保持封存。');
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '创建优化实验失败'),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelOptimizationExperiment(id),
    onSuccess: invalidate,
  });
  const cloneMutation = useMutation({
    mutationFn: (id: string) => cloneOptimizationExperiment(id),
    onSuccess: async (experiment) => {
      setSelectedExperimentId(experiment.id);
      setFeedback(
        experiment.testExposedAt
          ? '实验已克隆；源实验测试集已暴露，新实验继承暴露状态，不视为新的独立验证。'
          : '实验已克隆，并继承相同模型、参数、数据切分与预算配置。',
      );
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '克隆实验失败'),
  });
  const toggleParameter = (id: string) =>
    setSelectedParameters((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI 策略实验</CardTitle>
          <CardDescription>
            AI 实验先产生候选，采纳后成为正式策略，再由同一确定性编译器生成风险规则。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!capabilities.data?.aiOptimizationEnabled ? (
            <p className="text-sm text-muted-foreground">AI 优化功能当前已关闭。</p>
          ) : null}
          <ToggleGroup
            value={[sourceMode]}
            onValueChange={(value) => {
              const nextMode = value[0];
              if (nextMode === 'existing' || nextMode === 'discovery') setSourceMode(nextMode);
            }}
            aria-label="选择 AI 实验模式"
            className="w-fit"
          >
            <ToggleGroupItem value="existing">优化现有策略</ToggleGroupItem>
            <ToggleGroupItem value="discovery">从零探索策略</ToggleGroupItem>
          </ToggleGroup>
          <Alert>
            <AlertTitle>实验关系</AlertTitle>
            <AlertDescription>
              AI 实验 → 正式策略 → 风险规则。手动创建和 AI 采纳的正式 V2
              版本都可使用确定性风险规则入口。
            </AlertDescription>
          </Alert>
          {sourceMode === 'discovery' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel>探索标的</FieldLabel>
                <Input
                  value={discoverySymbol}
                  onChange={(event) => setDiscoverySymbol(event.target.value)}
                  placeholder="如 600519.SH"
                />
              </Field>
              <Field>
                <FieldLabel>市场</FieldLabel>
                <Select
                  value={discoveryMarket}
                  onValueChange={(value) =>
                    value &&
                    !(discoveryAssetType === 'fund' && value !== 'CN') &&
                    setDiscoveryMarket(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="CN">中国</SelectItem>
                      <SelectItem value="HK" disabled={discoveryAssetType === 'fund'}>
                        香港
                      </SelectItem>
                      <SelectItem value="US" disabled={discoveryAssetType === 'fund'}>
                        美国
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>资产类型</FieldLabel>
                <Select
                  value={discoveryAssetType}
                  onValueChange={(value) => {
                    if (!value) return;
                    setDiscoveryAssetType(value);
                    if (value === 'fund') {
                      setDiscoveryMarket('CN');
                      setDiscoveryTimeframe('1d');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="stock">股票</SelectItem>
                      <SelectItem value="etf">ETF</SelectItem>
                      <SelectItem value="fund">基金 NAV</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>主周期</FieldLabel>
                <Select
                  value={discoveryTimeframe}
                  onValueChange={(value) => value && setDiscoveryTimeframe(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {['1d', '60m', '30m', '15m', '5m', '1m'].map((item) => (
                        <SelectItem
                          key={item}
                          value={item}
                          disabled={discoveryAssetType === 'fund' && item !== '1d'}
                        >
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {sourceMode === 'existing' ? (
              <Field className="space-y-1 text-sm">
                <FieldLabel>
                  <span className="text-muted-foreground">基线策略版本</span>
                </FieldLabel>
                <Select
                  items={versions.map(({ strategy, version }) => ({
                    label: `${strategy.name} · v${version.version}`,
                    value: version.id,
                  }))}
                  value={strategyVersionId}
                  onValueChange={(value) => {
                    if (!value) return;
                    setStrategyVersionId(value);
                    setSelectedParameters([]);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {versions.map(({ strategy, version }) => (
                        <SelectItem key={version.id} value={version.id}>
                          {strategy.name} · v{version.version}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                探索模式不需要基线策略或参数授权；Server 会创建实验专用隐藏 v0 种子。
              </div>
            )}
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">优化目标</span>
              </FieldLabel>
              <Select
                items={[
                  { label: '收益 / 回撤平衡', value: 'balanced' },
                  { label: '优先收益', value: 'return' },
                  { label: '优先低回撤', value: 'drawdown' },
                  { label: '优先低换手', value: 'lowTurnover' },
                ]}
                value={objective}
                onValueChange={(value) => value && setObjective(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{objectiveLabels[objective]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="balanced">收益 / 回撤平衡</SelectItem>
                    <SelectItem value="return">优先收益</SelectItem>
                    <SelectItem value="drawdown">优先低回撤</SelectItem>
                    <SelectItem value="lowTurnover">优先低换手</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <StrategyOptimizationModelSelector
            routes={capabilities.data?.providers ?? []}
            selectedModels={selectedModels}
            onSelectedModelsChange={setSelectedModels}
            reasoningEfforts={reasoningEfforts}
            onReasoningEffortsChange={setReasoningEfforts}
          />
          {hasUnknownCost ? (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="text-sm font-medium">所选模型存在未知费用</div>
              <p className="text-xs text-muted-foreground">
                系统仍会限制调用、Token、回测和计算时长，但没有价格表时不能保证费用上限。
              </p>
              <Button
                type="button"
                size="sm"
                variant={acknowledgeUnknownCost ? 'default' : 'outline'}
                onClick={() => setAcknowledgeUnknownCost((current) => !current)}
              >
                {acknowledgeUnknownCost ? '已确认未知费用' : '确认后允许创建'}
              </Button>
            </div>
          ) : null}
          {sourceMode === 'existing' ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">允许 AI 修改的参数</div>
              <div className="flex flex-wrap gap-2">
                {(parameters.data ?? []).map((parameter) => (
                  <Button
                    key={parameter.parameterId}
                    type="button"
                    size="sm"
                    variant={
                      selectedParameters.includes(parameter.parameterId) ? 'default' : 'outline'
                    }
                    disabled={!parameter.optimizationRange}
                    onClick={() => toggleParameter(parameter.parameterId)}
                  >
                    {parameter.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <div className="text-sm text-muted-foreground">
              时间切分（三段连续、不重叠；验证集/封存测试集从前一段结束日后一天自动开始）
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel>开发集开始</FieldLabel>
                <DateInput
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="开发集开始"
                />
              </Field>
              <Field>
                <FieldLabel>开发集结束</FieldLabel>
                <DateInput
                  type="date"
                  value={developmentEnd}
                  onChange={(event) => setDevelopmentEnd(event.target.value)}
                  aria-label="开发集结束"
                />
              </Field>
              <Field>
                <FieldLabel>验证集结束</FieldLabel>
                <DateInput
                  type="date"
                  value={validationEnd}
                  onChange={(event) => setValidationEnd(event.target.value)}
                  aria-label="验证集结束"
                />
                <FieldDescription>验证集开始：{addDays(developmentEnd, 1)}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>封存测试结束</FieldLabel>
                <DateInput
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="封存测试结束"
                />
                <FieldDescription>封存测试开始：{addDays(validationEnd, 1)}</FieldDescription>
              </Field>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">AI 调用上限</span>
              </FieldLabel>
              <Input
                type="number"
                min="1"
                max="30"
                value={maxAiCalls}
                onChange={(event) => setMaxAiCalls(event.target.value)}
              />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">回测运行上限</span>
              </FieldLabel>
              <Input
                type="number"
                min="2"
                max="100"
                value={maxBacktestRuns}
                onChange={(event) => setMaxBacktestRuns(event.target.value)}
              />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">输入 Token</span>
              </FieldLabel>
              <Input
                type="number"
                min="1"
                max="10000000"
                value={maxInputTokens}
                onChange={(event) => setMaxInputTokens(event.target.value)}
              />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">输出 Token</span>
              </FieldLabel>
              <Input
                type="number"
                min="1"
                max="2000000"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
              />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">最长计算（秒）</span>
              </FieldLabel>
              <Input
                type="number"
                min="30"
                max="86400"
                value={maxDurationSeconds}
                onChange={(event) => setMaxDurationSeconds(event.target.value)}
              />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">模型费用上限（可选）</span>
              </FieldLabel>
              <Input
                inputMode="decimal"
                value={maxCost}
                onChange={(event) => setMaxCost(event.target.value)}
                placeholder="如 5.00"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            预算为服务端硬上限；模型调用前预留保守输入 Token 与单次输出额度，完成后按 Provider 实际
            usage 结算。
          </p>
          <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">初始资金（{currency}）</span>
              </FieldLabel>
              <Input value={initialCash} onChange={(event) => setInitialCash(event.target.value)} />
            </Field>
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">执行模型 JSON（可选）</span>
              </FieldLabel>
              <Textarea
                value={executionModelJson}
                onChange={(event) => setExecutionModelJson(event.target.value)}
                placeholder="留空则完全依赖 Provider executionRules"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                createMutation.isPending ||
                !capabilities.data?.aiOptimizationEnabled ||
                hasInvalidReasoningSelection ||
                (hasUnknownCost && !acknowledgeUnknownCost)
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending
                ? '创建中…'
                : sourceMode === 'discovery'
                  ? '创建探索实验'
                  : '创建优化实验'}
            </Button>
            {feedback ? <span className="text-sm text-muted-foreground">{feedback}</span> : null}
          </div>
        </CardContent>
      </Card>

      <StrategyOptimizationExperimentResults
        experiments={experiments.data ?? []}
        compare={compare.data}
        settledStatuses={settledStatuses}
        selectedExperimentId={selectedExperimentId}
        versions={versions}
        onInvalidate={invalidate}
        onFeedback={setFeedback}
        onSelectExperiment={setSelectedExperimentId}
        onCloneExperiment={(id) => cloneMutation.mutate(id)}
        clonePending={cloneMutation.isPending}
        onCancelExperiment={(id) => cancelMutation.mutate(id)}
      />
    </div>
  );
}
