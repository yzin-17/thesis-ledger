import { createClientRequestId } from '../../lib/client-request-id';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import { ExperimentDiscoveryInstrumentField, useExperimentDiscoveryInstrument } from './ExperimentDiscoveryInstrumentField.js';
import { Spinner } from '@/components/ui/spinner';
import { StrategyExperimentConfigurationReview } from './StrategyExperimentConfigurationReview.js';
import { ExperimentBudgetFields } from './ExperimentBudgetFields.js';
import { experimentBudgetError, experimentCreateFailure } from './experiment-budget.js';
import { OptimizationPricePreparation } from './OptimizationPricePreparation.js';
import {
  experimentPreparationTarget,
  requirePreparedOptimizationConfiguration,
  type PreparedOptimizationConfiguration,
} from './optimization.preparation.js';
import { useEffect, useRef, useState } from 'react';
import { useExperimentResearchVersions } from './use-experiment-research-versions.js';
import { ExperimentResearchVersionChoice } from './ExperimentResearchVersionChoice.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import {
  strategySchema,
  type OptimizationExperimentCreate, type StrategySubmissionInput,
  type OptimizationReasoningEffort,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StrategyExperimentDateFields } from './StrategyExperimentDateFields.js';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToastManager } from '@/components/ui/toast';
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
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const navigate = useNavigate();
  const allowNavigationRef = useRef(false);
  const [searchParams] = useSearchParams();
  const lockedVersionId = searchParams.get('strategyVersionId') ?? '';
  const { versions, adoptVersion } = useExperimentResearchVersions(strategies);
  const [convertingVersion, setConvertingVersion] = useState(false);
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<'existing' | 'discovery'>(
    lockedVersionId ? 'existing' : 'existing',
  );
  const [strategyVersionId, setStrategyVersionId] = useState(
    lockedVersionId || versions[0]?.version.id || '',
  );
  const discovery = useExperimentDiscoveryInstrument();
  const discoverySymbol = discovery.symbol;
  const discoveryMarket = discovery.instrument?.market ?? 'CN';
  const discoveryAssetType = discovery.instrument?.assetType ?? 'stock';
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
  const [preparedConfig, setPreparedConfig] = useState<PreparedOptimizationConfiguration | null>(
    null,
  );
  const [maxAiCalls, setMaxAiCalls] = useState('6');
  const [maxBacktestRuns, setMaxBacktestRuns] = useState('20');
  const [maxInputTokens, setMaxInputTokens] = useState('100000');
  const [maxOutputTokens, setMaxOutputTokens] = useState('20000');
  const [maxDurationSeconds, setMaxDurationSeconds] = useState('1800');
  const [maxCost, setMaxCost] = useState('');
  const [acknowledgeUnknownCost, setAcknowledgeUnknownCost] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitIntentId] = useState(() => createClientRequestId());
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
  }, [lockedVersionId]);
  useEffect(() => {
    if (!strategyVersionId && versions[0]) setStrategyVersionId(versions[0].version.id);
  }, [strategyVersionId, versions]);
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
    ? strategySchema.safeParse(selectedVersion.version.schema)
    : null;
  let reviewLabel = `${selectedVersion?.strategy.name ?? '策略'} v${selectedVersion?.version.version ?? '?'}`;
  if (sourceMode === 'existing') {
    if (parsedStrategy?.success)
      reviewLabel += ` · ${strategyInstrumentLabel(selectedVersion?.version.instrumentDirectory, parsedStrategy.data.executionInstrument.symbol)}`;
  } else {
    reviewLabel = discovery.selected?.displayName || discoverySymbol || '未填写标的';
    if (discovery.selected?.displayName && discovery.selected.displayName !== discoverySymbol)
      reviewLabel += ` · ${discoverySymbol}`;
    reviewLabel += ' 从零探索';
  }
  let market: 'CN' | 'HK' | 'US' = discoveryMarket;
  if (sourceMode === 'existing') {
    market = parsedStrategy?.success ? parsedStrategy.data.executionInstrument.market : 'CN';
  }
  const currency = currencyByMarket[market];
  const validateStep = (targetStep: number) => {
    const errors: FieldErrors = {};
    if (targetStep >= 1) {
      if (sourceMode === 'existing' && !strategyVersionId) errors.source = '请选择明确的策略版本。';
      if (sourceMode === 'existing' && parsedStrategy?.success && parsedStrategy.data.schemaVersion !== '3')
        errors.source = '请先确认研究口径并保存新版本，再继续实验。';
      if (sourceMode === 'discovery' && !discovery.instrument) errors.source = '请从目录选择探索标的。';
      if (sourceMode === 'existing' && selectedParameters.length === 0)
        errors.source = '至少授权一个可优化参数。';
    }
    if (targetStep >= 2) {
      if (selectedRoutes.length === 0) errors.models = '至少选择一个可用的提供方和模型。';
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
      if (invalidReasoning) errors.models = '推理强度不符合提供方能力配置。';
    }
    if (targetStep >= 3) {
      const budgetError = experimentBudgetError({
        maxAiCalls: Number(maxAiCalls), maxBacktestRuns: Number(maxBacktestRuns),
        maxInputTokens: Number(maxInputTokens), maxOutputTokens: Number(maxOutputTokens),
        maxDurationSeconds: Number(maxDurationSeconds),
        ...(!hasUnknownCost && maxCost.trim() ? { maxCost: maxCost.trim() } : {}),
      });
      if (!Number.isFinite(Number(initialCash)) || Number(initialCash) <= 0)
        errors.budget = '初始资金必须是大于 0 的有效金额。';
      if (budgetError) errors.budget = budgetError;
      if (!maxBacktestRuns.trim()) errors.budget = '请填写回测次数上限；填 0 表示不限制。';
      if (!maxAiCalls.trim()) errors.budget = '请填写 AI 调用上限；填 0 表示不限制。';
      if (!maxInputTokens.trim()) errors.budget = '请填写输入 Token 上限；填 0 表示不限制。';
      if (!maxOutputTokens.trim()) errors.budget = '请填写输出 Token 上限；填 0 表示不限制。';
      if (hasUnknownCost && !acknowledgeUnknownCost)
        errors.cost = '所选模型存在未知费用或币种，请先确认。';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const preparationTarget = experimentPreparationTarget(sourceMode, strategyVersionId, {
    executionInstrument: {
      symbol: discovery.instrument?.symbol ?? '',
      market: discoveryMarket,
      assetType: discoveryAssetType,
    },
    primaryTimeframe: '1d',
  });
  const settings = (): Extract<StrategySubmissionInput, {kind:'optimization'}>['settings'] => {
      if (!validateStep(3)) throw new Error('请修正表单中的问题。');
      const models = selectedRoutes.map((route) => {
        const effort = reasoningEfforts[routeKey(route.provider, route.model)];
        return {
          provider: route.provider,
          model: route.model,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        };
      });
      return {
        ...(sourceMode === 'existing' ? { allowedParameterIds: selectedParameters } : {}),
        models,
        objective: { mode: objective, minClosedTrades: 1 },
        split: {
          development: { start: startDate, end: developmentEnd },
          validation: { start: nextExperimentDay(developmentEnd), end: validationEnd },
          test: { start: nextExperimentDay(validationEnd), end: endDate },
        },
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
      };
  };
  const createMutation = useMutation({
    mutationFn: () => {
      const runConfig = requirePreparedOptimizationConfiguration(
        preparedConfig,
        preparationTarget,
        startDate,
        endDate,
        currency,
        initialCash,
      );
      const input: OptimizationExperimentCreate = {
        ...settings(), ...preparationTarget, contractVersion:3, runConfig,
        idempotencyKey: submitIntentId,
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: (experiment) => {
      void queryClient.invalidateQueries({ queryKey: [...optimizationKey, 'experiments'] });
      toast.add({ title: '实验已创建', description: '已收到创建确认，无需重复提交。', type: 'success' });
      queryClient.setQueryData([...optimizationKey, 'experiment', experiment.id], {
        experiment, candidates: [], attempts: [],
      });
      allowNavigationRef.current = true;
      void navigate(strategyCenterPath.experiment(experiment.id), { replace: true });
    },
    onError: (error) =>
      setFieldErrors((current) => ({
        ...current,
        budget: experimentCreateFailure(error),
      })),
  });
  useNavigationGuard({
    dirty: touched,
    busy: createMutation.isPending || convertingVersion,
    bypass: () => allowNavigationRef.current,
    draft: { sourceMode, strategyVersionId, discoverySymbol, discoveryMarket, discoveryAssetType,
      objective, selectedModels, reasoningEfforts, selectedParameters, startDate, developmentEnd,
      validationEnd, endDate, initialCash, preparedConfig, maxAiCalls, maxBacktestRuns,
      maxInputTokens, maxOutputTokens, maxDurationSeconds, maxCost, acknowledgeUnknownCost },
  });
  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  };
  const markTouched = () => setTouched(true);

  if (lockedVersionId && !selectedVersion && versions.length > 0)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法锁定实验来源</AlertTitle>
        <AlertDescription>
          指定的正式策略版本不可用，请重新选择来源。
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
      <header className="flex flex-col gap-2">
        <Link
          to={strategyCenterPath.experiments}
          className="inline-flex min-h-8 items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-50"
          aria-disabled={createMutation.isPending}
          onClick={(event) => {
            if (createMutation.isPending) event.preventDefault();
          }}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回 AI 实验
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">新建 AI 实验</h2>
        <p className="text-sm text-muted-foreground">
          前三步只保留输入，最后确认时才创建实验。
        </p>
      </header>
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
      <section className="flex flex-col gap-5" aria-label={stepTitle}>
        <header className="flex flex-col gap-1">
          <h3 className="text-xl font-medium">{stepTitle}</h3>
          <p className="text-sm text-muted-foreground">{stepDescription}</p>
        </header>
        <div className="flex flex-col gap-5">
          {step === 1 ? (
            <FieldGroup className="max-w-2xl gap-5">
              {lockedVersionId ? (
                <Alert>
                  <AlertTitle>来源已锁定</AlertTitle>
                  <AlertDescription>
                    {selectedVersion
                      ? `${selectedVersion.strategy.name} v${selectedVersion.version.version}`
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
                    disabled={Boolean(lockedVersionId) || convertingVersion}
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
                      <SelectValue>{selectedVersion ? `${selectedVersion.strategy.name} · v${selectedVersion.version.version}` : '选择明确版本'}</SelectValue>
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
                <ExperimentDiscoveryInstrumentField
                  discovery={discovery}
                  error={fieldErrors.source}
                  onChange={markTouched}
                />
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
              {sourceMode === 'existing' && <ExperimentResearchVersionChoice entry={selectedVersion}
                disabled={createMutation.isPending || convertingVersion} onBusyChange={setConvertingVersion}
                onAdopt={version => {
                  if (!selectedVersion) return;
                  adoptVersion(selectedVersion.strategy, version); setStrategyVersionId(version.id);
                  setSelectedParameters([]); setPreparedConfig(null); setFieldErrors({}); markTouched();
                }} />}
              <Field>
                <FieldLabel>优化目标</FieldLabel>
                <Select value={objective} onValueChange={(value) => value && setObjective(value)}>
                  <SelectTrigger className="w-full">
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
            </FieldGroup>
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
              <StrategyExperimentDateFields
                values={{ startDate, developmentEnd, validationEnd, endDate }}
                onChange={(field, value) => {
                  const setters = { startDate: setStartDate, developmentEnd: setDevelopmentEnd,
                    validationEnd: setValidationEnd, endDate: setEndDate };
                  setters[field](value);
                }}
                validationStart={nextExperimentDay(developmentEnd)}
                testStart={nextExperimentDay(validationEnd)}
                error={fieldErrors.dates}
              />
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
                <ExperimentBudgetFields value={{ maxAiCalls, maxBacktestRuns, maxInputTokens, maxOutputTokens, maxDurationSeconds }}
                  onChange={(field, value) => {
                    const setters = { maxAiCalls: setMaxAiCalls, maxBacktestRuns: setMaxBacktestRuns,
                      maxInputTokens: setMaxInputTokens, maxOutputTokens: setMaxOutputTokens, maxDurationSeconds: setMaxDurationSeconds };
                    setters[field](value);
                    setFieldErrors((current) => { const next = { ...current }; delete next.budget; return next; });
                  }} />
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
              <OptimizationPricePreparation
                target={preparationTarget}
                startDate={startDate}
                endDate={endDate}
                currency={currency}
                initialCash={initialCash}
                onPrepared={setPreparedConfig}
              />
              <StrategyExperimentConfigurationReview
                label={reviewLabel}
                modelCount={selectedRoutes.length}
                currency={currency}
                startDate={startDate}
                developmentEnd={developmentEnd}
                validationStart={nextExperimentDay(developmentEnd)}
                validationEnd={validationEnd}
                testStart={nextExperimentDay(validationEnd)}
                endDate={endDate}
                submitIntentId={submitIntentId}
              />
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
              <Button disabled={convertingVersion} onClick={next}>下一步</Button>
            ) : (
              <Button
                disabled={!preparedConfig || createMutation.isPending}
                aria-busy={createMutation.isPending}
                onClick={() => { if (validateStep(3)) createMutation.mutate(); }}
              >
                {createMutation.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                {createMutation.isPending ? '创建中…' : '创建实验'}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
