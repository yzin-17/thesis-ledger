import type { BacktestExecutionModel } from '@thesis-ledger/schemas';
import { formatDecimalRatioPercent } from '@thesis-ledger/domain';
import type { StrategyBacktestGroupPage } from './strategy-optimization.api.js';
import type {
  BacktestJob,
  BacktestJobResult,
  BacktestSetupInput,
  StrategyRecord,
  StrategyVersion,
} from './strategy.types.js';

type BacktestGroup = StrategyBacktestGroupPage['items'][number];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const backtestNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const record = asRecord(value);
  if (record && 'amount' in record) return backtestNumber(record.amount);
  return null;
};

const availableMetricValue = (value: unknown): unknown => {
  const record = asRecord(value);
  if (!record || !('status' in record)) return value;
  return record.status === 'available' ? record.value : null;
};

export const backtestMetricNumber = (value: unknown): number | null =>
  backtestNumber(availableMetricValue(value));

const decimalText = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const amount = asRecord(value);
  return amount && 'amount' in amount ? decimalText(amount.amount) : null;
};

/** 文本比例保留有效数字；回撤幅度只移除符号，不改变原指标。 */
export const backtestMetricPercent = (value: unknown, magnitude = false): string | null => {
  const text = decimalText(availableMetricValue(value));
  if (text === null) return null;
  const formatted = formatDecimalRatioPercent(magnitude ? text.replace(/^[+-]/, '') : text);
  return formatted === '—' ? null : formatted;
};

export const backtestMetricReason = (value: unknown) => {
  const record = asRecord(value);
  return typeof record?.reason === 'string' ? record.reason : null;
};

export const resolveBacktestVersion = (
  strategies: StrategyRecord[],
  strategyVersionId: string,
): { strategy: StrategyRecord; version: StrategyVersion } | null => {
  for (const strategy of strategies) {
    const version = strategy.versions.find((candidate) => candidate.id === strategyVersionId);
    if (version) return { strategy, version };
  }
  return null;
};

export const backtestIdentity = (
  job: BacktestJob,
  strategies: StrategyRecord[],
  group: BacktestGroup | null,
) => {
  const member = group?.members.find((candidate) => candidate.jobId === job.id) ?? null;
  if (group?.kind === 'experiment' && member) {
    if (member.relation === 'candidate' && member.candidateSource) {
      return {
        title: `${group.name} · 候选 ${member.candidateSource.candidateNumber}`,
        subtitle: member.split ? `实验阶段 ${member.split}` : '实验候选回测',
        sourceKind: 'experiment' as const,
        sourceId: group.experimentId,
      };
    }
    return {
      title: `${group.name} · 基线`,
      subtitle: member.split ? `实验阶段 ${member.split}` : '实验基线回测',
      sourceKind: 'experiment' as const,
      sourceId: group.experimentId,
    };
  }
  if (group?.kind === 'user' && group.source?.kind === 'existing') {
    return {
      title: `${group.source.strategyName ?? '策略名称未记录'} · v${group.source.version}`,
      subtitle: '用户发起的回测',
      sourceKind: 'strategy' as const,
      sourceId: group.source.strategyId,
    };
  }
  const exact = resolveBacktestVersion(strategies, job.strategyVersionId);
  if (exact) {
    return {
      title: `${exact.strategy.name} · v${exact.version.version}`,
      subtitle: '用户发起的回测',
      sourceKind: 'strategy' as const,
      sourceId: exact.strategy.id,
    };
  }
  return {
    title: '来源信息未记录',
    subtitle: `策略版本 ${job.strategyVersionId}`,
    sourceKind: 'unknown' as const,
    sourceId: null,
  };
};

export const readableBacktestResult = (job: BacktestJob): BacktestJobResult | null => {
  if (job.readEligibility?.state === 'restricted') return null;
  return asRecord(job.result);
};

export const backtestBaseCurrency = (job: BacktestJob, result: BacktestJobResult | null) => {
  const input = asRecord(job.input);
  const runConfig = asRecord(input?.runConfig);
  const configured = runConfig?.baseCurrency ?? input?.baseCurrency;
  if (configured === 'CNY' || configured === 'HKD' || configured === 'USD') return configured;
  const firstPoint = Array.isArray(result?.equityCurve) ? asRecord(result.equityCurve[0]) : null;
  const value = asRecord(firstPoint?.value);
  const fromCurve = value?.currency;
  if (fromCurve === 'CNY' || fromCurve === 'HKD' || fromCurve === 'USD') return fromCurve;
  return null;
};

export const backtestExecutionSymbol = (job: BacktestJob, version: StrategyVersion | null) => {
  const input = asRecord(job.input);
  const runConfig = asRecord(input?.runConfig);
  const executionModel = asRecord(runConfig?.executionModel ?? input?.executionModel);
  const scope = asRecord(executionModel?.scope);
  if (typeof scope?.symbol === 'string') return scope.symbol;
  if (typeof input?.symbol === 'string') return input.symbol;
  const schema = asRecord(version?.schema);
  const executionInstrument = asRecord(schema?.executionInstrument);
  if (typeof executionInstrument?.symbol === 'string') return executionInstrument.symbol;
  const universe = asRecord(schema?.universe);
  const instruments = Array.isArray(universe?.instruments) ? universe.instruments : [];
  const first = asRecord(instruments[0]);
  return typeof first?.symbol === 'string' ? first.symbol : null;
};

export const backtestTimeframe = (job: BacktestJob, version: StrategyVersion | null) => {
  const input = asRecord(job.input);
  const runConfig = asRecord(input?.runConfig);
  const executionModel = asRecord(runConfig?.executionModel ?? input?.executionModel);
  const scope = asRecord(executionModel?.scope);
  if (typeof scope?.timeframe === 'string') return scope.timeframe;
  const schema = asRecord(version?.schema);
  if (typeof schema?.primaryTimeframe === 'string') return schema.primaryTimeframe;
  return typeof schema?.timeframe === 'string' ? schema.timeframe : null;
};

export const backtestResultCollections = (result: BacktestJobResult | null) => ({
  trades: Array.isArray(result?.trades) ? result.trades : [],
  fills: Array.isArray(result?.simulationFills)
    ? (result.simulationFills as Array<Record<string, unknown>>)
    : [],
  orders: Array.isArray(result?.orders) ? (result.orders as Array<Record<string, unknown>>) : [],
  rejectedOrders: Array.isArray(result?.rejectedOrders) ? result.rejectedOrders : [],
  rejectedNavRequests: Array.isArray(result?.rejectedNavRequests)
    ? (result.rejectedNavRequests as Array<Record<string, unknown>>)
    : [],
  equityCurve: Array.isArray(result?.equityCurve) ? result.equityCurve : [],
});

export const deriveBacktestRerun = (job: BacktestJob) => {
  const missing: string[] = [];
  if (job.readEligibility?.state === 'restricted') {
    return { setup: null, missing: ['封存测试任务未揭示，不能克隆配置'] };
  }
  const input = asRecord(job.input);
  const runConfig = asRecord(input?.runConfig);
  const { start, end } = rerunWindow(job, runConfig);
  if (!start || !end) missing.push('回测区间');

  const { currency, cash } = rerunFunding(job, input, runConfig);
  if (cash === null) missing.push('初始资金');

  const { executionModel, adjustment, validAdjustment } = rerunExecution(input, runConfig);
  if (runConfig?.schemaVersion === '3' && !validAdjustment) missing.push('价格口径');
  if (missing.length > 0 || !start || !end || cash === null) return { setup: null, missing };
  const setup: BacktestSetupInput = {
    period: { start, end },
    initialCash: cash,
    ...(validAdjustment ? { adjustment } : {}),
    ...(currency === 'CNY' || currency === 'HKD' || currency === 'USD'
      ? { baseCurrency: currency }
      : {}),
    ...(executionModel ? { executionModel: executionModel as BacktestExecutionModel } : {}),
  };
  return { setup, missing: [] };
};

function rerunWindow(job: BacktestJob, runConfig: Record<string, unknown> | null) {
  const start =
    typeof runConfig?.startDate === 'string'
      ? runConfig.startDate
      : (job.period?.start ?? job.periodStart);
  const end =
    typeof runConfig?.endDate === 'string' ? runConfig.endDate : (job.period?.end ?? job.periodEnd);
  return { start, end };
}

function rerunFunding(
  job: BacktestJob,
  input: Record<string, unknown> | null,
  runConfig: Record<string, unknown> | null,
) {
  const currency = runConfig?.baseCurrency;
  const initialCash = asRecord(runConfig?.initialCash);
  const cashSource =
    currency === 'CNY' || currency === 'HKD' || currency === 'USD'
      ? initialCash?.[currency]
      : (input?.initialCash ?? job.initialCash);
  const cash = backtestNumber(cashSource);
  return { currency, cash };
}

function rerunExecution(
  input: Record<string, unknown> | null,
  runConfig: Record<string, unknown> | null,
) {
  const executionModel = runConfig?.executionModel ?? input?.executionModel;
  const adjustment = asRecord(asRecord(runConfig?.executionPriceProtocol)?.priceBasis)?.adjustment;
  const validAdjustment = adjustment === 'none' || adjustment === 'qfq' || adjustment === 'hfq';
  if (validAdjustment) return { executionModel, adjustment, validAdjustment: true } as const;
  return { executionModel, adjustment: undefined, validAdjustment: false } as const;
}
