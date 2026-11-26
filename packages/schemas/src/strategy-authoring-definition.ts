import { z } from 'zod';
import { isPriceResearchStrategyDefinition, dailyOrderPriceExpressions, expressionChildren, strategyRuleExpressions } from '@thesis-ledger/domain';
import { strategySchema, type BacktestStrategy } from './backtest-strategy.js';
import { priceResearchStrategyIssues } from './backtest-price-research-strategy.js';

export const AUTHORING_CAPABILITY_VERSION = 'authoring-v1' as const;
export const AUTHORING_LIMITS = {
  descriptionCharacters: 12_000,
  collectionItems: 64,
  definitionCharacters: 65_536,
  snapshotBytes: 131_072,
  outputBytes: 65_536,
  outputTokens: 8_192,
  astDepth: 8,
  astNodes: 128,
  deadlineMs: 300_000,
  leaseMs: 60_000,
  maxRedeliveries: 2,
} as const;

// Bound untrusted JSON before invoking the recursive Canonical AST schema.
export const boundedAuthoringDefinitionSchema = z
  .string()
  .max(AUTHORING_LIMITS.definitionCharacters)
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: 'custom', message: '策略定义必须是 JSON' });
      return z.NEVER;
    }
  })
  .superRefine((value, ctx) => {
    const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
    let nodes = 0;
    while (queue.length) {
      const current = queue.pop()!;
      if (!current.value || typeof current.value !== 'object') continue;
      nodes += 1;
      if (nodes > 512 || current.depth > 24) {
        ctx.addIssue({ code: 'custom', message: '策略定义超过结构复杂度上限' });
        return;
      }
      for (const child of Object.values(current.value))
        queue.push({ value: child, depth: current.depth + 1 });
    }
  })
  .pipe(strategySchema);

type AuthoringIssue = (message: string, path?: (string | number)[]) => void;

function checkAuthoringSources(strategy: BacktestStrategy, fail: AuthoringIssue) {
  const instrument = strategy.executionInstrument;
  const coordinates = strategy.signalSources.map((source) => source.priceCoordinate);
  if (isPriceResearchStrategyDefinition(strategy)) {
    if (strategy.signalSources.length > 2 || new Set(coordinates).size !== coordinates.length)
      fail('同一标的每种价格口径只支持一个信号源', ['signalSources']);
    for (const issue of priceResearchStrategyIssues(strategy)) fail(issue.message, issue.path);
  } else if (strategy.signalSources.length !== 1) fail('首期仅支持一个信号源', ['signalSources']);
  for (const source of strategy.signalSources) {
    if (
      source.asset.symbol !== instrument.symbol ||
      source.asset.market !== instrument.market ||
      source.asset.assetType !== instrument.assetType ||
      source.timeframe !== strategy.primaryTimeframe
    )
      fail('信号源必须与执行标的和主周期一致', ['signalSources']);
  }
  if (strategy.benchmark) fail('首期不支持额外基准标的', ['benchmark']);
}

function checkAuthoringIndicator(
  strategy: BacktestStrategy,
  node: Record<string, unknown>,
  fail: AuthoringIssue,
) {
  const input = node.input as Record<string, unknown>;
  if (input?.type !== 'series') fail('首期指标输入必须是声明的序列');
  if (node.name !== 'ATR' && node.name !== 'VWAP') return;
  if (input?.field !== 'close') fail('ATR/VWAP 必须使用收盘价序列携带的 OHLCV 事实');
  const required = node.name === 'ATR' ? ['high', 'low', 'close'] : ['close', 'volume'];
  const source = strategy.signalSources.find((item) => item.id === input?.sourceId);
  if (
    strategy.executionInstrument.assetType === 'fund' ||
    required.some((field) => !source?.series.includes(field as never))
  )
    fail('ATR/VWAP 需要场内标的及完整必需序列');
}

function checkAuthoringConditions(strategy: BacktestStrategy, fail: AuthoringIssue) {
  const queue = [
    { value: strategy.entry as unknown, depth: 1 },
    { value: strategy.exit as unknown, depth: 1 },
    ...dailyOrderPriceExpressions(strategy.execution).map(({ expression }) => ({ value: expression, depth: 1 })),
  ];
  let nodes = 0;
  while (queue.length) {
    const { value: candidate, depth } = queue.pop()!;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const node = candidate as Record<string, unknown>;
    nodes += 1;
    if (nodes > AUTHORING_LIMITS.astNodes || depth > AUTHORING_LIMITS.astDepth) {
      fail('策略条件超过首期复杂度上限');
      return;
    }
    if (node.type === 'corporateActionEvent') fail('公司行为信号需要独立事实确认，首期编写不支持');
    if (node.type === 'indicator') checkAuthoringIndicator(strategy, node, fail);
    for (const key of ['input', 'left', 'right', 'expression', 'conditions']) {
      const child = node[key];
      if (Array.isArray(child))
        for (const item of child) queue.push({ value: item, depth: depth + 1 });
      else if (child) queue.push({ value: child, depth: depth + 1 });
    }
  }
}

export const authoringStrategySchema = boundedAuthoringDefinitionSchema.superRefine(
  (value, ctx) => {
    const strategy = value as BacktestStrategy;
    const fail: AuthoringIssue = (message, path = []) =>
      ctx.addIssue({ code: 'custom', message, path });
    checkAuthoringSources(strategy, fail);
    checkAuthoringConditions(strategy, fail);
  },
);

/** V6共用完整合法子节点，不把逻辑来源周期强制成执行主周期。 */
export const authoringStrategyV6Schema = boundedAuthoringDefinitionSchema.superRefine((value, ctx) => {
  const strategy = value as BacktestStrategy;
  if (strategy.benchmark || strategy.signalSources.some((source) => source.asset.symbol !== strategy.executionInstrument.symbol ||
    source.asset.market !== strategy.executionInstrument.market || source.asset.assetType !== strategy.executionInstrument.assetType))
    ctx.addIssue({ code: 'custom', path: ['signalSources'], message: '编写来源必须属于本次唯一执行标的' });
  const queue = strategyRuleExpressions(strategy).map((root) => ({ expression: root.expression, depth: 1 }));
  let nodes = 0;
  while (queue.length) {
    const current = queue.pop()!;
    if (++nodes > AUTHORING_LIMITS.astNodes || current.depth > AUTHORING_LIMITS.astDepth) {
      ctx.addIssue({ code: 'custom', message: '策略条件超过复杂度上限' }); break;
    }
    if (current.expression.type === 'corporateActionEvent') ctx.addIssue({ code: 'custom', message: '公司行动信号需要独立事实，本期编写不支持' });
    for (const expression of expressionChildren(current.expression)) queue.push({ expression, depth: current.depth + 1 });
  }
  for (const issue of priceResearchStrategyIssues(strategy)) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});

export const authoringDefinitionCheck = (definitionText: string) => {
  if (!definitionText.trim()) return { status: 'incomplete' as const, issues: [] as string[] };
  const parsed = boundedAuthoringDefinitionSchema.safeParse(definitionText);
  if (!parsed.success)
    return {
      status: 'invalid' as const,
      issues: parsed.error.issues.map((issue) => issue.message).slice(0, 20),
    };
  return { status: 'structurally_valid' as const, issues: [] as string[] };
};
