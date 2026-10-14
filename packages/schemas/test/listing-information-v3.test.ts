import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestDailyTradabilityEvidenceV3Schema,
  backtestListingInformationV3Schema,
} from '../src/backtest-daily-tradability.js';
import {
  canonicalMarketCoverageProofEncodingV3,
  canonicalMarketListingInformationEncodingV3,
  marketListingInformationV3Schema,
  marketCoverageSessionDatesV3,
  isBeforeKnownListingDateV3,
} from '../src/market-coverage-proof-v3.js';
import { observedTradabilityDatesV3 } from '../src/market-daily-tradability-v3.js';
import { marketDataBarSeriesResponseV3Schema } from '../src/market-data-wire-v3.js';

const response = marketDataBarSeriesResponseV3Schema.parse(
  JSON.parse(
    readFileSync(
      new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url),
      'utf8',
    ),
  ),
);
const knownMarketListing = response.coverageProof.listing;
const knownBacktestListing = {
  listedOn: knownMarketListing.firstTradingDate,
  source: {
    provider: knownMarketListing.source,
    revision: knownMarketListing.revision,
    availableAt: knownMarketListing.knownAt,
  },
};

describe('上市信息的已知与未知合同', () => {
  it('保留完整已知信息，未知信息不携带推定日期或来源', () => {
    expect(marketListingInformationV3Schema.parse(knownMarketListing)).toEqual(knownMarketListing);
    expect(backtestListingInformationV3Schema.parse(knownBacktestListing)).toEqual(
      knownBacktestListing,
    );
    expect(
      marketListingInformationV3Schema.parse({ symbol: '600519.SH', status: 'unknown' }),
    ).toEqual({ symbol: '600519.SH', status: 'unknown' });
    expect(backtestListingInformationV3Schema.parse({ status: 'unknown' })).toEqual({
      status: 'unknown',
    });
  });

  it('未知市场信息必须绑定非空标的，并拒绝所有已知事实字段', () => {
    for (const symbol of [undefined, null, '', '   ']) {
      expect(
        marketListingInformationV3Schema.safeParse({ symbol, status: 'unknown' }).success,
      ).toBe(false);
    }
    for (const [field, value] of Object.entries(knownMarketListing)) {
      if (field === 'symbol') continue;
      expect(
        marketListingInformationV3Schema.safeParse({
          symbol: '600519.SH',
          status: 'unknown',
          [field]: value,
        }).success,
      ).toBe(false);
    }
    expect(
      marketListingInformationV3Schema.safeParse({ symbol: '600519.SH', status: 'pending' })
        .success,
    ).toBe(false);
  });

  it('未知日级信息由父记录绑定标的，不能附带上市日期或来源', () => {
    for (const extra of [
      { listedOn: '2023-07-27' },
      { listedOn: null },
      { source: knownBacktestListing.source },
      { source: null },
      { symbol: '600519.SH' },
    ]) {
      expect(
        backtestListingInformationV3Schema.safeParse({ status: 'unknown', ...extra }).success,
      ).toBe(false);
    }
  });

  it('缺字段的已知信息不能被隐式转换为未知', () => {
    for (const field of Object.keys(knownMarketListing)) {
      const incomplete: Record<string, unknown> = { ...knownMarketListing };
      delete incomplete[field];
      expect(marketListingInformationV3Schema.safeParse(incomplete).success).toBe(false);
    }
    for (const field of ['listedOn', 'source']) {
      const incomplete: Record<string, unknown> = { ...knownBacktestListing };
      delete incomplete[field];
      expect(backtestListingInformationV3Schema.safeParse(incomplete).success).toBe(false);
    }
  });

  it('已知编码沿用原数组顺序，未知编码只包含标的与状态', () => {
    expect(canonicalMarketListingInformationEncodingV3(knownMarketListing)).toBe(
      '["159516.SZ","2023-07-27","fixture-exchange-listing-announcement","fixture-listing-fact-revision-1","2023-07-24T09:00:00.000Z"]',
    );
    expect(
      canonicalMarketListingInformationEncodingV3({ status: 'unknown', symbol: '600519.SH' }),
    ).toBe('["600519.SH","unknown"]');
    const originalEncoding = canonicalMarketCoverageProofEncodingV3(response.coverageProof);
    expect(createHash('sha256').update(originalEncoding).digest('hex')).toBe(
      '9b4e93931d93cece2c8492afaa79657916829291a5abf8153ce833e1d7e88703',
    );
    expect(JSON.parse(originalEncoding)[2]).toEqual(
      JSON.parse(canonicalMarketListingInformationEncodingV3(knownMarketListing)),
    );
  });

  it('行情响应接受显式未知，但继续要求标的一致和完整日历', () => {
    const unknown = {
      ...response,
      coverageProof: {
        ...response.coverageProof,
        listing: { symbol: response.symbol, status: 'unknown' as const },
      },
    };
    expect(marketDataBarSeriesResponseV3Schema.parse(unknown)).toEqual(unknown);
    expect(isBeforeKnownListingDateV3(unknown.coverageProof.listing, '2000-01-01')).toBe(false);
    expect(isBeforeKnownListingDateV3(knownMarketListing, '2023-07-26')).toBe(true);
    expect(isBeforeKnownListingDateV3(knownMarketListing, '2023-07-27')).toBe(false);
    expect(marketCoverageSessionDatesV3(unknown.coverageProof)).toEqual(
      response.coverageProof.calendar.expectedSessionDates,
    );
    expect(JSON.parse(canonicalMarketCoverageProofEncodingV3(unknown.coverageProof))[2]).toEqual([
      response.symbol,
      'unknown',
    ]);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({ ...unknown, bars: unknown.bars.slice(1) })
        .success,
    ).toBe(false);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({
        ...unknown,
        coverageProof: {
          ...unknown.coverageProof,
          listing: { symbol: '600519.SH', status: 'unknown' },
        },
      }).success,
    ).toBe(false);
  });

  it('逐窗未知上市信息一致才能消费缺日假设，已知边界仍裁剪日期', () => {
    const proof = {
      ...response.coverageProof,
      listing: { symbol: response.symbol, status: 'unknown' as const },
    };
    const evidence = backtestDailyTradabilityEvidenceV3Schema.parse({
      contractVersion: 1,
      symbol: response.symbol,
      market: 'CN',
      instrumentType: 'ETF',
      range: { start: proof.window.requestedStart, end: proof.window.requestedEnd },
      listing: { status: 'unknown' },
      calendar: {
        source: {
          provider: proof.calendar.source,
          revision: proof.calendar.revision,
          availableAt: '2026-05-01T00:00:00Z',
        },
        expectedSessions: proof.calendar.expectedSessionDates,
      },
      barSource: {
        routeKey: response.routeKey,
        routeTarget: {
          providerId: response.provenance.providerId,
          upstreamSource: response.provenance.upstreamSource,
        },
        providerRevision: 'fixture-r1',
        responseSha256: 'a'.repeat(64),
        observedAt: '2026-05-20T08:00:00Z',
        requestComplete: true,
        paginationComplete: true,
      },
      days: proof.calendar.expectedSessionDates.map((date, index) => ({
        date,
        state: index === 1 ? 'assumed-untradable-no-bar' : 'observed-traded',
      })),
    });
    const scope = {
      symbol: response.symbol,
      routeKey: response.routeKey,
      target: response.provenance,
      coverageProof: proof,
    };
    const observed = [
      proof.calendar.expectedSessionDates[0],
      proof.calendar.expectedSessionDates[2],
    ];
    expect(observedTradabilityDatesV3([evidence], scope)).toEqual(observed);
    const sparse = {
      ...response,
      coverageProof: proof,
      bars: response.bars.filter((_, index) => index !== 1),
      historicalTradabilityWindows: [evidence],
    };
    expect(marketDataBarSeriesResponseV3Schema.parse(sparse).bars).toHaveLength(2);
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({ ...sparse, bars: response.bars }).success,
    ).toBe(false);
    expect(() =>
      observedTradabilityDatesV3([{ ...evidence, listing: knownBacktestListing }], scope),
    ).toThrow(/上市/);
    expect(() =>
      observedTradabilityDatesV3([evidence], { ...scope, coverageProof: response.coverageProof }),
    ).toThrow(/上市/);
    expect(() => observedTradabilityDatesV3([evidence], { ...scope, symbol: '600519.SH' })).toThrow(
      /身份/,
    );
    expect(
      marketCoverageSessionDatesV3({
        ...response.coverageProof,
        listing: { ...knownMarketListing, firstTradingDate: '2026-05-19' },
      }),
    ).toEqual(['2026-05-19', '2026-05-20']);
    expect(
      backtestDailyTradabilityEvidenceV3Schema.safeParse({
        ...evidence,
        listing: { ...knownBacktestListing, listedOn: '2026-05-19' },
      }).success,
    ).toBe(false);
    expect(
      backtestDailyTradabilityEvidenceV3Schema.safeParse({
        ...evidence,
        range: { start: '2026-05-21', end: '2026-05-20' },
      }).success,
    ).toBe(false);
  });
});
