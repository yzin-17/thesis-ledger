import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useBeforeUnload, useBlocker, useNavigate, useSearchParams } from 'react-router';
import {
  runConfigSchemaV2,
  strategySchemaV2,
  type OptimizationExperimentCreate,
  type OptimizationReasoningEffort,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  createOptimizationExperiment,
  fetchOptimizationCapabilities,
  fetchStrategyOptimizationParameters,
  type OptimizationCapabilities,
} from './strategy-optimization.api.js';
import {
  routeKey,
  StrategyOptimizationModelSelector,
} from './StrategyOptimizationModelSelector.js';
import { objectiveLabels } from './StrategyOptimizationExperimentPanel.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import type { StrategyRecord } from './strategy.types.js';

const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};
export const nextExperimentDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return isoDate(date);
};

export const experimentCostPolicy = (routes: OptimizationCapabilities['providers']) => {
  const hasUnknownCost = routes.some(
    (route) => route.costStatus === 'unknown' || !route.costCurrency,
  );
  const knownCurrencies = [
    ...new Set(
      routes.map((route) => route.costCurrency).filter((value): value is string => Boolean(value)),
    ),
  ];
  return {
    hasUnknownCost,
    knownCurrencies,
    mixedCurrencies: knownCurrencies.length > 1,
  };
};

type FieldErrors = Partial<Record<'source' | 'models' | 'dates' | 'budget' | 'cost', string>>;

export function StrategyExperimentCreatePage({ strategies }: { strategies: StrategyRecord[] }) {
  const navigate = useNavigate();
  const allowNavigationRef = useRef(false);
  const [searchParams] = useSearchParams();
  const lockedVersionId = searchParams.get('strategyVersionId') ?? '';
  const versions = useMemo(
    () =>
      strategies.flatMap((strategy) =>
        strategy.versions
          .filter((version) => version.version > 0 && version.schemaVersion === 2 && version.schema)
          .map((version) => ({ strategy, version })),
      ),
    [strategies],
  );
  const lockedVersion = versions.find((entry) => entry.version.id === lockedVersionId) ?? null;
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<'existing' | 'discovery'>(
    lockedVersionId ? 'existing' : 'existing',
  );
  const [strategyVersionId, setStrategyVersionId] = useState(
    lockedVersionId || versions[0]?.version.id || '',
  );
  const [discoverySymbol, setDiscoverySymbol] = useState('');
  const [discoveryMarket, setDiscoveryMarket] = useState<'CN' | 'HK' | 'US'>('CN');
  const [discoveryAssetType, setDiscoveryAssetType] = useState<'stock' | 'etf' | 'fund'>('stock');
  const [objective, setObjective] = useState<keyof typeof objectiveLabels>('balanced');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [reasoningEfforts, setReasoningEfforts] = useState<
    Record<string, OptimizationReasoningEffort | undefined>
  >({});
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitIntentId] = useState(() => crypto.randomUUID());
  const [touched, setTouched] = useState(false);
  const capabilities = useQuery({
    queryKey: [...optimizationKey, 'capabilities'],
    queryFn: () => fetchOptimizationCapabilities(),
    staleTime: 30_000,
  });
  const parameters = useQuery({
    queryKey: [...optimizationKey, 'parameters', strategyVersionId],
    queryFn: () => fetchStrategyOptimizationParameters(strategyVersionId),
    enabled: sourceMode === 'existing' && Boolean(strategyVersionId),
  });

  useEffect(() => {
    if (lockedVersionId) setStrategyVersionId(lockedVersionId);
    else if (!strategyVersionId && versions[0]) setStrategyVersionId(versions[0].version.id);
  }, [lockedVersionId, strategyVersionId, versions]);
  useEffect(() => {
    if (parameters.data?.length && selectedParameters.length === 0)
      setSelectedParameters(
        parameters.data.filter((item) => item.optimizationRange).map((item) => item.parameterId),
      );
  }, [parameters.data, selectedParameters.length]);
  useEffect(() => {
    const routes = capabilities.data?.providers ?? [];
    if (routes.length > 0 && selectedModels.length === 0)
      setSelectedModels(
        routes
          .slice(0, Math.min(2, routes.length))
          .map((route) => routeKey(route.provider, route.model)),
      );
  }, [capabilities.data?.providers, selectedModels.length]);
  useEffect(() => {
    setAcknowledgeUnknownCost(false);
    setMaxCost('');
  }, [selectedModels, reasoningEfforts]);

  const selectedRoutes = (capabilities.data?.providers ?? []).filter((route) =>
    selectedModels.includes(routeKey(route.provider, route.model)),
  );
  const { hasUnknownCost, knownCurrencies, mixedCurrencies } = experimentCostPolicy(selectedRoutes);
  const selectedVersion = versions.find((entry) => entry.version.id === strategyVersionId) ?? null;
  const parsedStrategy = selectedVersion?.version.schema
    ? strategySchemaV2.safeParse(selectedVersion.version.schema)
    : null;
  let market: 'CN' | 'HK' | 'US' = discoveryMarket;
  if (sourceMode === 'existing') {
    market = parsedStrategy?.success ? parsedStrategy.data.executionInstrument.market : 'CN';
  }
  const currency = currencyByMarket[market];
  const validateStep = (targetStep: number) => {
    const errors: FieldErrors = {};
    if (targetStep >= 1) {
      if (sourceMode === 'existing' && !strategyVersionId) errors.source = '请选择明确的策略版本。';
      if (sourceMode === 'discovery' && !discoverySymbol.trim()) errors.source = '请输入探索标的。';
      if (sourceMode === 'existing' && selectedParameters.length === 0)
        errors.source = '至少授权一个可优化参数。';
    }
    if (targetStep >= 2) {
      if (selectedRoutes.length === 0) errors.models = '至少选择一个可用的 Provider/Model。';
      if (mixedCurrencies)
        errors.cost = `所选模型包含不同费用币种：${knownCurrencies.join('、')}。请改为同币种模型。`;
      if (!(
        startDate <= developmentEnd &&
        developmentEnd < validationEnd &&
        validationEnd < endDate
      ))
        errors.dates = '开发、验证和封存测试区间必须按时间连续排列。';
      const invalidReasoning = selectedRoutes.some((route) => {
        const effort = reasoningEfforts[routeKey(route.provider, route.model)];
        return (
          effort !== undefined &&
          (!route.reasoning?.supportedEfforts?.includes(effort) ||
            (route.reasoning?.mandatory === true && effort === 'none'))
        );
      });
      if (invalidReasoning) errors.models = '推理强度不符合 Provider 能力配置。';
    }
    if (targetStep >= 3) {
      if (
        ![
          initialCash,
          maxAiCalls,
          maxBacktestRuns,
          maxInputTokens,
          maxOutputTokens,
          maxDurationSeconds,
        ].every((value) => Number(value) > 0)
      )
        errors.budget = '资金和全部硬限制必须为大于 0 的数字。';
      if (hasUnknownCost && !acknowledgeUnknownCost)
        errors.cost = '所选模型存在未知费用或币种，请先确认。';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!validateStep(3)) throw new Error('请修正表单中的问题。');
      const models = selectedRoutes.map((route) => {
        const effort = reasoningEfforts[routeKey(route.provider, route.model)];
        return {
          provider: route.provider,
          model: route.model,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        };
      });
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
                primaryTimeframe: '1d',
              },
            }),
        models,
        objective: { mode: objective, minClosedTrades: 1 },
        split: {
          development: { start: startDate, end: developmentEnd },
          validation: { start: nextExperimentDay(developmentEnd), end: validationEnd },
          test: { start: nextExperimentDay(validationEnd), end: endDate },
        },
        runConfig,
        budget: {
          maxAiCalls: Number(maxAiCalls),
          maxBacktestRuns: Number(maxBacktestRuns),
          maxInputTokens: Number(maxInputTokens),
          maxOutputTokens: Number(maxOutputTokens),
          maxDurationSeconds: Number(maxDurationSeconds),
          ...(!hasUnknownCost && maxCost.trim() ? { maxCost: maxCost.trim() } : {}),
        },
        maxRounds: 2,
        acknowledgeUnknownCost: !hasUnknownCost || acknowledgeUnknownCost,
        idempotencyKey: submitIntentId,
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: (experiment) => {
      allowNavigationRef.current = true;
      void navigate(strategyCenterPath.experiment(experiment.id), { replace: true });
    },
    onError: (error) =>
      setFieldErrors((current) => ({
        ...current,
        budget: error instanceof Error ? error.message : '创建实验失败，请使用同一提交意图重试。',
      })),
  });
  const blocker = useBlocker(
    () => touched && !createMutation.isPending && !allowNavigationRef.current,
  );
  useBeforeUnload(
    (event) => {
      if (!touched || createMutation.isPending || allowNavigationRef.current) return;
      event.preventDefault();
    },
    { capture: true },
  );
  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  };
  const markTouched = () => setTouched(true);

  if (lockedVersionId && !lockedVersion && versions.length > 0)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法锁定实验来源</AlertTitle>
        <AlertDescription>
          指定的策略版本不存在或不是正式 V2。系统不会改用其他版本。
        </AlertDescription>
      </Alert>
    );
  let stepTitle = '策略与目标';
  let stepDescription = '确定不可静默变化的实验来源。';
  if (step === 2) {
    stepTitle = '模型与数据';
    stepDescription = '模型路由、推理强度和三段数据区间会写入实验快照。';
  } else if (step === 3) {
    stepTitle = '预算与确认';
    stepDescription = '核对资金和硬限制后创建一次实验。';
  }
  return (
    <div className="mx-auto max-w-5xl space-y-5" onChange={markTouched}>
      <div>
        <p className="text-sm text-muted-foreground">策略中心 / AI 实验 / 新建实验</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">新建 AI 实验</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          前三步只保留输入，最后确认时才创建实验。
        </p>
      </div>
      <ol className="grid grid-cols-3 gap-2" aria-label="创建实验步骤">
        {['策略与目标', '模型与数据', '预算与确认'].map((label, index) => (
          <li
            key={label}
            className={`rounded-md border px-3 py-3 text-sm ${step === index + 1 ? 'border-foreground bg-muted font-medium' : 'text-muted-foreground'}`}
          >
            <span className="mr-2">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle>{stepTitle}</CardTitle>
          <CardDescription>{stepDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 ? (
            <>
              {lockedVersionId ? (
                <Alert>
                  <AlertTitle>来源已锁定</AlertTitle>
                  <AlertDescription>
                    {lockedVersion
                      ? `${lockedVersion.strategy.name} v${lockedVersion.version.version}`
                      : lockedVersionId}
                  </AlertDescription>
                </Alert>
              ) : (
                <ToggleGroup
                  value={[sourceMode]}
                  onValueChange={(values) => {
                    const value = values[0];
                    if (value === 'existing' || value === 'discovery') {
                      setSourceMode(value);
                      markTouched();
                    }
                  }}
                  aria-label="选择实验来源"
                >
                  <ToggleGroupItem value="existing">优化已有策略</ToggleGroupItem>
                  <ToggleGroupItem value="discovery">从零探索</ToggleGroupItem>
                </ToggleGroup>
              )}
              {sourceMode === 'existing' ? (
                <Field invalid={Boolean(fieldErrors.source)}>
                  <FieldLabel>基线策略版本</FieldLabel>
                  <Select
                    disabled={Boolean(lockedVersionId)}
                    value={strategyVersionId}
                    onValueChange={(value) => {
                      if (value) {
                        setStrategyVersionId(value);
                        setSelectedParameters([]);
                        markTouched();
                      }
                    }}
                  >
                    <SelectTrigger>
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
                  {fieldErrors.source ? (
                    <FieldError>{fieldErrors.source}</FieldError>
                  ) : (
                    <FieldDescription>实验期间即使策略新增版本，基线也不会改变。</FieldDescription>
                  )}
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field invalid={Boolean(fieldErrors.source)}>
                    <FieldLabel>探索标的</FieldLabel>
                    <Input
                      aria-label="探索标的"
                      value={discoverySymbol}
                      onChange={(event) => setDiscoverySymbol(event.target.value)}
                      placeholder="如 600519.SH"
                    />
                    {fieldErrors.source ? <FieldError>{fieldErrors.source}</FieldError> : null}
                  </Field>
                  <Field>
                    <FieldLabel>市场</FieldLabel>
                    <Select
                      value={discoveryMarket}
                      onValueChange={(value) => value && setDiscoveryMarket(value)}
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
                      onValueChange={(value) => value && setDiscoveryAssetType(value)}
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
                </div>
              )}
              {sourceMode === 'existing' ? (
                <Field invalid={Boolean(fieldErrors.source)}>
                  <FieldLabel>允许 AI 修改的参数</FieldLabel>
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
                        onClick={() => {
                          setSelectedParameters((current) =>
                            current.includes(parameter.parameterId)
                              ? current.filter((item) => item !== parameter.parameterId)
                              : [...current, parameter.parameterId],
                          );
                          markTouched();
                        }}
                      >
                        {parameter.label}
                      </Button>
                    ))}
                  </div>
                </Field>
              ) : null}
              <Field>
                <FieldLabel>优化目标</FieldLabel>
                <Select value={objective} onValueChange={(value) => value && setObjective(value)}>
                  <SelectTrigger>
                    <SelectValue>{objectiveLabels[objective]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(objectiveLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <StrategyOptimizationModelSelector
                routes={capabilities.data?.providers ?? []}
                selectedModels={selectedModels}
                onSelectedModelsChange={(value) => {
                  setSelectedModels(value);
                  markTouched();
                }}
                reasoningEfforts={reasoningEfforts}
                onReasoningEffortsChange={(value) => {
                  setReasoningEfforts(value);
                  markTouched();
                }}
              />
              {fieldErrors.models ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.models}
                </p>
              ) : null}
              {fieldErrors.cost ? (
                <Alert variant="destructive">
                  <AlertTitle>费用配置不可用</AlertTitle>
                  <AlertDescription>{fieldErrors.cost}</AlertDescription>
                </Alert>
              ) : null}
              <Field invalid={Boolean(fieldErrors.dates)}>
                <FieldLabel>连续数据区间</FieldLabel>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DateInput
                    type="date"
                    aria-label="开发集开始"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                  <DateInput
                    type="date"
                    aria-label="开发集结束"
                    value={developmentEnd}
                    onChange={(event) => setDevelopmentEnd(event.target.value)}
                  />
                  <DateInput
                    type="date"
                    aria-label="验证集结束"
                    value={validationEnd}
                    onChange={(event) => setValidationEnd(event.target.value)}
                  />
                  <DateInput
                    type="date"
                    aria-label="封存测试结束"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>
                <FieldDescription>
                  验证集从 {nextExperimentDay(developmentEnd)} 开始，封存测试从{' '}
                  {nextExperimentDay(validationEnd)} 开始。
                </FieldDescription>
                {fieldErrors.dates ? <FieldError>{fieldErrors.dates}</FieldError> : null}
              </Field>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field>
                  <FieldLabel>初始资金（{currency}）</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={initialCash}
                    onChange={(event) => setInitialCash(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>AI 调用上限</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={maxAiCalls}
                    onChange={(event) => setMaxAiCalls(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>回测次数上限</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={maxBacktestRuns}
                    onChange={(event) => setMaxBacktestRuns(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>输入 Token 上限</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={maxInputTokens}
                    onChange={(event) => setMaxInputTokens(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>输出 Token 上限</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={maxOutputTokens}
                    onChange={(event) => setMaxOutputTokens(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>时长上限（秒）</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={maxDurationSeconds}
                    onChange={(event) => setMaxDurationSeconds(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    费用上限{knownCurrencies[0] ? `（${knownCurrencies[0]}）` : ''}
                  </FieldLabel>
                  <Input
                    value={maxCost}
                    disabled={hasUnknownCost || mixedCurrencies}
                    onChange={(event) => setMaxCost(event.target.value)}
                    placeholder={hasUnknownCost ? '费用未知时不可设置' : '可选'}
                  />
                </Field>
              </div>
              {hasUnknownCost ? (
                <Alert>
                  <AlertTitle>存在未知费用或币种</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>金额上限已禁用且不会提交。调用、Token、回测次数和时长限制仍然有效。</p>
                    <Button
                      type="button"
                      variant={acknowledgeUnknownCost ? 'default' : 'outline'}
                      onClick={() => {
                        setAcknowledgeUnknownCost((value) => !value);
                        markTouched();
                      }}
                    >
                      {acknowledgeUnknownCost ? '已确认未知费用' : '确认后允许创建'}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {sourceMode === 'existing'
                      ? `${selectedVersion?.strategy.name ?? '策略'} v${selectedVersion?.version.version ?? '?'}`
                      : `${discoverySymbol || '未填写标的'} 从零探索`}
                  </Badge>
                  <Badge variant="outline">{selectedRoutes.length} 个模型</Badge>
                  <Badge variant="outline">{currency}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">开发集</dt>
                    <dd>
                      {startDate} 至 {developmentEnd}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">验证集</dt>
                    <dd>
                      {nextExperimentDay(developmentEnd)} 至 {validationEnd}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">封存测试</dt>
                    <dd>
                      {nextExperimentDay(validationEnd)} 至 {endDate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">提交意图</dt>
                    <dd className="truncate font-mono text-xs">{submitIntentId}</dd>
                  </div>
                </dl>
              </div>
              {fieldErrors.budget ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.budget}
                </p>
              ) : null}
              {fieldErrors.cost ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.cost}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-between border-t pt-4">
            <Button
              variant="outline"
              disabled={step === 1 || createMutation.isPending}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              上一步
            </Button>
            {step < 3 ? (
              <Button onClick={next}>下一步</Button>
            ) : (
              <Button
                disabled={createMutation.isPending}
                aria-busy={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? '创建中…' : '创建实验'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>离开新建实验？</AlertDialogTitle>
            <AlertDialogDescription>
              当前三步输入尚未提交。继续离开会丢失这些内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              继续填写
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              放弃并离开
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
