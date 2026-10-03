import { vi } from 'vitest';
import type { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';
import { navSourceFixture } from '../integration/dsa-nav.fixtures.js';

export function navPreparationFixture() {
  const source = navSourceFixture();
  const base = navFreezeFixture();
  const symbol = source.request.symbol;
  const strategy = base.context.strategy;
  strategy.executionInstrument.symbol = symbol;
  strategy.signalSources[0]!.asset.symbol = symbol;
  const {
    dataAsOf: unusedTime,
    navVisibility: unusedVisibility,
    ...config
  } = base.context.runConfig;
  void unusedTime;
  void unusedVisibility;
  config.startDate = source.request.start;
  config.endDate = source.request.end;
  config.navInput.symbol = symbol;
  config.executionModel.scope.symbol = symbol;
  for (const segment of config.executionModel.segments) {
    if (segment.execution.mode === 'nav') {
      segment.execution.confirmationAfterTradingDays = 0;
      segment.execution.sellableAfterConfirmationTradingDays = 0;
      segment.execution.redemptionReinvestableAfterConfirmationTradingDays = 0;
    }
  }
  const request = {
    contractVersion: 3 as const,
    requestId: source.request.requestId,
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    runConfig: config,
    fundType: 'domestic' as const,
    visibilityMode: 'research-assumption' as const,
    freezeTimePolicy: 'after-acquisition' as const,
    calendarDecisionRaw: source.request.calendarDecisionRaw,
    domesticRuleDecisionRaw: source.request.domesticRuleDecisionRaw,
  };
  const read = vi.fn(
    async (
      input: Omit<
        typeof source.request,
        'routeTarget' | 'desiredRevision' | 'effectivePolicyRevision' | 'catalogRevision'
      >,
    ) => {
      const exact = { ...source.request, ...input };
      return {
        request: exact,
        response: { ...source.response, dataAsOf: exact.dataAsOf },
        routeState: {
          desiredRevision: 1,
          effectivePolicyRevision: 1,
          catalogRevision: 2,
          targets: [
            {
              providerId: 'efinance',
              upstreamSource: 'eastmoney',
              routeIndex: 0,
              eligible: true,
              reason: null,
              catalogState: 'ready',
            },
          ],
          routeTarget: exact.routeTarget,
        },
      } as Awaited<ReturnType<MarketNavReaderV3['read']>>;
    },
  );
  const times = ['2026-09-30T15:00:00Z', '2026-09-30T15:02:00Z'];
  const options = {
    request,
    strategy,
    reader: { read },
    acquisitionTimeoutMs: 180000,
    now: () => times.shift()!,
  };
  return { source, request, strategy, read, times, options };
}
