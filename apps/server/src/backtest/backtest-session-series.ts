import {
  backtestSessionClock,
  BacktestSessionVwapAccumulator,
  tradingCalendarFromFact,
  numericExpressionKey,
  sourceSeriesKey,
  mergeBacktestAvailability,
  expressionChildren,
  strategyRuleExpressions,
  finishBacktestComputation,
  mapBacktestComputationItems,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type BacktestSessionBar,
  type Expression,
} from '@thesis-ledger/domain';
import type { BacktestStrategy, RunConfigV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { calendarFact, rowFor } from './backtest-v2-execution-shared.js';

type SessionExpression = Extract<Expression, { type: 'sessionValue' }>;

function sessionExpressions(expressions: readonly Expression[]) {
  const output = new Map<string, SessionExpression>();
  const visit = (node: Expression): void => {
    if (node.type === 'sessionValue') output.set(numericExpressionKey(node), node);
    expressionChildren(node).forEach(visit);
  };
  expressions.forEach(visit);
  return output;
}

/** 每个决策时点都保留不可用点，求值器不得跨日或跨缺口回退旧会话值。 */
export function* exchangeSessionSeriesSteps(input: {
  strategy: BacktestStrategy;
  sourceSeries: ReadonlyMap<string, BacktestSeries>;
  calendarRows: readonly ArtifactRow[];
  ticks: readonly { occurredAt: string; availableAt: string }[];
  runConfig: RunConfigV3;
}): Generator<void, ReadonlyMap<string, BacktestSeries>, void> {
  const output = new Map<string, BacktestSeries>();
  let previous = -Infinity;
  for (const tick of input.ticks) {
    yield;
    const at = Date.parse(tick.occurredAt);
    if (!Number.isFinite(at) || at <= previous)
      throw new Error('DATA_UNAVAILABLE: 会话决策事件必须严格递增');
    previous = at;
  }
  const expressions = strategyRuleExpressions(input.strategy).map((root) => root.expression);
  for (const [key, expression] of sessionExpressions(expressions)) {
    const source = input.sourceSeries.get(sourceSeriesKey(expression.sourceId, 'close'));
    if (!source) continue;
    const fact = calendarFact(rowFor(input.calendarRows, (row) => row.market === source.market));
    const calendar = tradingCalendarFromFact(fact);
    const byDay = new Map<string, BacktestSessionBar[]>();
    const accumulators = new Map<string, { value: BacktestSessionVwapAccumulator; next: number }>();
    const byClose = new Map<number, BacktestSeriesPoint>();
    for (const point of source.points) {
      yield;
      if (!point.openedAt || !point.closedAt) continue;
      byClose.set(Date.parse(point.closedAt), point);
      const day = calendar.status(point.closedAt).date;
      const bars = byDay.get(day) ?? [];
      bars.push({
        openedAt: point.openedAt,
        closedAt: point.closedAt,
        availableAt: point.availableAt,
        ...(point.researchClock ? { researchClock: point.researchClock } : {}),
        ...(point.status !== 'unavailable' && point.value !== undefined
          ? { close: point.value }
          : {}),
        ...(point.volume !== undefined ? { volume: point.volume } : {}),
      });
      byDay.set(day, bars);
    }
    for (const bars of byDay.values())
      bars.sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
    const points = yield* mapBacktestComputationItems(input.ticks, (tick): BacktestSeriesPoint => {
      const researchClock =
        input.runConfig.executionPriceProtocol.history.basis === 'fixed-provider-snapshot'
          ? {
              basis: 'fixed-provider-snapshot' as const,
              dataAsOf: input.runConfig.dataAsOf,
              decisionAt: tick.occurredAt,
            }
          : undefined;
      const availability = {
        availableAt: fact.availableAt,
        ...(researchClock ? { researchClock } : {}),
      };
      const sourceCalendar = { calendar, availability };
      const current = byClose.get(Date.parse(tick.occurredAt));
      const base = {
        occurredAt: tick.occurredAt,
        availableAt: tick.availableAt,
        ...(researchClock ? { researchClock } : {}),
      };
      if (!current || current.status === 'unavailable')
        return { ...base, status: 'unavailable', reason: '会话缺少当前已完成收盘价' };
      const clock = backtestSessionClock(sourceCalendar, tick.occurredAt);
      if (clock.status === 'unavailable')
        return { ...base, status: 'unavailable', reason: clock.reason };
      const bars = byDay.get(clock.tradingDate) ?? [];
      const state = accumulators.get(clock.tradingDate) ?? {
        value: new BacktestSessionVwapAccumulator(calendar),
        next: 0,
      };
      if (expression.field === 'vwap') {
        while (
          state.next < bars.length &&
          Date.parse(bars[state.next]!.closedAt) <= Date.parse(tick.occurredAt)
        ) {
          state.value.append(bars[state.next]!, clock);
          state.next++;
        }
        accumulators.set(clock.tradingDate, state);
      }
      const result =
        expression.field === 'vwap' ? state.value.result(clock, tick.occurredAt) : clock;
      if (result.status === 'unavailable')
        return { ...base, status: 'unavailable', reason: result.reason };
      const cumulative = expression.field === 'vwap' ? state.value.inputAvailability() : undefined;
      const visible = mergeBacktestAvailability([
        availability,
        current,
        ...(cumulative ? [cumulative] : []),
      ]);
      return {
        ...base,
        ...visible,
        status: 'available',
        value: 'value' in result ? result.value : String(result.elapsedMinutes),
      };
    });
    output.set(key, { ...source, sourceId: key, points });
  }
  return output;
}

export const buildExchangeSessionSeries = (input: Parameters<typeof exchangeSessionSeriesSteps>[0]) => finishBacktestComputation(exchangeSessionSeriesSteps(input));
