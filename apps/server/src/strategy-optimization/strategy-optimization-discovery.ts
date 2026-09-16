import { BadRequestException } from '@nestjs/common';
import {
  optimizationDiscoveryProposalSchema,
  strategySchemaV2,
  type OptimizationDiscoveryProposal,
  type OptimizationDiscoveryScope,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import type { ExperimentRow } from './strategy-optimization-common.js';

export const STRATEGY_SPACE_VERSION = 'strategy-space-v1' as const;
const MAX_AST_DEPTH = 8;

const sameInstrument = (
  left: StrategySchemaV2['executionInstrument'],
  right: OptimizationDiscoveryScope['executionInstrument'],
) =>
  left.symbol === right.symbol &&
  left.market === right.market &&
  left.assetType === right.assetType;

const astDepth = (value: unknown, depth = 0): number => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return depth;
  const node = value as Record<string, unknown>;
  const children = Object.entries(node).filter(
    ([key]) =>
      key === 'input' ||
      key === 'left' ||
      key === 'right' ||
      key === 'expression' ||
      key === 'conditions',
  );
  return children.reduce((max, [, child]) => {
    if (Array.isArray(child))
      return Math.max(max, ...child.map((item) => astDepth(item, depth + 1)));
    return Math.max(max, astDepth(child, depth + 1));
  }, depth);
};

export const createDiscoverySeed = (scope: OptimizationDiscoveryScope): StrategySchemaV2 => {
  const sourceId = 'discovery-primary';
  const isFund = scope.executionInstrument.assetType === 'fund';
  return {
    schemaVersion: '2',
    name: 'AI 探索种子（实验内）',
    description: '仅用于 AI 从零探索的隐藏 v0 种子，不是正式策略。',
    signalSources: [
      {
        id: sourceId,
        asset: scope.executionInstrument,
        timeframe: scope.primaryTimeframe,
        series: [isFund ? 'nav' : 'close'],
      },
    ],
    executionInstrument: scope.executionInstrument,
    primaryTimeframe: scope.primaryTimeframe,
    entry: {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId, field: isFund ? 'nav' : 'close' },
      right: { type: 'constant', value: '0' },
    },
    exit: {
      type: 'compare',
      operator: 'lt',
      left: { type: 'series', sourceId, field: isFund ? 'nav' : 'close' },
      right: { type: 'constant', value: '0' },
    },
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: isFund
      ? { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' }
      : {
          mode: 'exchange',
          orderType: 'market',
          timeInForce: 'DAY',
          timing: 'nextEligibleBarOpen',
        },
    cost: { commissionRate: '0', slippageRate: '0' },
  };
};

export const validateDiscoveryStrategy = (
  candidate: unknown,
  scope: OptimizationDiscoveryScope,
): StrategySchemaV2 => {
  const parsed = strategySchemaV2.safeParse(candidate);
  if (!parsed.success) throw new BadRequestException('AI 探索候选不是合法的 StrategySchemaV2');
  const strategy = parsed.data as StrategySchemaV2;
  if (!sameInstrument(strategy.executionInstrument, scope.executionInstrument))
    throw new BadRequestException('探索候选不得改变执行标的、市场或资产类型');
  if (strategy.primaryTimeframe !== scope.primaryTimeframe)
    throw new BadRequestException('探索候选不得改变主周期');
  if (strategy.signalSources.length !== 1)
    throw new BadRequestException('首版探索只允许一个 SignalSource');
  const source = strategy.signalSources[0]!;
  if (
    !sameInstrument(source.asset, scope.executionInstrument) ||
    source.timeframe !== scope.primaryTimeframe
  )
    throw new BadRequestException('探索候选的 SignalSource 必须与执行标的和主周期一致');
  if (strategy.benchmark) throw new BadRequestException('探索候选不得引入额外标的');
  if (astDepth(strategy.entry) > MAX_AST_DEPTH || astDepth(strategy.exit) > MAX_AST_DEPTH)
    throw new BadRequestException(`探索候选 AST 深度不能超过 ${MAX_AST_DEPTH}`);
  return strategy;
};

export const parseDiscoveryProposal = (
  value: unknown,
  scope: OptimizationDiscoveryScope,
): OptimizationDiscoveryProposal => {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { strategy: value };
  const parsed = optimizationDiscoveryProposalSchema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException('AI 探索输出必须包含完整 StrategySchemaV2 候选');
  return { ...parsed.data, strategy: validateDiscoveryStrategy(parsed.data.strategy, scope) };
};

export const discoveryPrompt = (
  experiment: ExperimentRow,
  strategy: StrategySchemaV2,
  round: number,
  priorCandidates: Array<{ diff: unknown; metrics: unknown }>,
) => [
  {
    role: 'system',
    content:
      '你是策略探索器。只能在 strategy-space-v1 内生成完整 StrategySchemaV2 JSON；只能使用一个与执行标的和主周期一致的 SignalSource，不得生成代码、外部标的或未声明数据。只输出 {"strategy":完整策略,"reason":说明}，绩效由服务端真实回测。',
  },
  {
    role: 'user',
    content: `DISCOVERY_REQUEST_JSON:${JSON.stringify({
      semanticVersion: 'strategy-optimization-v1',
      strategySpaceVersion: experiment.strategySpaceVersion,
      scope: experiment.discoveryScope,
      contract: {
        maxAstDepth: 8,
        signalSources:
          'exactly one; same symbol/market/assetType/timeframe as scope; declared series only',
        numericNodes: ['constant', 'series', 'indicator', 'positionState'],
        booleanNodes: ['all', 'any', 'not', 'compare', 'cross', 'positionState(isOpen)'],
        indicators: ['MA', 'EMA', 'RSI', 'MACD', 'ATR', 'VWAP', 'Highest', 'Lowest'],
        sizing: ['fixedAmount', 'percentOfEquity', 'fixedQuantity', 'targetWeight'],
        risk: ['fixedStop', 'fixedTakeProfit', 'maxHoldingPeriod'],
        execution: [
          'exchange market DAY nextEligibleBarOpen',
          'nav subscribe/redeem nextAvailableNav',
        ],
        forbidden: ['benchmark', 'extra instruments', 'arbitrary code', 'unknown fields'],
      },
      seedStrategy: strategy,
      objective: experiment.objective,
      round,
      priorCandidates,
    })}`,
  },
];

export const parseDiscoveryOutput = (experiment: ExperimentRow, value: unknown) =>
  parseDiscoveryProposal(value, experiment.discoveryScope as OptimizationDiscoveryScope);

export const discoveryCandidateStrategy = (
  experiment: ExperimentRow,
  proposal: OptimizationDiscoveryProposal,
) =>
  validateDiscoveryStrategy(
    proposal.strategy,
    experiment.discoveryScope as OptimizationDiscoveryScope,
  );

export const discoveryCandidateDiff = () => [{ kind: 'full-strategy', sourceMode: 'discovery' }];
