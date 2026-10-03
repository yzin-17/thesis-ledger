import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestPriceInputBindingsSchemaV3, runConfigSchemaV3 } from '../src/index.js';
import { executionPriceProtocolSchema } from '../src/market-price-protocol.js';

const priceInputBindings = {
  signals: [{ sourceId: 'signal-a', binding: 'execution-series' }],
  benchmark: { binding: 'execution-series' },
} as const;

const runConfigFields = {
  startDate: '2026-05-16',
  endDate: '2026-08-09',
  dataAsOf: '2026-08-10T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
};

const executionPriceProtocol = executionPriceProtocolSchema.parse(
  JSON.parse(
    readFileSync(new URL('../fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'),
  ),
);

describe('Backtest V3 price input bindings', () => {
  it('accepts explicit same-coordinate bindings and an empty signal list', () => {
    expect(backtestPriceInputBindingsSchemaV3.parse(priceInputBindings)).toEqual(
      priceInputBindings,
    );
    expect(
      backtestPriceInputBindingsSchemaV3.parse({
        signals: [],
        benchmark: { binding: 'execution-series' },
      }),
    ).toEqual({ signals: [], benchmark: { binding: 'execution-series' } });
  });

  it('rejects repeated source IDs after trimming', () => {
    expect(
      backtestPriceInputBindingsSchemaV3.safeParse({
        ...priceInputBindings,
        signals: [
          { sourceId: ' signal-a ', binding: 'execution-series' },
          { sourceId: 'signal-a', binding: 'execution-series' },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields at every binding level', () => {
    expect(
      backtestPriceInputBindingsSchemaV3.safeParse({
        ...priceInputBindings,
        future: true,
      }).success,
    ).toBe(false);
    expect(
      backtestPriceInputBindingsSchemaV3.safeParse({
        ...priceInputBindings,
        signals: [{ ...priceInputBindings.signals[0], future: true }],
      }).success,
    ).toBe(false);
    expect(
      backtestPriceInputBindingsSchemaV3.safeParse({
        ...priceInputBindings,
        benchmark: { ...priceInputBindings.benchmark, future: true },
      }).success,
    ).toBe(false);
  });

  it('keeps bindings optional in V3 and rejects the extension in V2', () => {
    const legacyV3 = {
      schemaVersion: '3',
      ...runConfigFields,
      executionPriceProtocol,
    };

    expect(runConfigSchemaV3.parse(legacyV3)).toEqual(legacyV3);
    expect(runConfigSchemaV3.parse({ ...legacyV3, priceInputBindings })).toEqual({
      ...legacyV3,
      priceInputBindings,
    });
    expect(runConfigSchemaV3.safeParse({ ...runConfigFields, priceInputBindings }).success).toBe(
      false,
    );
  });
});
