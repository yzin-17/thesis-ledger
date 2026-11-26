import { vi } from 'vitest';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  projectPriceResearchStrategy,
  backtestRunPreparationRequestV3Schema,
} from '@thesis-ledger/schemas';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';

export async function priceResearchFixture(
  options: {
    assetType?: 'etf' | 'stock';
    missingActualDates?: string[];
    researchScale?: number;
    researchSource?: { providerId: string; upstreamSource: string; routeIndex?: number };
    actualSource?: { providerId: string; upstreamSource: string; routeIndex?: number };
  } = {},
) {
  const f = await completeSnapshotFixture(options.assetType);
  f.input.strategy.entry = {
    type: 'all',
    conditions: [
      { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'execution', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
    ],
  };
  f.input.strategy.exit = {
    type: 'compare',
    operator: 'gte',
    left: { type: 'positionState', field: 'holdingPeriods' },
    right: { type: 'constant', value: '2' },
  };
  f.input.strategy.sizing = { type: 'fixedQuantity', quantity: '100' };
  f.input.strategy = projectPriceResearchStrategy(f.input.strategy);
  f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
  const read = vi.fn(async (input: MarketBarWindowReadInputV3) => {
    const result = await makeReaderResult(
      { ...input, routeKey: { ...input.routeKey, adjustment: 'qfq' } },
      false,
      input.routeKey.adjustment === 'none' ? options.missingActualDates : [],
    );
    if (result.status !== 'selected') throw new Error('missing fixture source');
    result.request.routeKey = input.routeKey;
    result.selection.response.routeKey = input.routeKey;
    result.selection.response.sourcePriceBasis.adjustment = input.routeKey.adjustment;
    const scale = input.routeKey.adjustment === 'none' ? 4 : 8 * (options.researchScale ?? 1);
    const scaled = (value: number) =>
      Number(DecimalValue.from(String(value)).times(String(scale)).toString());
    result.selection.response.bars = result.selection.response.bars.map((bar) => ({
      ...bar,
      open: scaled(bar.open),
      high: scaled(bar.high),
      low: scaled(bar.low),
      close: scaled(bar.close),
    }));
    result.selection.response.inputFingerprint = `research-${input.routeKey.adjustment}`;
    const source =
      input.routeKey.adjustment === 'none' ? options.actualSource : options.researchSource;
    if (source) {
      const target = {
        providerId: source.providerId,
        upstreamSource: source.upstreamSource,
        routeIndex: source.routeIndex ?? 0,
      };
      result.request.routeTarget = target;
      result.selection.target = {
        providerId: target.providerId,
        upstreamSource: target.upstreamSource,
      };
      result.selection.routeIndex = target.routeIndex;
      result.selection.source = target.routeIndex === 0 ? 'primary' : 'backup';
      result.selection.response.provenance = { ...result.selection.response.provenance, ...target };
      result.evidence.target = target;
      result.evidence.identityFingerprint = hashCanonicalManifest({
        target,
        routeKey: input.routeKey,
      });
    }
    if (result.selection.response.historicalTradabilityWindows)
      result.selection.response.historicalTradabilityWindows = [
        tradabilityFixtureV3(tradabilityWindowFromResponseV3(result.selection.response), input.dailyObservationContract),
      ];
    result.evidence.routeKey = input.routeKey;
    result.evidence.sourcePriceBasis = result.selection.response.sourcePriceBasis;
    result.evidence.inputFingerprint = result.selection.response.inputFingerprint;
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
    if (input.frozenWindowRef) result.frozenWindowRef = input.frozenWindowRef;
    return result;
  });
  const facts = f.dsa.backtestInstrumentFacts.getMockImplementation()!;
  f.dsa.backtestInstrumentFacts.mockImplementation((request) =>
    facts({ ...request, barAdjustment: 'qfq' }),
  );
  const c = f.input.runConfig;
  const request = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 1,
    requestId: 'price-research-test',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    priceResearch: 'price-research-v1',
    adjustment: 'hfq',
    accountingBasis: 'normalized-series',
    history: { basis: 'fixed-provider-snapshot' },
    runConfig: {
      startDate: c.startDate,
      endDate: c.endDate,
      dataAsOf: c.dataAsOf,
      baseCurrency: c.baseCurrency,
      initialCash: c.initialCash,
      valuationPolicy: c.valuationPolicy,
      executionModel: c.executionModel,
    },
  });
  const control = {
    getPolicy: vi.fn(async () => ({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: 'policy',
      revision: 7,
      enabled: true,
      syncState: 'applied',
      effectiveStale: false,
      routes: ['hfq', 'none'].map((adjustment) => ({
        key: { ...f.input.executionRouteKey, adjustment },
        targets: (() => {
          const primary = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
          const source = adjustment === 'none' ? options.actualSource : options.researchSource;
          if (!source) return [primary];
          const target = { providerId: source.providerId, upstreamSource: source.upstreamSource };
          return source.routeIndex === 1 ? [primary, target] : [target];
        })(),
      })),
    })),
  };
  return { ...f, reader: { readV3: read }, request, control };
}
