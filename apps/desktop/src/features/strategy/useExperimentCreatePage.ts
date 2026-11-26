import { useToastManager } from '@/components/ui/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  strategySchema,
  type OptimizationExperimentCreate,
  type OptimizationReasoningEffort,
  type StrategySubmissionInput,
} from '@thesis-ledger/schemas';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { createClientRequestId } from '../../lib/client-request-id';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { useExperimentDiscoveryInstrument } from './ExperimentDiscoveryInstrumentField.js';
import type { objectiveLabels } from './useOptimizationExperimentPanel.js';
import { routeKey } from './StrategyOptimizationModelSelector.js';
import { experimentBudgetError, experimentCreateFailure } from './experiment-budget.js';
import {
  experimentPreparationTarget,
  requirePreparedOptimizationConfiguration,
  type PreparedOptimizationConfiguration,
} from './optimization.preparation.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import {
  createOptimizationExperiment,
  fetchOptimizationCapabilities,
  fetchStrategyOptimizationParameters,
  type OptimizationCapabilities,
} from './strategy-optimization.api.js';
import type { StrategyRecord } from './strategy.types.js';
import { useExperimentResearchVersions } from './use-experiment-research-versions.js';
const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;

const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

const nextExperimentDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return isoDate(date);
};

const experimentCostPolicy = (routes: OptimizationCapabilities['providers']) => {
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

function useStrategyExperimentCreatePage({ strategies }: { strategies: StrategyRecord[] }) {
  const inputs = useExperimentCreateInputs(strategies);
  const {
    queryClient,
    toast,
    navigate,
    allowNavigationRef,
    convertingVersion,
    step,
    setStep,
    sourceMode,
    strategyVersionId,
    discovery,
    discoverySymbol,
    discoveryMarket,
    discoveryAssetType,
    objective,
    selectedModels,
    reasoningEfforts,
    selectedParameters,
    startDate,
    developmentEnd,
    validationEnd,
    endDate,
    initialCash,
    preparedConfig,
    maxAiCalls,
    maxBacktestRuns,
    maxInputTokens,
    maxOutputTokens,
    maxDurationSeconds,
    maxCost,
    acknowledgeUnknownCost,
    setFieldErrors,
    submitIntentId,
    touched,
    setTouched,
  } = inputs;

  const selection = experimentCreateSelection(inputs);
  const { selectedRoutes, hasUnknownCost, currency } = selection;
  const validateStep = (targetStep: number) => {
    const errors: FieldErrors = {};
    if (targetStep >= 1) {
      validateExperimentSource({ ...inputs, ...selection }, errors);
    }
    if (targetStep >= 2) {
      validateExperimentModelAndDates({ ...inputs, ...selection }, errors);
    }
    if (targetStep >= 3) {
      validateExperimentBudget({ ...inputs, ...selection }, errors);
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
  const settings = (): Extract<StrategySubmissionInput, { kind: 'optimization' }>['settings'] => {
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
        ...settings(),
        ...preparationTarget,
        contractVersion: 1,
        runConfig,
        idempotencyKey: submitIntentId,
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: (experiment) => {
      void queryClient.invalidateQueries({ queryKey: [...optimizationKey, 'experiments'] });
      toast.add({
        title: '实验已创建',
        description: '已收到创建确认，无需重复提交。',
        type: 'success',
      });
      queryClient.setQueryData([...optimizationKey, 'experiment', experiment.id], {
        experiment,
        candidates: [],
        attempts: [],
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
    draft: {
      sourceMode,
      strategyVersionId,
      discoverySymbol,
      discoveryMarket,
      discoveryAssetType,
      objective,
      selectedModels,
      reasoningEfforts,
      selectedParameters,
      startDate,
      developmentEnd,
      validationEnd,
      endDate,
      initialCash,
      preparedConfig,
      maxAiCalls,
      maxBacktestRuns,
      maxInputTokens,
      maxOutputTokens,
      maxDurationSeconds,
      maxCost,
      acknowledgeUnknownCost,
    },
  });
  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  };
  const markTouched = () => setTouched(true);

  let stepTitle = '策略与目标';
  let stepDescription = '确定不可静默变化的实验来源。';
  if (step === 2) {
    stepTitle = '模型与数据';
    stepDescription = '模型路由、推理强度和三段数据区间会写入实验快照。';
  } else if (step === 3) {
    stepTitle = '预算与确认';
    stepDescription = '核对资金和硬限制后创建一次实验。';
  }

  return {
    ...inputs,
    ...selection,
    markTouched,
    createMutation,
    stepTitle,
    stepDescription,
    preparationTarget,
    next,
    validateStep,
  };
}

function useExperimentCreateInputs(strategies: StrategyRecord[]) {
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
  return {
    queryClient,
    toast,
    navigate,
    allowNavigationRef,
    searchParams,
    lockedVersionId,
    versions,
    adoptVersion,
    convertingVersion,
    setConvertingVersion,
    step,
    setStep,
    sourceMode,
    setSourceMode,
    strategyVersionId,
    setStrategyVersionId,
    discovery,
    discoverySymbol,
    discoveryMarket,
    discoveryAssetType,
    objective,
    setObjective,
    selectedModels,
    setSelectedModels,
    reasoningEfforts,
    setReasoningEfforts,
    selectedParameters,
    setSelectedParameters,
    startDate,
    setStartDate,
    developmentEnd,
    setDevelopmentEnd,
    validationEnd,
    setValidationEnd,
    endDate,
    setEndDate,
    initialCash,
    setInitialCash,
    preparedConfig,
    setPreparedConfig,
    maxAiCalls,
    setMaxAiCalls,
    maxBacktestRuns,
    setMaxBacktestRuns,
    maxInputTokens,
    setMaxInputTokens,
    maxOutputTokens,
    setMaxOutputTokens,
    maxDurationSeconds,
    setMaxDurationSeconds,
    maxCost,
    setMaxCost,
    acknowledgeUnknownCost,
    setAcknowledgeUnknownCost,
    fieldErrors,
    setFieldErrors,
    submitIntentId,
    touched,
    setTouched,
    capabilities,
    parameters,
  };
}

function experimentCreateSelection(input: ReturnType<typeof useExperimentCreateInputs>) {
  const { capabilities, selectedModels, versions, strategyVersionId, sourceMode, discoveryMarket } =
    input;
  const selectedRoutes = (capabilities.data?.providers ?? []).filter((route) =>
    selectedModels.includes(routeKey(route.provider, route.model)),
  );
  const { hasUnknownCost, knownCurrencies, mixedCurrencies } = experimentCostPolicy(selectedRoutes);
  const selectedVersion = versions.find((entry) => entry.version.id === strategyVersionId) ?? null;
  const parsedStrategy = selectedVersion?.version.schema
    ? strategySchema.safeParse(selectedVersion.version.schema)
    : null;
  const { reviewLabel } = experimentCreateReviewLabel(input, selectedVersion, parsedStrategy);
  let market: 'CN' | 'HK' | 'US' = discoveryMarket;
  if (sourceMode === 'existing') {
    market = parsedStrategy?.success ? parsedStrategy.data.executionInstrument.market : 'CN';
  }
  const currency = currencyByMarket[market];
  return {
    selectedRoutes,
    hasUnknownCost,
    knownCurrencies,
    mixedCurrencies,
    selectedVersion,
    parsedStrategy,
    reviewLabel,
    currency,
  };
}

function validateExperimentSource(
  input: ReturnType<typeof useExperimentCreateInputs> &
    ReturnType<typeof experimentCreateSelection>,
  errors: FieldErrors,
) {
  const { sourceMode, strategyVersionId, discovery, selectedParameters, parsedStrategy } = input;

  if (sourceMode === 'existing' && !strategyVersionId) errors.source = '请选择明确的策略版本。';
  if (
    sourceMode === 'existing' &&
    parsedStrategy?.success &&
    !isPriceResearchStrategyDefinition(parsedStrategy.data)
  )
    errors.source = '请先确认研究口径并保存新版本，再继续实验。';
  if (sourceMode === 'discovery' && !discovery.instrument) errors.source = '请从目录选择探索标的。';
  if (sourceMode === 'existing' && selectedParameters.length === 0)
    errors.source = '至少授权一个可优化参数。';
}

function validateExperimentModelAndDates(
  input: ReturnType<typeof useExperimentCreateInputs> &
    ReturnType<typeof experimentCreateSelection>,
  errors: FieldErrors,
) {
  const {
    reasoningEfforts,
    startDate,
    developmentEnd,
    validationEnd,
    endDate,
    selectedRoutes,
    knownCurrencies,
    mixedCurrencies,
  } = input;

  if (selectedRoutes.length === 0) errors.models = '至少选择一个可用的提供方和模型。';
  if (mixedCurrencies)
    errors.cost = `所选模型包含不同费用币种：${knownCurrencies.join('、')}。请改为同币种模型。`;
  if (!(startDate <= developmentEnd && developmentEnd < validationEnd && validationEnd < endDate))
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

function validateExperimentBudget(
  input: ReturnType<typeof useExperimentCreateInputs> &
    ReturnType<typeof experimentCreateSelection>,
  errors: FieldErrors,
) {
  const {
    initialCash,
    maxAiCalls,
    maxBacktestRuns,
    maxInputTokens,
    maxOutputTokens,
    maxDurationSeconds,
    maxCost,
    acknowledgeUnknownCost,
    hasUnknownCost,
  } = input;

  const budgetError = experimentBudgetError({
    maxAiCalls: Number(maxAiCalls),
    maxBacktestRuns: Number(maxBacktestRuns),
    maxInputTokens: Number(maxInputTokens),
    maxOutputTokens: Number(maxOutputTokens),
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

function experimentCreateReviewLabel(
  input: ReturnType<typeof useExperimentCreateInputs>,
  selectedVersion: ReturnType<typeof useExperimentResearchVersions>['versions'][number] | null,
  parsedStrategy: ReturnType<typeof strategySchema.safeParse> | null,
) {
  const { sourceMode, discovery, discoverySymbol } = input;
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
  return { reviewLabel };
}
export { experimentCostPolicy, nextExperimentDay, useStrategyExperimentCreatePage };
import { isPriceResearchStrategyDefinition } from '@thesis-ledger/domain';
