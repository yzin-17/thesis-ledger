import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  strategySchema,
  type OptimizationExperimentCreate,
  type OptimizationReasoningEffort,
  type StrategySubmissionInput,
} from '@thesis-ledger/schemas';
import { useEffect, useState } from 'react';
import { createClientRequestId } from '../../lib/client-request-id';
import { useExperimentDiscoveryInstrument } from './ExperimentDiscoveryInstrumentField.js';
import { routeKey } from './StrategyOptimizationModelSelector.js';
import { experimentCreateFailure } from './experiment-budget.js';
import {
  experimentPreparationTarget,
  requirePreparedOptimizationConfiguration,
  type PreparedOptimizationConfiguration,
} from './optimization.preparation.js';
import {
  cancelOptimizationExperiment,
  cloneOptimizationExperiment,
  createOptimizationExperiment,
  fetchOptimizationCapabilities,
  fetchOptimizationCompare,
  fetchOptimizationExperiments,
  fetchStrategyOptimizationParameters,
} from './strategy-optimization.api.js';
import type { StrategyRecord } from './strategy.types.js';
import { useExperimentResearchVersions } from './use-experiment-research-versions.js';
const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;

const settledStatuses = new Set(['awaiting_finalization', 'succeeded', 'failed', 'cancelled']);

const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;

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

const objectiveLabels = {
  return: '优先收益',
  drawdown: '优先低回撤',
  balanced: '收益 / 回撤平衡',
  lowTurnover: '优先低换手',
} as const;

function useStrategyOptimizationExperimentPanel({ strategies }: { strategies: StrategyRecord[] }) {
  const inputs = useOptimizationExperimentInputs(strategies);
  const {
    queryClient,
    versions,
    strategyVersionId,
    sourceMode,
    discovery,
    discoveryMarket,
    discoveryAssetType,
    discoveryTimeframe,
    selectedModels,
    selectedParameters,
    setSelectedParameters,
    objective,
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
    setSelectedExperimentId,
    reasoningEfforts,
    setFeedback,
    capabilities,
  } = inputs;
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
    ? strategySchema.safeParse(selectedVersion.version.schema)
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

  const preparationTarget = experimentPreparationTarget(sourceMode, strategyVersionId, {
    executionInstrument: {
      symbol: discovery.instrument?.symbol ?? '',
      market: discoveryMarket,
      assetType: discoveryAssetType,
    },
    primaryTimeframe: discoveryAssetType === 'fund' ? '1d' : discoveryTimeframe,
  });
  const settings = (): Extract<StrategySubmissionInput, { kind: 'optimization' }>['settings'] => {
    if (!maxBacktestRuns.trim()) throw new Error('请填写回测次数上限；填 0 表示不限制。');
    if (!maxAiCalls.trim()) throw new Error('请填写 AI 调用上限；填 0 表示不限制。');
    if (!maxInputTokens.trim()) throw new Error('请填写输入 Token 上限；填 0 表示不限制。');
    if (!maxOutputTokens.trim()) throw new Error('请填写输出 Token 上限；填 0 表示不限制。');
    if (sourceMode === 'existing' && !strategyVersionId) throw new Error('请选择策略版本');
    if (sourceMode === 'discovery' && !discovery.instrument)
      throw new Error('请从目录选择探索标的');
    if (selectedModels.length === 0) throw new Error('至少选择一个模型');
    if (sourceMode === 'existing' && selectedParameters.length === 0)
      throw new Error('至少授权一个参数');
    if (hasInvalidReasoningSelection) throw new Error('所选模型的推理强度不受提供方能力配置支持');
    const models = selectedProviderRoutes.map((route) => {
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
        validation: { start: addDays(developmentEnd, 1), end: validationEnd },
        test: { start: addDays(validationEnd, 1), end: endDate },
      },
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
        idempotencyKey: createClientRequestId(),
      };
      return createOptimizationExperiment(input);
    },
    onSuccess: async (experiment) => {
      setSelectedExperimentId(experiment.id);
      setFeedback('实验已创建。开发集与验证集先运行，测试集保持封存。');
      await invalidate();
    },
    onError: (error) => setFeedback(experimentCreateFailure(error)),
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

  return {
    ...inputs,
    hasUnknownCost,
    toggleParameter,
    currency,
    selectedVersion,
    createMutation,
    preparationTarget,
    hasInvalidReasoningSelection,
    invalidate,
    cloneMutation,
    cancelMutation,
  };
}

function useOptimizationExperimentInputs(strategies: StrategyRecord[]) {
  const queryClient = useQueryClient();
  const { versions, adoptVersion } = useExperimentResearchVersions(strategies);
  const [convertingVersion, setConvertingVersion] = useState(false);
  const [strategyVersionId, setStrategyVersionId] = useState(versions[0]?.version.id ?? '');
  const [sourceMode, setSourceMode] = useState<'existing' | 'discovery'>('existing');
  const discovery = useExperimentDiscoveryInstrument();
  const discoveryMarket = discovery.instrument?.market ?? 'CN';
  const discoveryAssetType = discovery.instrument?.assetType ?? 'stock';
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
      query.state.data?.items.some((item) => !settledStatuses.has(item.status)) ? 3_000 : false,
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
    if (!selectedExperimentId && experiments.data?.items[0])
      setSelectedExperimentId(experiments.data.items[0].id);
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
  return {
    queryClient,
    versions,
    adoptVersion,
    convertingVersion,
    setConvertingVersion,
    strategyVersionId,
    setStrategyVersionId,
    sourceMode,
    setSourceMode,
    discovery,
    discoveryMarket,
    discoveryAssetType,
    discoveryTimeframe,
    setDiscoveryTimeframe,
    selectedModels,
    setSelectedModels,
    selectedParameters,
    setSelectedParameters,
    objective,
    setObjective,
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
    selectedExperimentId,
    setSelectedExperimentId,
    reasoningEfforts,
    setReasoningEfforts,
    feedback,
    setFeedback,
    capabilities,
    parameters,
    experiments,
    compare,
  };
}
export { addDays, objectiveLabels, settledStatuses, useStrategyOptimizationExperimentPanel };
