import { vi } from 'vitest';
import {
  backtestPreflightRevisionStampV3Schema,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

export const preparationStampFor = (
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  strategyVersionId: string,
) => {
  const plan = planBacktestPriceInputs(strategy, runConfig);
  return backtestPreflightRevisionStampV3Schema.parse({
    strategyVersionId,
    strategyContentHash: hashCanonicalManifest(strategy),
    runConfigChecksum: hashCanonicalManifest(runConfig),
    desiredRevision: 7,
    effectiveRevision: 1,
    catalogRevision: 12,
    targetSequences: [
      {
        requirement: {
          symbol: strategy.executionInstrument.symbol,
          capability: 'DAILY_BAR',
          purpose: 'execution',
          dateRange: { startDate: plan.warmup.startDate, endDate: runConfig.endDate },
          routeKey: {
            kind: 'bar',
            market: strategy.executionInstrument.market,
            assetType: strategy.executionInstrument.assetType === 'stock' ? 'STOCK' : 'ETF',
            capability: 'DAILY_BAR',
            timeframe: '1d',
            adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
          },
        },
        targets: [
          { providerId: 'hithink', upstreamSource: 'hithink-financial-api', routeIndex: 0 },
        ],
      },
    ],
  });
};

export const preparedRevisionReader = () => ({
  readCurrent: vi.fn(() =>
    Promise.resolve({
      desiredRevision: 7,
      effectiveRevision: 1,
      catalogRevision: 12,
      targetSources: [
        { providerId: 'hithink', upstreamSource: 'hithink-financial-api', routeIndex: 0 },
      ],
      availability: [{ eligible: true, catalogReady: true }],
    }),
  ),
});
