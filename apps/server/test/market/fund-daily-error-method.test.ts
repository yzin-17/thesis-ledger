import { expect, it } from 'vitest';
import type { FundValuationPoint } from '@prisma/client';
import { closingEstimate, fundErrorFor } from '../../src/market/fund-daily-error-method.js';
import { controlledMarketSession } from './market-session.fixture.js';

const day = '2026-11-06';
const at = new Date(day + 'T03:29:00Z');
const estimate = {
  version: 1, symbol: '000001.OF', marketState: 'open', quality: 'partial',
  estimatedNav: 1.01, changePercent: 1, estimatedAt: at.toISOString(), oldestPriceAt: at.toISOString(),
  anchor: { unitNav: 1, navDate: '2026-11-05T00:00:00Z' }, disclosureCoverage: 0.8, pricedCoverage: 0.8,
  reasons: ['partial_coverage'], method: 'disclosed-holdings-qfq-v1',
};
const evidence = {
  symbol: estimate.symbol, estimatedNav: 1.01, disclosureCoverage: 0.8, pricedCoverage: 0.8,
  disclosureAvailableAt: '2026-10-30T00:00:00Z', holdingPrices: [{
    status: 'available', quoteTradingDate: day, quoteMarketTime: at.toISOString(), inputFingerprint: 'fixed',
    anchorDate: '2026-11-05', anchorAdjustedClose: 1, currentAdjustedClose: 1.01, sourcePriceBasis: { adjustment: 'qfq' },
  }],
};
const row = {
  symbol: estimate.symbol, method: estimate.method, minute: at, observedAt: at, lastValidAt: at,
  lastValidSnapshot: estimate, lastValidEvidence: evidence,
} as unknown as FundValuationPoint;
it('基金误差只在事实中的全天收盘后冻结，午休不当作全天收盘', async () => {
  const session = await controlledMarketSession('CN', at);
  expect(closingEstimate(row, new Date(day + 'T04:00:00Z'), session)).toBeNull();
  expect(closingEstimate(row, new Date(day + 'T07:00:00Z'), session)).toMatchObject({ day, estimate });
  // 受控半日市事实，不再写死 15:00。
  const halfDay = { ...session, sessions: session.sessions.filter((window) => window.tradingDate !== day || window.endAt === day + 'T03:30:00.000Z') };
  expect(closingEstimate(row, new Date(day + 'T04:00:00Z'), halfDay)).toMatchObject({ day });
});
it('未知日历与错位评价时点不冻结历史估值', async () => {
  const session = await controlledMarketSession('CN', at);
  expect(closingEstimate(row, new Date(day + 'T08:00:00Z'), { ...session, state: 'unknown' })).toBeNull();
  expect(closingEstimate(row, new Date(day + 'T08:00:00Z'), { ...session, evaluatedAt: day + 'T03:28:00Z' })).toBeNull();
});
it('正式净值使用事实收盘时点验证可得性，保留十进制误差精度', () => {
  const nav = { version: 1, symbol: estimate.symbol, unitNav: 0.978, navDate: day + 'T00:00:00Z', provider: 'akshare', fetchedAt: day + 'T04:00:00Z', freshness: 'delayed', fallbackUsed: false } as const;
  const now = new Date(day + 'T08:00:00Z');
  expect(fundErrorFor(day, estimate.symbol, 1.01, nav, now, day + 'T07:00:00Z')).toBeNull();
  expect(fundErrorFor(day, estimate.symbol, 1.01, nav, now, day + 'T03:30:00Z')).toMatchObject({ signed: '0.032', absolute: '0.032' });
});
