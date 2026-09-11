import { describe, expect, it } from 'vitest';
import {
  compileStrategyMonitoringPlan,
  evaluateStrategyMonitoringPlan,
} from '../src/strategy-monitoring.js';

const strategy = {
  executionInstrument: { symbol: '600519.SH' },
  primaryTimeframe: '1d',
  risk: [
    { type: 'fixedStop', percent: '0.08' },
    { type: 'fixedTakeProfit', percent: '0.2' },
    { type: 'maxHoldingPeriod', periods: 20 },
  ],
  entry: { type: 'positionState', field: 'isOpen' },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedAmount', amount: '10000' },
};

describe('strategy monitoring compiler', () => {
  it('produces stable source keys, coverage and fingerprint', () => {
    const first = compileStrategyMonitoringPlan(strategy, 'strategy-hash', 'version-1');
    const second = compileStrategyMonitoringPlan(strategy, 'strategy-hash', 'version-1');
    expect(first).toEqual(second);
    expect(first.rules.map((rule) => rule.sourceKey)).toEqual([
      'risk:0:fixedStop',
      'risk:1:fixedTakeProfit',
      'risk:2:maxHoldingPeriod',
    ]);
    expect(first.coverage).toMatchObject({ riskTotal: 3, riskMapped: 3 });
    expect(first.planHash).toMatch(/^fnv1a32:/);
  });

  it('uses inclusive equality for fixed stop and take profit', () => {
    const plan = compileStrategyMonitoringPlan(strategy, 'strategy-hash');
    const stop = evaluateStrategyMonitoringPlan(plan, {
      quantity: '100',
      price: '92',
      averageCost: '100',
      holdingPeriods: 5,
      occurredAt: '2026-09-10T07:00:00+00:00',
      availableAt: '2026-09-10T07:00:01+00:00',
    });
    expect(stop[0]).toMatchObject({ state: 'triggered', value: '-0.08', threshold: '-0.08' });
    const takeProfit = evaluateStrategyMonitoringPlan(plan, {
      quantity: '100',
      price: '120',
      averageCost: '100',
      holdingPeriods: 5,
    });
    expect(takeProfit[1]).toMatchObject({ state: 'triggered', value: '0.2', threshold: '0.2' });
  });

  it('distinguishes unavailable and not applicable', () => {
    const plan = compileStrategyMonitoringPlan(strategy, 'strategy-hash');
    expect(
      evaluateStrategyMonitoringPlan(plan, { quantity: '100', price: '90', holdingPeriods: 5 })[0],
    ).toMatchObject({ state: 'unavailable' });
    expect(evaluateStrategyMonitoringPlan(plan, { quantity: '0', price: '90', averageCost: '100' })[0]).toMatchObject({
      state: 'not_applicable',
    });
  });

  it('triggers max holding period on the boundary', () => {
    const plan = compileStrategyMonitoringPlan(strategy, 'strategy-hash');
    expect(
      evaluateStrategyMonitoringPlan(plan, {
        quantity: '100',
        price: '100',
        averageCost: '100',
        holdingPeriods: 20,
      })[2],
    ).toMatchObject({ state: 'triggered', value: '20', threshold: '20' });
  });
});
