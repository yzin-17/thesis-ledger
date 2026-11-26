export { discoveryGenerationPrompt } from './strategy-discovery-generation-prompt.js';
import { BadRequestException } from '@nestjs/common';
import {
  BACKTEST_DAILY_ORDER_PROMPT,
  BACKTEST_EXPRESSION_PROMPT,
  dailyOrderPriceExpressions,
} from '@thesis-ledger/domain';
import {
  BACKTEST_TRADE_PLAN_PROMPT,
  tradePlanProtectionRules,
  isPriceResearchStrategyDefinition,
} from '@thesis-ledger/domain';
import {
  optimizationDiscoveryGenerationOutputSchema,
  strategyCapabilityGapSchema,
  optimizationDiscoveryProposalSchema,
  strategySchema,
  projectPriceResearchStrategy,
  STRATEGY_CROSS_SEMANTICS_PROMPT,
  type OptimizationDiscoveryProposal,
  type OptimizationDiscoveryScope,
  type BacktestStrategy,
  discoveryGenerationOutputV6Schema, discoveryStrategyOutlineV6Schema, runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import { compileBacktestStrategy, StrategyCompilationError } from '../backtest/backtest-strategy-compiler.js';
import type { ExperimentRow } from './strategy-optimization-common.js';
import {
  usesOptimizationPriceResearch,
  requireOptimizationResearchStrategy,
  RESEARCH_STRATEGY_SPACE_VERSION,
  requireOptimizationPriceResearch,
} from './strategy-optimization-research.js';
import { StrategyCapabilityGapError } from './strategy-optimization-capability-gap.js';

export const STRATEGY_SPACE_VERSION = 'strategy-space-v1' as const;
type DiscoveryProposal = Omit<OptimizationDiscoveryProposal, 'strategy'> & {
  strategy: BacktestStrategy;
};
const MAX_AST_DEPTH = 8;

const sameInstrument = (
  left: BacktestStrategy['executionInstrument'],
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
      key === 'conditions' ||
      key === 'condition' ||
      key === 'trigger' ||
      key === 'confirm' ||
      key === 'invalidation' ||
      key === 'capture' ||
      key === 'sample',
  );
  return children.reduce((max, [, child]) => {
    if (Array.isArray(child))
      return Math.max(max, ...child.map((item) => astDepth(item, depth + 1)));
    return Math.max(max, astDepth(child, depth + 1));
  }, depth);
};

export const createDiscoverySeed = (
  scope: OptimizationDiscoveryScope,
  research = false,
): BacktestStrategy => {
  const sourceId = 'discovery-primary';
  const isFund = scope.executionInstrument.assetType === 'fund';
  const seed: BacktestStrategy = {
    schemaVersion: 'strategy-definition-v1',
    entryTrigger: 'rising-edge',
    name: 'AI 探索种子（实验内）',
    description: '仅用于 AI 从零探索的隐藏 v0 种子，不是正式策略。',
    signalSources: [
      {
        id: sourceId,
        asset: scope.executionInstrument,
        timeframe: scope.primaryTimeframe,
        series: [isFund ? 'nav' : 'close'],
        priceCoordinate: isFund ? 'native-nav' : research ? 'research' : 'run',
      },
    ],
    executionInstrument: scope.executionInstrument,
    primaryTimeframe: scope.primaryTimeframe,
    entry: {
      type: 'not',
      expression: { type: 'positionState', field: 'isOpen' },
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
  return research && !isFund ? projectPriceResearchStrategy(seed) : seed;
};

export const validateDiscoveryStrategy = (
  candidate: unknown,
  scope: OptimizationDiscoveryScope,
): BacktestStrategy => {
  const parsed = strategySchema.safeParse(candidate);
  if (!parsed.success) throw new BadRequestException('AI 探索候选不是合法的 BacktestStrategy');
  const strategy = parsed.data as BacktestStrategy;
  if (!sameInstrument(strategy.executionInstrument, scope.executionInstrument))
    throw new BadRequestException('探索候选不得改变执行标的、市场或资产类型');
  if (strategy.primaryTimeframe !== scope.primaryTimeframe)
    throw new BadRequestException('探索候选不得改变主周期');
  const maxSources = 12;
  if (strategy.signalSources.length > maxSources)
    throw new BadRequestException('探索候选最多允许同标的六种周期的研究价格与实际价格来源');
  for (const source of strategy.signalSources) {
    if (!sameInstrument(source.asset, scope.executionInstrument))
      throw new BadRequestException(
        '探索候选的 SignalSource 必须属于唯一下单标的；独立参考资产尚未进入冻结探索范围',
      );
  }
  if (strategy.benchmark) throw new BadRequestException('探索候选不得引入额外标的');
  if (
    [
      strategy.entry,
      strategy.exit,
      ...tradePlanProtectionRules(strategy.tradePlan).map((rule) => rule.expression),
      ...dailyOrderPriceExpressions(strategy.execution).map((rule) => rule.expression),
    ].some((expression) => astDepth(expression) > MAX_AST_DEPTH)
  )
    throw new BadRequestException(`探索候选 AST 深度不能超过 ${MAX_AST_DEPTH}`);
  return strategy;
};

export const parseDiscoveryProposal = (
  value: unknown,
  scope: OptimizationDiscoveryScope,
): DiscoveryProposal => {
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
    throw new BadRequestException(`AI 探索输出必须包含完整 BacktestStrategy 候选${suffix}`);
  }
  return { ...parsed.data, strategy: validateDiscoveryStrategy(parsed.data.strategy, scope) };
};

export const discoveryPrompt = (
  experiment: ExperimentRow,
  strategy: BacktestStrategy,
  round: number,
  priorCandidates: Array<{ diff: unknown; metrics: unknown }>,
) => [
  {
    role: 'system',
    content:
      STRATEGY_CROSS_SEMANTICS_PROMPT +
      BACKTEST_EXPRESSION_PROMPT +
      BACKTEST_TRADE_PLAN_PROMPT +
      BACKTEST_DAILY_ORDER_PROMPT +
      '你是策略探索器。只能在 strategy-space-v1 内生成完整 BacktestStrategy JSON；可精确表达时先把 responseTemplate 完整复制为响应；缺数据或执行能力则返回status=unsupported、originalRule、reason、gaps(path/kind/detail)、supportedParts及evidenceRefs，不带strategy，不生成近似替代，不得省略任何 strategy 顶层字段、不得使用省略号或只返回修改片段，再仅修改允许探索的策略字段。固定复制 seed 的执行标的、市场、资产类型和主周期；execution 按明确委托需求生成，否则沿用 seed。生成合法完整对象。策略顶层只能包含 schemaVersion/name/description/signalSources/executionInstrument/primaryTimeframe/entry/exit/sizing/risk/tradePlan/execution/cost/benchmark，首版禁止 benchmark；允许同一执行标的的额外周期 SignalSource，ID唯一，各自声明周期和依赖字段；独立参考资产未冻结，不得生成代码、外部标的或未声明数据。entry 和 exit 必须是 BooleanExpression：只能使用 {type:all,conditions:[...]}/{type:any,conditions:[...]}/{type:not,expression:{...}}、{type:compare,operator:eq|neq|gt|gte|lt|lte,left:NumericExpression,right:NumericExpression}、{type:cross,direction:above|below,left:NumericExpression,right:NumericExpression} 或 {type:positionState,field:isOpen}；NumericExpression 使用正式 Schema 的数值、算术、历史及窗口节点；必须保留完整子对象和来源。indicator.input 必须是完整 NumericExpression，例如 {"type":"series","sourceId":"discovery-primary","field":"close"}；周期必须放在 indicator.params，例如 {"period":20}。禁止 and/or/condition/rule 等未声明 type。sizing 必须是严格对象，例如 {"type":"percentOfEquity","percent":"0.9"}；risk 必须是数组，例如 [{"type":"fixedStop","percent":"0.05"}]，不得输出以 fixedStop/fixedTakeProfit 为键的对象。percentOfEquity.percent、targetWeight.weight、fixedStop.percent、fixedTakeProfit.percent 都必须是字符串比例，范围为 (0,1]，例如 "0.9" 而不是 90；maxHoldingPeriod.periods 只能使用正整数。响应 envelope 只能包含 strategy、reason、evidenceRefs；objective、round、priorCandidates 是输入上下文，不得复制到 strategy。只输出合法完整的 {"strategy":完整策略,"reason":说明,"evidenceRefs":[]} JSON，绩效由服务端真实回测。',
  },
  {
    role: 'user',
    content: `DISCOVERY_REQUEST_JSON:${JSON.stringify({
      semanticVersion: 'strategy-optimization-v1',
      strategySpaceVersion: experiment.strategySpaceVersion,
      scope: experiment.discoveryScope,
      contract: {
        maxAstDepth: 8,
        signalSources: '同标的，可声明额外周期；唯一ID，分别声明字段和价格坐标；独立参考资产未冻结',
        strategyTopLevelKeys:
          'only schemaVersion/name/description/signalSources/executionInstrument/primaryTimeframe/entry/exit/sizing/risk/tradePlan/execution/cost/benchmark; benchmark forbidden in first version',
        fixedScopeAndExecution:
          '固定复制 seed 的标的和主周期；明确委托需求可生成 execution，否则沿用原执行；输出完整策略',
        booleanExpression:
          "entry/exit must be BooleanExpression: {type:'all',conditions:[...]}, {type:'any',conditions:[...]}, {type:'not',expression:{...}}, {type:'compare',operator:'eq|neq|gt|gte|lt|lte',left:NumericExpression,right:NumericExpression}, {type:'cross',direction:'above|below',left:NumericExpression,right:NumericExpression}, or {type:'positionState',field:'isOpen'}",
        numericExpression:
          'constant={type:constant,value:decimal string}；positionState.field=quantity|averageCost|holdingPeriods；其余正式数值节点与语义见系统合同，保留完整类型、子节点、来源及参数',
        indicatorExample: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          params: { period: 20 },
        },
        forbiddenAstTypes: 'and/or/condition/rule and every other undeclared type are forbidden',
        numericNodes: [
          'constant',
          'series',
          'indicator',
          'positionState',
          'sessionValue',
          'arithmetic',
          'absolute',
          'lag',
          'rolling',
          'cumulative',
          'countTrue',
          'eventValue',
          'confirmedPivot',
        ],
        booleanNodes: [
          'all',
          'any',
          'not',
          'compare',
          'cross',
          'positionState(isOpen)',
          'consecutive',
          'sequence',
        ],
        indicators: ['MA', 'EMA', 'RSI', 'MACD', 'ADX', 'ATR', 'VWAP', 'Highest', 'Lowest'],
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
          'exchange dailyBarOrders orders（完整委托模板）',
          'nav subscribe/redeem nextAvailableNav',
        ],
        responseEnvelope:
          '成功为strategy/reason/evidenceRefs；能力缺口为unsupported报告，不能带strategy；输入上下文不复制到strategy',
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

export const parseDiscoveryOutput = (
  experiment: ExperimentRow,
  value: unknown,
): DiscoveryProposal => {
  const gap = strategyCapabilityGapSchema.safeParse(value);
  if (gap.success) throw new StrategyCapabilityGapError(gap.data);
  return parseDiscoveryProposal(value, experiment.discoveryScope as OptimizationDiscoveryScope);
};

const assertGeneratedSeriesReferences = (
  value: unknown,
  sources: ReadonlyMap<string, ReadonlySet<string>>,
) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertGeneratedSeriesReferences(item, sources));
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'series') {
    const series = typeof record.sourceId === 'string' ? sources.get(record.sourceId) : undefined;
    if (!series) throw new BadRequestException('探索候选只能引用已声明的同标的 SignalSource ID');
    if (typeof record.field !== 'string' || !series.has(record.field))
      throw new BadRequestException('探索候选引用了未声明的 series');
  }
  Object.values(record).forEach((child) => assertGeneratedSeriesReferences(child, sources));
};

export const assembleDiscoveryGeneration = (
  experiment: ExperimentRow,
  seed: BacktestStrategy,
  value: unknown,
  onCompilation?: (compilation: ReturnType<typeof compileBacktestStrategy>) => void,
): DiscoveryProposal => {
  const gap = strategyCapabilityGapSchema.safeParse(value);
  if (gap.success) throw new StrategyCapabilityGapError(gap.data);
  if (experiment.strategySpaceVersion === RESEARCH_STRATEGY_SPACE_VERSION) {
    const config = runConfigSchemaV3.parse(experiment.runConfig);
    requireOptimizationPriceResearch(config, { strategySpaceVersion: experiment.strategySpaceVersion });
    const envelope = value as { strategy?: unknown; reason?: unknown; evidenceRefs?: unknown };
    const generated = discoveryStrategyOutlineV6Schema.parse(envelope?.strategy);
    const { reason, evidenceRefs } = discoveryGenerationOutputV6Schema.omit({ strategy: true }).parse({ reason: envelope.reason, evidenceRefs: envelope.evidenceRefs });
    const compilation = compileBacktestStrategy({ ...generated, schemaVersion: 'strategy-definition-v1',
      signalSources: generated.signalSources.map((source) => ({ ...source, asset: seed.executionInstrument })),
      executionInstrument: seed.executionInstrument, primaryTimeframe: seed.primaryTimeframe,
      execution: generated.execution ?? seed.execution, cost: seed.cost,
    }, config.priceResearch!.dataScope);
    onCompilation?.(compilation);
    if (!compilation.definition) throw new StrategyCompilationError(compilation);
    return { strategy: validateDiscoveryStrategy(compilation.definition, experiment.discoveryScope as OptimizationDiscoveryScope), reason, evidenceRefs };
  }
  const generated = optimizationDiscoveryGenerationOutputSchema.parse(value);
  const fixedSource = seed.signalSources[0];
  if (!fixedSource || seed.signalSources.length !== 1)
    throw new BadRequestException('探索 seed 必须包含唯一 SignalSource');
  const signalSources = [
    { ...fixedSource, series: generated.strategy.series },
    ...(generated.strategy.additionalSources ?? []).map((source) => ({
      ...fixedSource,
      id: source.id,
      timeframe: source.timeframe,
      series: source.series,
    })),
  ];
  if (new Set(signalSources.map((source) => source.id)).size !== signalSources.length)
    throw new BadRequestException('探索来源 ID 不能重复或覆盖主来源');
  const declarations = new Map(signalSources.map((source) => [source.id, new Set(source.series)]));
  for (const expression of [
    generated.strategy.entry,
    generated.strategy.exit,
    generated.strategy.tradePlan,
    generated.strategy.execution,
  ])
    assertGeneratedSeriesReferences(expression, declarations);
  const proposal = optimizationDiscoveryProposalSchema.parse({
    strategy: {
      schemaVersion: seed.schemaVersion,
      name: generated.strategy.name,
      ...(generated.strategy.description === undefined
        ? {}
        : { description: generated.strategy.description }),
      signalSources,
      executionInstrument: seed.executionInstrument,
      primaryTimeframe: seed.primaryTimeframe,
      entry: generated.strategy.entry,
      exit: generated.strategy.exit,
      sizing: generated.strategy.sizing,
      risk: generated.strategy.risk,
      ...(generated.strategy.tradePlan ? { tradePlan: generated.strategy.tradePlan } : {}),
      execution: generated.strategy.execution ?? seed.execution,
      cost: seed.cost,
    },
    ...(generated.reason === undefined ? {} : { reason: generated.reason }),
    evidenceRefs: generated.evidenceRefs,
  });
  const strategy = isPriceResearchStrategyDefinition(seed)
    ? projectPriceResearchStrategy(proposal.strategy as BacktestStrategy)
    : proposal.strategy;
  return {
    ...proposal,
    strategy: validateDiscoveryStrategy(
      strategy,
      experiment.discoveryScope as OptimizationDiscoveryScope,
    ),
  };
};

export const discoveryCandidateStrategy = (
  experiment: ExperimentRow,
  proposal: OptimizationDiscoveryProposal,
) => {
  const strategy = validateDiscoveryStrategy(
    proposal.strategy,
    experiment.discoveryScope as OptimizationDiscoveryScope,
  );
  if (usesOptimizationPriceResearch(experiment.runConfig))
    requireOptimizationResearchStrategy(strategy);
  return strategy;
};

export const discoveryCandidateDiff = () => [{ kind: 'full-strategy', sourceMode: 'discovery' }];
