import { describe, expect, it } from 'vitest';
import {
  assertOptimizationModelConfigCost,
  optimizationCostFacts,
  optimizationCostSummary,
  optimizationPricingForExperimentRoute,
  sameOptimizationCostConfirmation,
} from '../../src/strategy-optimization/strategy-optimization-cost.js';
import { buildOptimizationModelConfig } from '../../src/strategy-optimization/strategy-optimization-model-routing.js';

describe('strategy optimization cost contract', () => {
  it('treats zero price with a currency as known and missing currency as unknown', () => {
    expect(
      optimizationCostFacts({
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'usd',
        pricingVersion: 'zero-v1',
      }),
    ).toEqual({ costStatus: 'known', costCurrency: 'USD', pricingVersion: 'zero-v1' });
    expect(optimizationCostFacts({ costPer1kInput: 0, costPer1kOutput: 0 })).toMatchObject({
      costStatus: 'unknown',
    });
  });

  it('uses the experiment model snapshot instead of current Provider pricing', () => {
    expect(
      optimizationPricingForExperimentRoute(
        [
          {
            provider: 'provider-a',
            model: 'model-a',
            costStatus: 'known',
            costPer1kInput: 0.1,
            costPer1kOutput: 0.2,
            costCurrency: 'USD',
            pricingVersion: 'frozen-v1',
          },
        ],
        'provider-a',
        'model-a',
        { costPer1kInput: 9, costPer1kOutput: 9, costCurrency: 'USD', pricingVersion: 'current-v2' },
      ),
    ).toEqual({
      costPer1kInput: 0.1,
      costPer1kOutput: 0.2,
      costCurrency: 'USD',
      pricingVersion: 'frozen-v1',
    });
    expect(
      optimizationPricingForExperimentRoute(
        [{ provider: 'provider-a', model: 'model-a', costStatus: 'unknown' }],
        'provider-a',
        'model-a',
        { costPer1kInput: 9, costPer1kOutput: 9, costCurrency: 'USD' },
      ),
    ).toEqual({});
  });

  it('builds model configuration with the model-level rates needed by later freezes', () => {
    expect(
      buildOptimizationModelConfig(
        [{ provider: 'provider-a', model: 'model-a' }],
        {
          strict: () => ({
            metadata: {
              modelPricing: {
                'model-a': {
                  costPer1kInput: 0.1,
                  costPer1kOutput: 0.2,
                  costCurrency: 'USD',
                  pricingVersion: 'pricing-v1',
                },
              },
            },
          }),
        } as never,
      ),
    ).toEqual([
      {
        provider: 'provider-a',
        model: 'model-a',
        costStatus: 'known',
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
        pricingVersion: 'pricing-v1',
      },
    ]);
  });

  it('rejects known mixed currencies before an experiment is persisted', () => {
    let error: unknown;
    try {
      assertOptimizationModelConfigCost([
        { provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'CNY' },
        { provider: 'b', model: 'm', costStatus: 'known', costCurrency: 'USD' },
      ]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ response: { errorCode: 'OPTIMIZATION_COST_MIXED_CURRENCY' } });

    let unknownPriceCurrencyError: unknown;
    try {
      assertOptimizationModelConfigCost([
        { provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' },
        { provider: 'b', model: 'm', costStatus: 'unknown', costCurrency: 'HKD' },
      ]);
    } catch (caught) {
      unknownPriceCurrencyError = caught;
    }
    expect(unknownPriceCurrencyError).toMatchObject({
      response: { errorCode: 'OPTIMIZATION_COST_MIXED_CURRENCY' },
    });
  });

  it('distinguishes complete, partial, mixed and historical-unavailable totals', () => {
    expect(
      optimizationCostSummary({
        modelConfig: [{ costStatus: 'known', costCurrency: 'USD' }],
        costUsed: '1.25',
      }),
    ).toMatchObject({ status: 'complete', currency: 'USD', knownAmount: '1.25' });
    expect(
      optimizationCostSummary({
        modelConfig: [
          { provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' },
          { provider: 'b', model: 'm', costStatus: 'unknown' },
        ],
        costUsed: '1.25',
      }),
    ).toMatchObject({ status: 'partial', reason: 'unknown_currency' });
    expect(
      optimizationCostSummary({
        modelConfig: [
          { provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' },
          { provider: 'b', model: 'm', costStatus: 'unknown', costCurrency: 'USD' },
        ],
        costUsed: '1.25',
      }),
    ).toMatchObject({ status: 'partial', currency: 'USD', reason: 'unknown_cost' });
    expect(
      optimizationCostSummary({
        modelConfig: [
          { costStatus: 'known', costCurrency: 'USD' },
          { costStatus: 'known', costCurrency: 'HKD' },
        ],
        costUsed: '2',
      }),
    ).toMatchObject({ status: 'mixed_currency', knownAmount: null });
    expect(optimizationCostSummary({ modelConfig: [], costUsed: '0' })).toMatchObject({
      status: 'unavailable',
      reason: 'historical_missing_metadata',
    });
  });

  it('does not report a complete total when attempt currency conflicts with the frozen route', () => {
    expect(
      optimizationCostSummary(
        {
          modelConfig: [{ provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' }],
          costUsed: '1.25',
        },
        [
          {
            modelKey: 'a:m',
            modelMetadata: { costStatus: 'known', costCurrency: 'HKD' },
            cost: '1.25',
          } as never,
        ],
      ),
    ).toMatchObject({ status: 'mixed_currency', currency: null, knownAmount: null });
  });

  it('keeps an orphan attempt or invalid amount out of a complete historical total', () => {
    expect(
      optimizationCostSummary(
        {
          modelConfig: [{ provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' }],
          costUsed: '1.25',
        },
        [
          {
            modelKey: 'legacy:m',
            modelMetadata: { costStatus: 'known', costCurrency: 'USD' },
            cost: '1.25',
          } as never,
        ],
      ),
    ).toMatchObject({ status: 'partial', reason: 'historical_missing_metadata' });
    expect(
      optimizationCostSummary(
        {
          modelConfig: [{ provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' }],
          costUsed: '1.25',
        },
        [
          {
            modelKey: 'a:m',
            modelMetadata: { costStatus: 'known', costCurrency: 'USD' },
            cost: '-1',
          } as never,
        ],
      ),
    ).toMatchObject({ status: 'partial', reason: 'unknown_cost' });
  });

  it('does not reuse a cost confirmation after model or budget changes', () => {
    const previous = {
      modelConfig: [{ provider: 'a', model: 'm', costStatus: 'known', costCurrency: 'USD' }],
      budget: { maxAiCalls: 2, maxCost: '5' },
      maxRounds: 1,
    };
    expect(sameOptimizationCostConfirmation(previous, previous)).toBe(true);
    expect(
      sameOptimizationCostConfirmation(previous, {
        ...previous,
        budget: { ...previous.budget, maxCost: '6' },
      }),
    ).toBe(false);
    expect(sameOptimizationCostConfirmation(previous, { ...previous, maxRounds: 2 })).toBe(false);
  });
});
