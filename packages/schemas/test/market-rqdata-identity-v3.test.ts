import { describe, expect, it } from 'vitest';
import { marketEventResponseV3Schema } from '../src/market-event-wire-v3.js';
import {
  marketRqdataFundIdentityV3Schema,
  parseMarketRqdataFundIdentityV3,
} from '../src/market-rqdata-identity-v3.js';
import { rqdataEventFixture, rqdataIdentityBundle } from './fixtures/market-rqdata-event-v3.js';

describe('RQData ETF 身份原文合同', () => {
  it.each(['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const)(
    '允许绑定原文的 %s 观测，覆盖仍不完整',
    (capability) => {
      const fixture = rqdataEventFixture(capability);
      const response = marketEventResponseV3Schema.parse(fixture.response);
      expect(response.identityEvidence?.content).toBe(fixture.response.identityEvidence.content);
      expect(response.coverage.complete).toBe(false);
    },
  );

  it.each([
    { queryFundCode: '000246' },
    { queryFundCode: '159516_CH0' },
    { instrumentType: 'STOCK' },
    { scopeDateFrom: '2026-01-01' },
    { observedAt: '2026-09-27T10:00:00' },
    { identityEvidence: { documentUrl: 'invalid-url', documentSha256: 'a'.repeat(64) } },
    {
      identityEvidence: {
        documentUrl: 'https://secret:password@example.test',
        documentSha256: 'a'.repeat(64),
      },
    },
    { dividendCurrencyEvidence: null },
  ])('拒绝无效映射字段 %#', (patch) => {
    const bundle = rqdataIdentityBundle();
    bundle.mappings[0] = { ...bundle.mappings[0]!, ...patch } as (typeof bundle.mappings)[number];
    expect(marketRqdataFundIdentityV3Schema.safeParse(bundle).success).toBe(false);
  });

  it('拒绝重复映射及包含转义字段名的重复 JSON', () => {
    const bundle = rqdataIdentityBundle();
    bundle.mappings.push(bundle.mappings[0]!);
    expect(marketRqdataFundIdentityV3Schema.safeParse(bundle).success).toBe(false);
    const content = JSON.stringify(rqdataIdentityBundle());
    for (const altered of [
      content.replace('"contractVersion":1', '"contractVersion":1,"contractVersion":1'),
      content.replace(
        '"queryFundCode":"159516"',
        '"queryFundCode":"159516","queryFund\\u0043ode":"159516"',
      ),
      content.replace(
        '"documentUrl":',
        '"documentUrl":"https://other.example.test","documentUrl":',
      ),
    ])
      expect(() => parseMarketRqdataFundIdentityV3(altered)).toThrow('重复 JSON');
  });

  it('JSON 字符串中的标点和转义不被视为字段，原字节不被规范化', () => {
    const bundle = rqdataIdentityBundle();
    bundle.mappings[0]!.identityEvidence.documentUrl =
      'https://identity.example.test/?q={"scope":[],"scope":[]}';
    const content = JSON.stringify(bundle, null, 2);
    expect(parseMarketRqdataFundIdentityV3(content)).toEqual(bundle);
  });

  it.each([
    'missing-evidence',
    'missing-admission',
    'ref',
    'digest',
    'source',
    'market',
    'range',
    'observed',
    'currency',
    'missing-currency',
  ])('拒绝准入或身份关联错误 %s', (change) => {
    const { response } = rqdataEventFixture();
    const value: Record<string, unknown> = structuredClone(response);
    const bundle = rqdataIdentityBundle();
    if (change === 'missing-evidence') delete value.identityEvidence;
    else if (change === 'missing-admission') delete value.admission;
    else if (change === 'ref') response.identityEvidence.ref = `sha256:${'c'.repeat(64)}`;
    else if (change === 'digest') response.identityEvidence.sha256 = 'c'.repeat(64);
    else if (change === 'source') response.routeTarget.upstreamSource = 'other-source';
    else if (change === 'market') response.routeKey.market = 'HK';
    else if (change === 'range') bundle.mappings[0]!.scopeDateFrom = '2025-02-15';
    else if (change === 'observed') bundle.mappings[0]!.observedAt = '2026-09-27T11:30:00Z';
    else if (change === 'currency') response.facts[0]!.currency = 'USD';
    else if (change === 'missing-currency')
      delete (bundle.mappings[0] as Record<string, unknown>).dividendCurrencyEvidence;
    if (['range', 'observed', 'missing-currency'].includes(change))
      response.identityEvidence.content = JSON.stringify(bundle);
    const checked =
      change.startsWith('missing-') && change !== 'missing-currency' ? value : response;
    expect(marketEventResponseV3Schema.safeParse(checked).success).toBe(false);
  });

  it('拒绝其他来源借用身份证据，并核对冻结截点', () => {
    const { response } = rqdataEventFixture();
    expect(
      marketEventResponseV3Schema.safeParse({
        ...response,
        routeTarget: { ...response.routeTarget, providerId: 'akshare' },
      }).success,
    ).toBe(false);
    expect(
      marketEventResponseV3Schema.safeParse({
        ...response,
        dataAsOf: '2026-09-27T10:30:00Z',
        facts: [],
      }).success,
    ).toBe(false);
  });
});
