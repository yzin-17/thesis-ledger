import {
  DecimalValue,
  createRiskEvaluationAdapter,
  evaluateNumericExpression,
  evaluateSignalAt,
  navRequestFromTargetIntent,
  numericExpressionKey,
  type BooleanExpression,
  type CnNavRequest,
  type NumericEvaluation,
  type SimulationEngineInput,
} from '@thesis-ledger/domain';
import { adaptNavDomainInputsV3 } from './backtest-nav-domain-input.js';
import { compareNavOfflineTime } from './backtest-nav-offline-events.js';
import { runNavOfflineV3 } from './backtest-nav-offline.js';
import { numericExpressionsIn } from './backtest-v2-execution-shared.js';
import {
  navOfflineHoldingPeriods,
  navOfflineSignalInputs,
} from './backtest-nav-offline-signals.js';

/** 日频决策使用冻结估值时刻；预热只更新指标与 cross 历史，不消耗执行窗口的 entry edge。 */
export const runNavOfflineStrategyV3 = (
  frozen: Parameters<typeof adaptNavDomainInputsV3>[0],
  signal?: AbortSignal,
) => {
  const input = adaptNavDomainInputsV3(frozen);
  const { strategy, runConfig } = frozen.context;
  const requests: CnNavRequest[] = [];
  const sizingRejects: { occurredAt: string; code: string; reason: string }[] = [];
  const valuations: { evaluatedAt: string; equity: string | null }[] = [];
  const requestReasons: Record<string, 'signal' | 'risk'> = {};
  let edge: Parameters<typeof evaluateSignalAt>[2] = {};
  const previousNumeric = new Map<string, NumericEvaluation>();
  let sequence = 0;
  for (const date of input.plan.expectedValuationDates) {
    if (signal?.aborted) throw new Error('NAV 离线执行已取消');
    const at = `${date}T${runConfig.valuationPolicy.dailyValuationTime}:00+08:00`;
    const { latest, sourceSeries, indicatorSeries } = navOfflineSignalInputs(input, strategy, at);
    const current = runNavOfflineV3(frozen, requests, {
      through: at,
      ...(signal ? { signal } : {}),
    });
    const position = current.state.ledger.position;
    if (date >= input.plan.runWindow.startDate) {
      valuations.push({ evaluatedAt: at, equity: current.valuation.equity });
    }
    const openedAt = current.state.requests
      .filter((request) => request.requestType === 'subscribe' && request.confirmationAt)
      .sort((a, b) => compareNavOfflineTime(a.confirmationAt!, b.confirmationAt!))
      .at(-1)?.confirmationAt;
    const positionState = {
      quantity: position.quantity,
      averageCost: position.averageCost,
      isOpen: !DecimalValue.from(position.quantity).isZero(),
      holdingPeriods: navOfflineHoldingPeriods(input, openedAt, date),
      availableAt: at,
    };
    const risk = createRiskEvaluationAdapter({
      riskInputAt: () => ({
        runId: frozen.manifest.runId,
        executionSymbol: strategy.executionInstrument.symbol,
        rules: strategy.risk,
        position: { ...positionState, occurredAt: at },
        evaluation: {
          value: latest?.value ?? '0',
          occurredAt: latest?.occurredAt ?? at,
          availableAt: latest?.availableAt ?? at,
          completed: latest !== undefined,
          ...(latest ? {} : { status: 'unavailable' as const, reason: 'NAV 不可见' }),
        },
        evaluationAt: at,
      }),
    });
    const tick = { occurredAt: at, availableAt: at, timeframe: '1d' as const };
    const engine: SimulationEngineInput = {
      runId: frozen.manifest.runId,
      strategy,
      ticks: [],
      sourceSeries,
      indicatorSeries,
      positionState,
      risk: (context) => risk.asSimulationRisk(context),
    };
    const evaluated = evaluateSignalAt(engine, tick, edge, sequence++, previousNumeric);
    const context = { tick, sourceSeries, indicatorSeries, positionState, previousNumeric };
    for (const expression of [
      ...numericExpressionsIn(strategy.entry as BooleanExpression),
      ...numericExpressionsIn(strategy.exit as BooleanExpression),
    ]) {
      const value = evaluateNumericExpression(expression, context);
      if (value.status === 'available')
        previousNumeric.set(numericExpressionKey(expression), value);
    }
    if (date < input.plan.runWindow.startDate || !input.config.calendar.isTradingDay(at)) continue;
    // 等待中保留信号 edge，待结算后仍能消费尚未执行的信号。
    if (current.pendingRequests.length) continue;
    edge = evaluated.state;
    if (!evaluated.signal || !latest) continue;
    const value = evaluated.signal;
    const reason = value.kind === 'risk' ? 'risk' : 'signal';
    const request = navRequestFromTargetIntent(
      {
        intentId: `${frozen.manifest.runId}:nav-intent:${sequence}`,
        signalId: value.signalId,
        executionSymbol: value.executionSymbol,
        side: value.kind === 'entry' ? 'buy' : 'sell',
        reason,
        occurredAt: at,
        availableAt: at,
      },
      {
        requestAt: at,
        sizing: {
          rule: strategy.sizing,
          executionCurrency: 'CNY',
          lotSize: '0.000001',
          currentQuantity: position.quantity,
          evaluationAt: at,
          price: {
            value: latest.value,
            occurredAt: latest.occurredAt,
            availableAt: latest.availableAt,
          },
          equity: {
            amount: current.valuation.equity ?? '0',
            currency: 'CNY',
            occurredAt: at,
            availableAt: at,
          },
        },
      },
    );
    if ('requestId' in request) {
      requests.push(request);
      requestReasons[request.requestId] = reason;
    } else sizingRejects.push({ occurredAt: at, code: request.reasonCode, reason: request.reason });
  }
  return {
    ...runNavOfflineV3(frozen, requests, signal ? { signal } : {}),
    requests,
    sizingRejects,
    valuations,
    requestReasons,
  };
};
