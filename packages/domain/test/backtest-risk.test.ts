import { describe, expect, it } from 'vitest';
import { evaluateRiskAt, type RiskEvaluationInput } from '../src/backtest-risk.js';

const evaluationAt = '2026-09-08T10:00:00.000Z';
const baseInput = (overrides: Partial<RiskEvaluationInput> = {}): RiskEvaluationInput => ({
  runId: 'run-1',
  executionSymbol: '600000.SH',
  rules: [],
  position: {
    quantity: '100',
    averageCost: '10',
    holdingPeriods: 2,
    occurredAt: '2026-09-08T09:00:00.000Z',
    availableAt: '2026-09-08T09:30:00.000Z',
  },
  evaluation: {
    value: '10',
    occurredAt: evaluationAt,
    availableAt: evaluationAt,
    completed: true,
  },
  evaluationAt,
  ...overrides,
});

describe('evaluateRiskAt', () => {
  it('uses inclusive long stop, take-profit, and holding boundaries', () => {
    const stop = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'fixedStop', percent: '0.1' }],
        evaluation: { ...baseInput().evaluation, value: '9' },
      }),
    );
    const take = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'fixedTakeProfit', percent: '0.1' }],
        evaluation: { ...baseInput().evaluation, value: '11' },
      }),
    );
    const holding = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'maxHoldingPeriod', periods: 2 }],
      }),
    );

    expect(stop).toMatchObject({
      status: 'available',
      intent: { trigger: 'fixedStop', side: 'sell' },
    });
    expect(take).toMatchObject({ status: 'available', intent: { trigger: 'fixedTakeProfit' } });
    expect(holding).toMatchObject({ status: 'available', intent: { trigger: 'maxHoldingPeriod' } });
  });

  it('does not trigger just outside a level and does not trigger without a position', () => {
    const aboveStop = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'fixedStop', percent: '0.1' }],
        evaluation: { ...baseInput().evaluation, value: '9.01' },
      }),
    );
    const belowTake = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'fixedTakeProfit', percent: '0.1' }],
        evaluation: { ...baseInput().evaluation, value: '10.99' },
      }),
    );
    const noPosition = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'fixedStop', percent: '0.1' }],
        position: { ...baseInput().position, quantity: '0' },
      }),
    );

    expect(aboveStop).toMatchObject({ status: 'available', triggeredRules: [] });
    expect(belowTake).toMatchObject({ status: 'available', triggeredRules: [] });
    expect(noPosition).toMatchObject({ status: 'unavailable', reasonCode: 'NO_POSITION' });
  });

  it('requires completed, available facts and never consumes future position state', () => {
    const incomplete = evaluateRiskAt(
      baseInput({
        evaluation: { ...baseInput().evaluation, completed: false },
        rules: [{ type: 'fixedStop', percent: '0.1' }],
      }),
    );
    const futureEvaluation = evaluateRiskAt(
      baseInput({
        evaluation: { ...baseInput().evaluation, availableAt: '2026-09-08T10:01:00.000Z' },
        rules: [{ type: 'fixedStop', percent: '0.1' }],
      }),
    );
    const futurePosition = evaluateRiskAt(
      baseInput({
        position: { ...baseInput().position, availableAt: '2026-09-08T10:01:00.000Z' },
        rules: [{ type: 'fixedStop', percent: '0.1' }],
      }),
    );
    const unavailable = evaluateRiskAt(
      baseInput({
        evaluation: { ...baseInput().evaluation, status: 'unavailable', reason: 'gap' },
        rules: [{ type: 'fixedStop', percent: '0.1' }],
      }),
    );

    expect(incomplete).toMatchObject({
      status: 'unavailable',
      reasonCode: 'EVALUATION_INCOMPLETE',
    });
    expect(futureEvaluation).toMatchObject({ status: 'unavailable', reasonCode: 'FUTURE_DATA' });
    expect(futurePosition).toMatchObject({ status: 'unavailable', reasonCode: 'FUTURE_DATA' });
    expect(unavailable).toMatchObject({ status: 'unavailable', reasonCode: 'FACT_UNAVAILABLE' });
  });

  it('keeps risk level intent ids stable for DAY retry and reports consumed availability', () => {
    const input = baseInput({
      rules: [{ type: 'fixedStop', percent: '0.1' }],
      evaluation: { ...baseInput().evaluation, value: '9' },
    });
    const first = evaluateRiskAt(input);
    const retry = evaluateRiskAt(input);

    expect(retry).toEqual(first);
    expect(first).toMatchObject({ availableAt: '2026-09-08T10:00:00.000Z' });
    expect((first as { intent?: { availableAt: string } }).intent?.availableAt).toBe(
      '2026-09-08T10:00:00.000Z',
    );
  });

  it('rejects unsupported and invalid runtime risk parameters', () => {
    const unsupported = evaluateRiskAt(
      baseInput({
        rules: [{ type: 'trailingStop', percent: '0.1' } as never],
      }),
    );
    const badPosition = evaluateRiskAt(
      baseInput({
        position: { ...baseInput().position, averageCost: '0' },
      }),
    );
    const badHolding = evaluateRiskAt(
      baseInput({
        position: { ...baseInput().position, holdingPeriods: 1.5 },
      }),
    );

    expect(unsupported).toMatchObject({ status: 'rejected', reasonCode: 'UNSUPPORTED_RISK' });
    expect(badPosition).toMatchObject({ status: 'rejected', reasonCode: 'INVALID_PARAMETER' });
    expect(badHolding).toMatchObject({ status: 'rejected', reasonCode: 'INVALID_PARAMETER' });
  });
});
