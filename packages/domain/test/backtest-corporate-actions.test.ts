import { describe, expect, it } from 'vitest';
import {
  DeterministicSimulationEngine,
  SimulationLedger,
  buildSeriesVariantsAt,
  createCorporateActionPort,
  type BacktestCorporateActionFact,
  type SimulationEngineInput,
} from '../src/index.js';

const instrument = {
  symbol: '600519.SH',
  market: 'CN' as const,
  assetType: 'stock' as const,
  currency: 'CNY' as const,
};

const fact = (
  overrides: Partial<BacktestCorporateActionFact> = {},
): BacktestCorporateActionFact => ({
  symbol: '600519.SH',
  market: 'CN',
  instrumentType: 'STOCK',
  type: 'CASH_DIVIDEND',
  cashAmount: '1',
  currency: 'CNY',
  occurredAt: '2025-01-02T00:00:00Z',
  availableAt: '2025-01-03T00:00:00Z',
  provider: 'fixture',
  providerRevision: 'fixture-v1',
  ...overrides,
});

const ledger = () =>
  new SimulationLedger({
    executionInstrument: instrument,
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000' },
  });

const seedPosition = (target: SimulationLedger) => {
  target.applyEvent({
    type: 'fill',
    payload: {
      eventId: 'fill-1',
      fillId: 'fill-1',
      executionSymbol: instrument.symbol,
      side: 'buy',
      quantity: '10',
      price: '10',
      charges: [],
      currency: 'CNY',
      occurredAt: '2025-01-01T00:00:00Z',
      availableAt: '2025-01-01T00:00:00Z',
    },
  });
  target.applyEvent({
    type: 'settlement',
    payload: {
      eventId: 'settlement-1',
      sourceEventId: 'fill-1',
      kind: 'both',
      symbol: instrument.symbol,
      currency: 'CNY',
      occurredAt: '2025-01-01T00:00:00Z',
      availableAt: '2025-01-01T00:00:00Z',
    },
  });
};

describe('backtest corporate actions', () => {
  it('applies dividend once, rejects future facts, and retries by stable event id', () => {
    const target = ledger();
    seedPosition(target);
    const port = createCorporateActionPort(target, instrument, 'run-1');
    const dividend = fact();
    expect(port.apply(dividend, '2025-01-02T00:00:00Z')).toMatchObject({
      applied: false,
      code: 'FUTURE_DATA',
      published: false,
    });
    const applied = port.apply(dividend, dividend.availableAt);
    expect(applied).toMatchObject({ applied: true, published: true });
    expect(port.apply(dividend, dividend.availableAt)).toMatchObject({
      applied: false,
      code: 'DUPLICATE_EVENT',
    });
    expect(target.snapshot().cash.CNY.unsettled).toBe('10');
  });

  it('uses the shared post/pre ratio for split and reverse split', () => {
    const target = ledger();
    seedPosition(target);
    const port = createCorporateActionPort(target, instrument, 'run-1');
    expect(
      port.apply(
        fact({ type: 'SPLIT', cashAmount: undefined, currency: undefined, ratio: '2' }),
        '2025-01-02T00:00:00Z',
      ),
    ).toMatchObject({ applied: false, code: 'FUTURE_DATA' });
    const split = fact({
      type: 'SPLIT',
      cashAmount: undefined,
      currency: undefined,
      ratio: '2',
      availableAt: '2025-01-02T00:00:00Z',
    });
    expect(port.apply(split, split.availableAt)).toMatchObject({ applied: true });
    expect(target.snapshot().position).toMatchObject({ quantity: '20', averageCost: '5' });
    const reverse = fact({
      type: 'REVERSE_SPLIT',
      cashAmount: undefined,
      currency: undefined,
      ratio: '0.5',
      occurredAt: '2025-01-04T00:00:00Z',
      availableAt: '2025-01-04T00:00:00Z',
    });
    expect(port.apply(reverse, reverse.availableAt)).toMatchObject({ applied: true });
    expect(target.snapshot().position).toMatchObject({ quantity: '10', averageCost: '10' });
  });

  it('matches adjusted series semantics without applying a second ledger mutation', () => {
    const action = fact({
      type: 'SPLIT',
      cashAmount: undefined,
      currency: undefined,
      ratio: '2',
      occurredAt: '2025-01-03T00:00:00Z',
      availableAt: '2025-01-03T00:00:00Z',
    });
    const variants = buildSeriesVariantsAt(
      {
        sourceId: 'close',
        symbol: instrument.symbol,
        market: 'CN',
        assetType: 'stock',
        field: 'close',
        timeframe: '1d',
        points: [
          {
            occurredAt: '2025-01-01T00:00:00Z',
            availableAt: '2025-01-01T00:00:00Z',
            value: '100',
            status: 'available',
          },
        ],
      },
      [
        {
          symbol: action.symbol,
          market: action.market,
          assetType: 'stock',
          type: action.type,
          ratio: action.ratio!,
          occurredAt: action.occurredAt,
          availableAt: action.availableAt,
        },
      ],
      '2025-01-03T00:00:00Z',
    );
    expect(variants.adjusted.points[0]?.value).toBe('50');

    const target = ledger();
    seedPosition(target);
    const mutations: unknown[] = [];
    const input: SimulationEngineInput = {
      runId: 'run-corporate-action',
      strategy: {
        executionInstrument: instrument,
        primaryTimeframe: '1d',
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'constant', value: '1' },
          right: { type: 'constant', value: '0' },
        },
        exit: {
          type: 'compare',
          operator: 'lt',
          left: { type: 'constant', value: '0' },
          right: { type: 'constant', value: '1' },
        },
      },
      ticks: [{ occurredAt: '2025-01-03T00:00:00Z' }],
      sourceSeries: new Map(),
      corporateActions: [action, action],
      corporateActionPort: createCorporateActionPort(target, instrument, 'run-corporate-action'),
      execution: { onMutation: (mutation) => mutations.push(mutation) },
    };
    const result = new DeterministicSimulationEngine().run(input);
    expect(result.corporateActionResults.filter((value) => value.applied)).toHaveLength(1);
    expect(result.mutations.filter((value) => value.type === 'corporateAction')).toHaveLength(1);
    expect(mutations).toHaveLength(1);
    expect(target.snapshot().position.quantity).toBe('20');
  });

  it('rejects identity and currency mismatches without publishing a mutation', () => {
    const target = ledger();
    const port = createCorporateActionPort(target, instrument, 'run-1');
    expect(port.apply(fact({ symbol: '000001.SZ' }), fact().availableAt)).toMatchObject({
      applied: false,
      published: false,
      code: 'INSTRUMENT_MISMATCH',
    });
    expect(port.apply(fact({ currency: 'HKD' }), fact().availableAt)).toMatchObject({
      applied: false,
      code: 'CURRENCY_MISMATCH',
    });
    expect(port.apply(fact({ ratio: '2' }), fact().availableAt)).toMatchObject({
      applied: false,
      code: 'RULE_REJECTED',
    });
    expect(
      port.apply(
        fact({ type: 'SPLIT', cashAmount: undefined, currency: 'CNY', ratio: '2' }),
        fact().availableAt,
      ),
    ).toMatchObject({ applied: false, code: 'RULE_REJECTED' });

    const fundInstrument = { ...instrument, assetType: 'fund' as const };
    const fundPort = createCorporateActionPort(
      new SimulationLedger({
        executionInstrument: fundInstrument,
        baseCurrency: 'CNY',
        initialCash: { CNY: '0' },
      }),
      fundInstrument,
      'run-fund',
    );
    expect(fundPort.apply(fact({ instrumentType: 'NAV_FUND' }), fact().availableAt)).toMatchObject({
      applied: false,
      code: 'UNSUPPORTED_CORPORATE_ACTION',
    });
    expect(
      port.apply(
        { ...fact(), type: 'UNKNOWN' } as unknown as BacktestCorporateActionFact,
        fact().availableAt,
      ),
    ).toMatchObject({ applied: false, code: 'UNSUPPORTED_CORPORATE_ACTION' });
  });
});
