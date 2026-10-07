import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  marketEventExchangeV3Schema,
  marketEventResponseV3Schema,
  type MarketEventResponseV3,
} from '../src/market-event-wire-v3.js';
import {
  marketHithinkFundIdentityV3Schema,
  parseMarketHithinkFundIdentityV3,
} from '../src/market-hithink-identity-v3.js';

const content =
  JSON.stringify(
    {
      contractVersion: 1,
      kind: 'hithink-fund-identity',
      mappings: [
        {
          symbol: '510300.SH',
          instrumentType: 'ETF',
          queryThscode: '510300.SH',
          fundType: 'exchange',
          scopeDateFrom: '2025-01-01',
          scopeDateTo: '2025-12-31',
          observedAt: '2026-09-28T10:00:00.000000001Z',
          identityEvidence: {
            documentUrl: 'https://identity.example.test/合成ETF',
            documentSha256: 'a'.repeat(64),
          },
          dividendCurrencyEvidence: {
            currency: 'CNY',
            documentUrl: 'https://currency.example.test/合成分红',
            documentSha256: 'b'.repeat(64),
          },
        },
      ],
    },
    null,
    2,
  ) + '\n';
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function fixture(): MarketEventResponseV3 {
  const request = {
    contractVersion: 3,
    requestId: 'synthetic-hithink-cash',
    symbol: '510300.SH',
    routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
    routeTarget: {
      providerId: 'hithink',
      upstreamSource: 'fund-corporate-actions-dividends',
      routeIndex: 0,
    },
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 1,
    start: '2025-06-01',
    end: '2025-06-30',
    dataAsOf: '2026-09-28T12:00:00.000000001Z',
  };
  const digest = hash(content);
  return marketEventResponseV3Schema.parse({
    ...request,
    fetchedAt: '2026-09-28T12:00:00Z',
    providerRevision: `hithink-fund-dividends-content-v1:${'c'.repeat(64)}`,
    admission: {
      consumer: 'thesis-ledger',
      routeKey: request.routeKey,
      target: {
        providerId: request.routeTarget.providerId,
        upstreamSource: request.routeTarget.upstreamSource,
      },
      status: 'admitted',
      admissionState: 'admitted',
      evidenceRef: `sha256:${digest}`,
      evidenceSha256: digest,
      scopeSymbols: [request.symbol],
      scopeDateFrom: '2025-01-01',
      scopeDateTo: '2025-12-31',
      adapterRevision: 'dsa-hithink-fund-dividend-v1',
      sourceRevision: 'hithink-fund-dividends-single-response-v1',
      credentialRevision: `hmac-sha256-v1:${'d'.repeat(64)}`,
      validFrom: '2026-09-28T11:00:00Z',
      validUntil: '2026-09-29T00:00:00Z',
      recordVersion: 1,
      recordedAt: '2026-09-28T11:00:00.000000001Z',
      invalidatedAt: null,
      invalidationReason: null,
    },
    hithinkIdentityEvidence: { ref: `sha256:${digest}`, sha256: digest, content },
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
    facts: [
      {
        symbol: request.symbol,
        market: 'CN',
        instrumentType: 'ETF',
        type: 'CASH_DIVIDEND',
        cashAmount: '0.088',
        currency: 'CNY',
        effectiveDate: '2025-06-18',
        occurredAt: '2025-06-18T00:00:00+08:00',
        availableAt: '2026-09-28T11:30:00Z',
        provider: 'hithink',
        providerRevision: `hithink-fund-dividends-content-v1:${'c'.repeat(64)}`,
      },
    ],
  });
}

function rebind(response: MarketEventResponseV3, updated: string): void {
  const digest = hash(updated);
  response.hithinkIdentityEvidence = { ref: `sha256:${digest}`, sha256: digest, content: updated };
  response.admission!.evidenceRef = `sha256:${digest}`;
  response.admission!.evidenceSha256 = digest;
}

describe('HiThink ETF 分红独立身份与币种合同', () => {
  it('合成事件响应保留原文、精确准入和不完整覆盖', () => {
    const response = fixture();
    const request = Object.fromEntries(
      [
        'contractVersion',
        'requestId',
        'symbol',
        'routeKey',
        'routeTarget',
        'desiredRevision',
        'effectivePolicyRevision',
        'catalogRevision',
        'start',
        'end',
        'dataAsOf',
      ].map((key) => [key, response[key as keyof MarketEventResponseV3]]),
    );
    const parsed = marketEventExchangeV3Schema.parse({
      request,
      response,
    });
    expect(parsed.response.hithinkIdentityEvidence!.content).toBe(content);
    expect(parsed.response.coverage.complete).toBe(false);
  });

  it.each([
    { queryThscode: '510300.SZ' },
    { fundType: 'otc' },
    { instrumentType: 'NAV_FUND' },
    { scopeDateFrom: '2025-02-29' },
    { identityEvidence: undefined },
    { dividendCurrencyEvidence: { currency: 'EUR' } },
  ])('拒绝错误标的、基金类型和币种原文 %#', (patch) => {
    const bundle = parseMarketHithinkFundIdentityV3(content);
    const mapping = { ...bundle.mappings[0], ...patch };
    expect(
      marketHithinkFundIdentityV3Schema.safeParse({ ...bundle, mappings: [mapping] }).success,
    ).toBe(false);
  });

  it('拒绝重复 JSON 字段及重复证券，原文内字符串标点不当作结构', () => {
    const duplicate = content.replace(
      '"queryThscode":',
      '"queryThscode":"510300.SH","queryThscode":',
    );
    expect(() => parseMarketHithinkFundIdentityV3(duplicate)).toThrow('重复 JSON');
    const bundle = parseMarketHithinkFundIdentityV3(content);
    bundle.mappings.push(bundle.mappings[0]!);
    expect(marketHithinkFundIdentityV3Schema.safeParse(bundle).success).toBe(false);
    bundle.mappings.pop();
    bundle.mappings[0]!.identityEvidence.documentUrl += '?q={"x":[],"x":[]}';
    expect(parseMarketHithinkFundIdentityV3(JSON.stringify(bundle))).toEqual(bundle);
  });

  it.each(['missing', 'currency', 'credential', 'late', 'expired', 'scope', 'target'])(
    '拒绝不匹配的准入或事实 %s',
    (change) => {
      const response = fixture();
      if (change === 'missing') delete response.hithinkIdentityEvidence;
      else if (change === 'currency') response.facts[0]!.currency = 'USD';
      else if (change === 'credential') response.admission!.credentialRevision = 'not-required';
      else if (change === 'late') response.admission!.recordedAt = '2026-09-28T12:00:00.000000001Z';
      else if (change === 'expired') response.admission!.validUntil = response.fetchedAt;
      else if (change === 'scope') response.admission!.scopeDateTo = '2025-06-29';
      else response.admission!.target.upstreamSource = 'fund-market-historical';
      expect(marketEventResponseV3Schema.safeParse(response).success).toBe(false);
    },
  );

  it('所有映射必须在准入范围和精确时刻内，事实未来纳秒拒绝', () => {
    const response = fixture();
    const bundle = parseMarketHithinkFundIdentityV3(content);
    bundle.mappings[0]!.observedAt = '2026-09-28T11:00:00.000000002Z';
    rebind(response, JSON.stringify(bundle));
    expect(marketEventResponseV3Schema.safeParse(response).success).toBe(false);
    bundle.mappings[0]!.observedAt = '2026-09-28T10:00:00Z';
    rebind(response, JSON.stringify(bundle));
    response.facts[0]!.availableAt = '2026-09-28T12:00:00.000000002Z';
    expect(marketEventResponseV3Schema.safeParse(response).success).toBe(false);
  });

  it('其它来源不能携带 HiThink 原文，精确来源必须携带原文', () => {
    const response = fixture();
    response.routeTarget.providerId = 'akshare';
    expect(marketEventResponseV3Schema.safeParse(response).success).toBe(false);
    delete response.hithinkIdentityEvidence;
    expect(marketEventResponseV3Schema.safeParse(response).success).toBe(false);
  });

  it('Schema 保留摘要复核给 Server，原文尾部改变后结构仍合法', () => {
    const response = fixture();
    response.hithinkIdentityEvidence!.content += '\n';
    expect(marketEventResponseV3Schema.safeParse(response).success).toBe(true);
  });
});
