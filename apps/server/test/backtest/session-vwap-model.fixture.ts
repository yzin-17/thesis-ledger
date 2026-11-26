import {
  DecimalValue as D,
  evaluateBooleanExpression,
  numericExpressionKey,
  sourceSeriesKey,
  activeBacktestTradePlan,
  type Expression,
  type BooleanExpression,
  type BacktestSeries,
} from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { planAuthoringContent } from './trade-plan-authoring-content.fixture.js';

export const sessionVwapCases = [false, true].map((cumulative) => ({
  id: cumulative ? 'session-vwap' : 'rolling-vwap',
  intent:
    '使用一分钟行情，只在当日首个开市起前60分钟内，且恰好第31分钟那根行情收盘时判断，其他分钟即使满足条件也不买。空仓且收盘价高于' +
    (cumulative
      ? '从当日首个开市到此刻的累计成交量加权均价'
      : '最近20根已完成一分钟行情的滚动成交量加权均价') +
    '就投入权益25%，均价按收盘价乘成交量计算；除此之外不买入。下一可交易开盘执行，普通退出始终不触发，佣金和滑点都为零，不添加其他规则。',
}));

export function sessionVwapContent(cumulative: boolean) {
  const content = planAuthoringContent(false);
  content.description = sessionVwapCases[Number(cumulative)]!.intent;
  content.requirements = [
    {
      id: 'rules',
      quote: content.description,
      interpretation: content.description,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.timeframe = '1m';
  content.confirmation!.entrySummary = content.description;
  content.confirmation!.exitSummary = '普通退出始终不触发。';
  content.confirmation!.sizing = { type: 'percentOfEquity', percent: '0.25' };
  content.confirmation!.cost = { commissionRate: '0', slippageRate: '0' };
  return content;
}

export function sessionVwapPlanConforms(id: string, strategy: BacktestStrategy) {
  if (
    strategy.primaryTimeframe !== '1m' ||
    strategy.risk.length ||
    activeBacktestTradePlan(strategy.tradePlan) ||
    strategy.sizing.type !== 'percentOfEquity' ||
    D.from(strategy.sizing.percent).compareTo('0.25') !== 0
  )
    return false;
  const cumulative = id === 'session-vwap';
  const nodes: Expression[] = [];
  const visit = (node: Expression) => {
    nodes.push(node);
    if (node.type === 'all' || node.type === 'any') node.conditions.forEach(visit);
    else if (node.type === 'not') visit(node.expression);
    else if (node.type === 'compare' || node.type === 'cross') {
      visit(node.left);
      visit(node.right);
    } else if (node.type === 'indicator') visit(node.input);
  };
  visit(strategy.entry);
  const session = nodes.some((node) => node.type === 'sessionValue' && node.field === 'vwap');
  const rolling = nodes.filter((node) => node.type === 'indicator');
  if (
    session !== cumulative ||
    rolling.length !== Number(!cumulative) ||
    rolling.some(
      (node) =>
        node.type !== 'indicator' || node.name !== 'VWAP' || Number(node.params.period) !== 20,
    )
  )
    return false;
  return [
    [90, 31, false],
    [140, 31, cumulative],
    [210, 31, true],
    [210, 30, false],
    [210, 32, false],
    [210, 60, false],
    [210, 61, false],
  ].every(([price, minutes, expected]) => {
    const at = '2026-05-18T02:01:00Z';
    const sources = new Map<string, BacktestSeries>(),
      indicators = new Map<string, BacktestSeries>();
    for (const source of strategy.signalSources) {
      const base: BacktestSeries = {
        sourceId: source.id,
        symbol: source.asset.symbol,
        market: source.asset.market,
        assetType: source.asset.assetType,
        timeframe: source.timeframe,
        field: 'close',
        adjusted: true,
        points: [{ occurredAt: at, availableAt: at, value: String(price) }],
      };
      sources.set(sourceSeriesKey(source.id, 'close'), base);
      for (const node of nodes) {
        if (
          (node.type === 'sessionValue' && node.sourceId === source.id) ||
          node.type === 'indicator'
        ) {
          let value = '152';
          if (node.type === 'sessionValue')
            value = node.field === 'vwap' ? '133.54838709677419354838' : String(minutes);
          indicators.set(numericExpressionKey(node), {
            ...base,
            points: [{ occurredAt: at, availableAt: at, value }],
          });
        }
      }
    }
    const context = {
      tick: {
        occurredAt: at,
        availableAt: at,
        tradingDate: '2026-05-18',
        timeframe: '1m' as const,
      },
      sourceSeries: sources,
      indicatorSeries: indicators,
      positionState: {
        isOpen: false,
        quantity: '0',
        averageCost: '0',
        holdingPeriods: 0,
        availableAt: at,
      },
    };
    const result = evaluateBooleanExpression(strategy.entry as BooleanExpression, context);
    const exit = evaluateBooleanExpression(strategy.exit as BooleanExpression, context);
    const heldContext = {
      ...context,
      positionState: { ...context.positionState, isOpen: true, quantity: '1' },
    };
    const heldEntry = evaluateBooleanExpression(strategy.entry as BooleanExpression, heldContext);
    const heldExit = evaluateBooleanExpression(strategy.exit as BooleanExpression, heldContext);
    return (
      result.status === 'available' &&
      result.value === expected &&
      exit.status === 'available' &&
      !exit.value &&
      heldEntry.status === 'available' &&
      !heldEntry.value &&
      heldExit.status === 'available' &&
      !heldExit.value
    );
  });
}

export const sessionVwapExecutionConforms = (
  id: string,
  fills: readonly { side: string; occurredAt: string }[],
) =>
  id === 'rolling-vwap'
    ? fills.length === 0
    : fills.length === 1 &&
      fills[0]?.side === 'buy' &&
      fills[0].occurredAt === '2026-05-18T02:02:00.000Z';
