import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketEventExchangeV3Schema,
  parseMarketNoticeDividendPackV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';
import { verifyNoticeDividendsV3 } from '../src/market/market-notice-dividends-v3.js';

const content = readFileSync(
  new URL(
    '../../../packages/schemas/fixtures/market-notice-dividend-pack-v3.json',
    import.meta.url,
  ),
  'utf8',
);
function response(): MarketEventResponseV3 {
  const sha256 = createHash('sha256').update(content).digest('hex');
  const revision = `official-cash-notices-sha256:${sha256}`;
  return {
    contractVersion: 3,
    requestId: 'notice-contract',
    symbol: '510300.SH',
    routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
    routeTarget: {
      providerId: 'official-dividends',
      upstreamSource: 'cn-etf-cash-notices',
      routeIndex: 0,
    },
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 1,
    start: '2023-01-03',
    end: '2023-02-01',
    dataAsOf: '2026-10-07T00:00:00Z',
    fetchedAt: '2026-10-07T00:00:00Z',
    providerRevision: revision,
    admission: {
      consumer: 'thesis-ledger',
      routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
      target: { providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' },
      status: 'admitted',
      admissionState: 'admitted',
      evidenceRef: `sha256:${sha256}`,
      evidenceSha256: sha256,
      scopeSymbols: ['510300.SH'],
      scopeDateFrom: '2023-01-03',
      scopeDateTo: '2023-02-01',
      adapterRevision: 'official-cash-notices-v1',
      sourceRevision: revision,
      credentialRevision: 'not-required',
      validFrom: '2026-10-06T19:00:00Z',
      validUntil: '2026-11-01T00:00:00Z',
      recordVersion: 1,
      recordedAt: '2026-10-06T19:00:00Z',
      invalidatedAt: null,
      invalidationReason: null,
    },
    noticeDividendEvidence: { ref: `sha256:${sha256}`, sha256, content },
    coverage: { complete: true, admissionEvidenceRef: `sha256:${sha256}` },
    facts: [
      {
        symbol: '510300.SH',
        market: 'CN',
        instrumentType: 'ETF',
        type: 'CASH_DIVIDEND',
        effectiveDate: '2023-01-16',
        recordDate: '2023-01-13',
        paymentDate: '2023-01-19',
        cashAmount: '0.064',
        currency: 'CNY',
        occurredAt: '2023-01-16T00:00:00+08:00',
        availableAt: '2026-10-06T18:31:16.730840+00:00',
        provider: 'official-dividends',
        providerRevision: revision,
      },
    ],
  };
}
describe('管理人公告现金证据的在线及离线核验', () => {
  it('原文绑定独立现金覆盖并匹配严格事件 exchange', () => {
    const value = response();
    const request = Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          ![
            'fetchedAt',
            'providerRevision',
            'admission',
            'noticeDividendEvidence',
            'coverage',
            'facts',
          ].includes(key),
      ),
    );
    expect(marketEventExchangeV3Schema.safeParse({ request, response: value }).success).toBe(true);
    expect(() => verifyNoticeDividendsV3(value)).not.toThrow();
    expect(parseMarketNoticeDividendPackV3(content).events[0]?.cashAmount).toBe('0.6400');
  });
  it.each([
    (value: MarketEventResponseV3) => {
      value.noticeDividendEvidence!.content += ' ';
    },
    (value: MarketEventResponseV3) => {
      value.admission!.evidenceSha256 = 'a'.repeat(64);
    },
    (value: MarketEventResponseV3) => {
      value.admission!.sourceRevision = 'old';
    },
    (value: MarketEventResponseV3) => {
      value.admission!.scopeDateFrom = '2023-01-01';
    },
    (value: MarketEventResponseV3) => {
      value.admission!.scopeSymbols.push('159516.SZ');
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.cashAmount = '0.64';
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.paymentDate = '2023-01-16';
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.recordDate = '2023-01-12';
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.availableAt = '2023-01-09T00:00:00Z';
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.strategyVisibility = { kind: 'conservative-day', visibleDate: '2023-01-09' };
    },
    (value: MarketEventResponseV3) => {
      value.facts = [];
    },
    (value: MarketEventResponseV3) => {
      value.facts.push({ ...value.facts[0]! });
    },
    (value: MarketEventResponseV3) => {
      value.dataAsOf = '2026-10-06T18:31:16Z';
    },
    (value: MarketEventResponseV3) => {
      value.dataAsOf = '2026-10-06T18:31:16.730839Z';
    },
    (value: MarketEventResponseV3) => {
      value.facts[0]!.availableAt = '2026-10-06T18:31:16.730841Z';
    },
    (value: MarketEventResponseV3) => {
      value.routeKey.capability = 'SPLIT_EVENT';
    },
  ])('拒绝被修改的事件、原文、身份、时钟或覆盖 #%#', (change) => {
    const value = response();
    change(value);
    expect(() => verifyNoticeDividendsV3(value)).toThrow();
  });
  it('拒绝重复 JSON 字段与缺独立覆盖', () => {
    expect(() =>
      parseMarketNoticeDividendPackV3(
        content.replace('"schemaVersion": 1,', '"schemaVersion": 1,"schemaVersion":1,'),
      ),
    ).toThrow();
    const pack = JSON.parse(content);
    pack.coverage.eventDates = [];
    expect(() => parseMarketNoticeDividendPackV3(JSON.stringify(pack))).toThrow();
  });
  it('空子窗口仍必须带完整原文，旧其他事件来源兼容', () => {
    const value = response();
    value.start = '2023-01-19';
    value.end = '2023-01-19';
    value.facts = [];
    expect(() => verifyNoticeDividendsV3(value)).not.toThrow();
    delete value.noticeDividendEvidence;
    expect(() => verifyNoticeDividendsV3(value)).toThrow();
    value.routeTarget = { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 };
    expect(() => verifyNoticeDividendsV3(value)).not.toThrow();
  });
});
