import { BadRequestException } from '@nestjs/common';
import {
  optimizationDiscoveryGenerationOutputSchema,
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
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'percentOfEquity', percent: '0.5' },
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
  const envelope =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { strategy: value };
  const candidate = envelope.strategy;
  let raw = envelope;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const strategy = candidate as Record<string, unknown>;
    if (strategy.benchmark === null) {
      const withoutBenchmark = { ...strategy };
      delete withoutBenchmark.benchmark;
      raw = { ...envelope, strategy: withoutBenchmark };
    }
  }
  const parsed = optimizationDiscoveryProposalSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 5).map((issue) => {
      const path = issue.path.map((part) => String(part)).join('.') || '<root>';
      return `${path}: ${issue.message}`;
    });
    const suffix = details.length > 0 ? `；校验问题：${details.join('；')}` : '';
    throw new BadRequestException(`AI 探索输出必须包含完整 StrategySchemaV2 候选${suffix}`);
  }
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
      '你是策略探索器。只能在 strategy-space-v1 内生成完整 StrategySchemaV2 JSON；输出前必须先把 responseTemplate 完整复制为响应，不得省略任何 strategy 顶层字段、不得使用省略号或只返回修改片段，再仅修改允许探索的策略字段。必须复制 seed 中固定的执行标的、市场、资产类型、主周期和 execution，生成合法完整对象。策略顶层只能包含 schemaVersion/name/description/signalSources/executionInstrument/primaryTimeframe/entry/exit/sizing/risk/execution/cost/benchmark，首版禁止 benchmark；只能使用一个与执行标的和主周期一致的 SignalSource，不得生成代码、外部标的或未声明数据。entry 和 exit 必须是 BooleanExpression：只能使用 {type:all,conditions:[...]}/{type:any,conditions:[...]}/{type:not,expression:{...}}、{type:compare,operator:eq|neq|gt|gte|lt|lte,left:NumericExpression,right:NumericExpression}、{type:cross,direction:above|below,left:NumericExpression,right:NumericExpression} 或 {type:positionState,field:isOpen}；NumericExpression 只能使用 {type:constant,value:decimal string}、{type:series,sourceId,field}、{type:indicator,name,input,params,可选 MACD output} 或 {type:positionState,field:quantity|averageCost|holdingPeriods}。indicator.input 必须是完整 NumericExpression，例如 {"type":"series","sourceId":"discovery-primary","field":"close"}；周期必须放在 indicator.params，例如 {"period":20}。禁止 and/or/condition/rule 等未声明 type。sizing 必须是严格对象，例如 {"type":"percentOfEquity","percent":"0.9"}；risk 必须是数组，例如 [{"type":"fixedStop","percent":"0.05"}]，不得输出以 fixedStop/fixedTakeProfit 为键的对象。percentOfEquity.percent、targetWeight.weight、fixedStop.percent、fixedTakeProfit.percent 都必须是字符串比例，范围为 (0,1]，例如 "0.9" 而不是 90；maxHoldingPeriod.periods 只能使用正整数。响应 envelope 只能包含 strategy、reason、evidenceRefs；objective、round、priorCandidates 是输入上下文，不得复制到 strategy。只输出合法完整的 {"strategy":完整策略,"reason":说明,"evidenceRefs":[]} JSON，绩效由服务端真实回测。',
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
        strategyTopLevelKeys:
          'only schemaVersion/name/description/signalSources/executionInstrument/primaryTimeframe/entry/exit/sizing/risk/execution/cost/benchmark; benchmark forbidden in first version',
        fixedScopeAndExecution:
          'copy seed executionInstrument, primaryTimeframe, and execution exactly; emit a complete valid StrategySchemaV2 object',
        booleanExpression:
          "entry/exit must be BooleanExpression: {type:'all',conditions:[...]}, {type:'any',conditions:[...]}, {type:'not',expression:{...}}, {type:'compare',operator:'eq|neq|gt|gte|lt|lte',left:NumericExpression,right:NumericExpression}, {type:'cross',direction:'above|below',left:NumericExpression,right:NumericExpression}, or {type:'positionState',field:'isOpen'}",
        numericExpression:
          "only {type:'constant',value:decimal string}, {type:'series',sourceId,field}, {type:'indicator',name,input,params,optional MACD output}, or {type:'positionState',field:'quantity|averageCost|holdingPeriods'}",
        indicatorExample: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          params: { period: 20 },
        },
        forbiddenAstTypes: 'and/or/condition/rule and every other undeclared type are forbidden',
        numericNodes: ['constant', 'series', 'indicator', 'positionState'],
        booleanNodes: ['all', 'any', 'not', 'compare', 'cross', 'positionState(isOpen)'],
        indicators: ['MA', 'EMA', 'RSI', 'MACD', 'ATR', 'VWAP', 'Highest', 'Lowest'],
        sizing: [
          '{type:"fixedAmount",amount:positive decimal string}',
          '{type:"percentOfEquity",percent:string ratio in (0,1]}, for example "0.9", not 90',
          '{type:"fixedQuantity",quantity:positive decimal string}',
          '{type:"targetWeight",weight:string ratio in (0,1]}, for example "0.9", not 90',
        ],
        risk: [
          'risk must be an array of strict rule objects, never an object keyed by rule names',
          '{type:"fixedStop",percent:string ratio in (0,1]}',
          '{type:"fixedTakeProfit",percent:string ratio in (0,1]}',
          '{type:"maxHoldingPeriod",periods:positive integer}',
        ],
        execution: [
          'exchange market DAY nextEligibleBarOpen',
          'nav subscribe/redeem nextAvailableNav',
        ],
        responseEnvelope:
          'only strategy/reason/evidenceRefs; objective/round/priorCandidates are input context and must not be copied into strategy',
        forbidden: ['benchmark', 'extra instruments', 'arbitrary code', 'unknown fields'],
      },
      seedStrategy: strategy,
      responseTemplate: {
        strategy,
        reason: '说明本轮策略规则及其假设，不得声称未经回测验证的绩效。',
        evidenceRefs: [],
      },
      objective: experiment.objective,
      round,
      priorCandidates,
    })}`,
  },
];

export const parseDiscoveryOutput = (experiment: ExperimentRow, value: unknown) =>
  parseDiscoveryProposal(value, experiment.discoveryScope as OptimizationDiscoveryScope);

const assertGeneratedSeriesReferences = (
  value: unknown,
  sourceId: string,
  series: ReadonlySet<string>,
) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertGeneratedSeriesReferences(item, sourceId, series));
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'series') {
    if (record.sourceId !== sourceId)
      throw new BadRequestException('探索候选只能引用冻结的 SignalSource ID');
    if (typeof record.field !== 'string' || !series.has(record.field))
      throw new BadRequestException('探索候选引用了未声明的 series');
  }
  Object.values(record).forEach((child) =>
    assertGeneratedSeriesReferences(child, sourceId, series),
  );
};

export const assembleDiscoveryGeneration = (
  experiment: ExperimentRow,
  seed: StrategySchemaV2,
  value: unknown,
): OptimizationDiscoveryProposal => {
  const generated = optimizationDiscoveryGenerationOutputSchema.parse(value);
  const fixedSource = seed.signalSources[0];
  if (!fixedSource || seed.signalSources.length !== 1)
    throw new BadRequestException('探索 seed 必须包含唯一 SignalSource');
  const declaredSeries = new Set(generated.strategy.series);
  assertGeneratedSeriesReferences(generated.strategy.entry, fixedSource.id, declaredSeries);
  assertGeneratedSeriesReferences(generated.strategy.exit, fixedSource.id, declaredSeries);
  const proposal = optimizationDiscoveryProposalSchema.parse({
    strategy: {
      schemaVersion: seed.schemaVersion,
      name: generated.strategy.name,
      ...(generated.strategy.description === undefined
        ? {}
        : { description: generated.strategy.description }),
      signalSources: [{ ...fixedSource, series: generated.strategy.series }],
      executionInstrument: seed.executionInstrument,
      primaryTimeframe: seed.primaryTimeframe,
      entry: generated.strategy.entry,
      exit: generated.strategy.exit,
      sizing: generated.strategy.sizing,
      risk: generated.strategy.risk,
      execution: seed.execution,
      cost: seed.cost,
    },
    ...(generated.reason === undefined ? {} : { reason: generated.reason }),
    evidenceRefs: generated.evidenceRefs,
  });
  return {
    ...proposal,
    strategy: validateDiscoveryStrategy(
      proposal.strategy,
      experiment.discoveryScope as OptimizationDiscoveryScope,
    ),
  };
};

export const discoveryGenerationPrompt = (
  experiment: ExperimentRow,
  seed: StrategySchemaV2,
  round: number,
  priorCandidates: Array<{ diff: unknown; metrics: unknown }>,
) => [
  {
    role: 'system' as const,
    content:
      '你是策略探索器。只输出精简 JSON：strategy 仅允许 name、description、series、entry、exit、sizing、risk；envelope 仅允许 strategy、reason、evidenceRefs。不得输出 schemaVersion、signalSources、executionInstrument、primaryTimeframe、execution、cost、benchmark 或外部标的。entry/exit 只能引用冻结 SignalSource ID 及 strategy.series 中声明的字段；不得生成代码或声称未经回测的绩效。',
  },
  {
    role: 'user' as const,
    content: `DISCOVERY_REQUEST_JSON:${JSON.stringify({
      semanticVersion: 'strategy-discovery-v2',
      strategySpaceVersion: experiment.strategySpaceVersion,
      scope: experiment.discoveryScope,
      frozenSource: {
        id: seed.signalSources[0]?.id,
        asset: seed.signalSources[0]?.asset,
        timeframe: seed.signalSources[0]?.timeframe,
      },
      objective: experiment.objective,
      round,
      priorCandidates,
    })}`,
  },
];

export const discoveryCandidateStrategy = (
  experiment: ExperimentRow,
  proposal: OptimizationDiscoveryProposal,
) =>
  validateDiscoveryStrategy(
    proposal.strategy,
    experiment.discoveryScope as OptimizationDiscoveryScope,
  );

export const discoveryCandidateDiff = () => [{ kind: 'full-strategy', sourceMode: 'discovery' }];
