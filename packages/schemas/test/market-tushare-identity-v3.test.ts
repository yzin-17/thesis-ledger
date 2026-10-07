import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketEventExchangeV3Schema,
  marketEventResponseV3Schema,
  type MarketEventRequestV3,
  type MarketEventResponseV3,
} from '../src/market-event-wire-v3.js';
import {
  marketTushareFundIdentityV3Schema,
  marketTushareIdentityEvidenceV3Schema,
  parseMarketTushareFundIdentityV3,
} from '../src/market-tushare-identity-v3.js';

const golden = JSON.parse(
  readFileSync(
    new URL('../fixtures/market-tushare-identity-v3.synthetic.json', import.meta.url),
    'utf8',
  ),
) as {
  request: MarketEventRequestV3;
  response: MarketEventResponseV3;
  synthetic: boolean;
};
const fixture = () => structuredClone(golden.response);
const bundle = () =>
  parseMarketTushareFundIdentityV3(golden.response.tushareIdentityEvidence!.content);
const rebind = (response: MarketEventResponseV3, content: string) => {
  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  response.tushareIdentityEvidence = { ref: `sha256:${sha256}`, sha256, content };
  response.admission!.evidenceRef = `sha256:${sha256}`;
  response.admission!.evidenceSha256 = sha256;
};

describe('Tushare 独立基金身份原字节合同', () => {
  it('离线合成 golden 保留 UTF-8 原文与独立分红币种，覆盖仍不完整', () => {
    const parsed = marketEventExchangeV3Schema.parse({
      request: golden.request,
      response: golden.response,
    });
    expect(golden.synthetic).toBe(true);
    expect(parsed.response.tushareIdentityEvidence).toEqual(
      golden.response.tushareIdentityEvidence,
    );
    expect(parsed.response.coverage.complete).toBe(false);
    expect(
      createHash('sha256').update(parsed.response.tushareIdentityEvidence!.content).digest('hex'),
    ).toBe(parsed.response.admission!.evidenceSha256);
  });

  it.each([
    { symbol: '159516.OF' },
    { symbol: '１５９５１６.SZ' },
    { symbol: '159516' },
    { symbol: ' 159516.SZ' },
    { instrumentType: 'FUND' },
    { queryFundCode: '159516' },
    { queryFundCode: '159516.SH' },
    { queryFundCode: '000246.SZ' },
    { scopeDateFrom: '2025-02-29' },
    { scopeDateTo: '0000-01-01' },
    { scopeDateFrom: '2026-01-01' },
    { extra: true },
    { identityEvidence: undefined },
    { dividendCurrencyEvidence: undefined },
    {
      dividendCurrencyEvidence: {
        currency: 'EUR',
        documentUrl: 'https://example.test',
        documentSha256: 'b'.repeat(64),
      },
    },
  ])('拒绝非规范映射或缺少独立依据 %#', (patch) => {
    const value = bundle();
    expect(
      marketTushareFundIdentityV3Schema.safeParse({
        ...value,
        mappings: [{ ...value.mappings[0], ...patch }],
      }).success,
    ).toBe(false);
  });

  it.each([
    'invalid',
    'http://example.test',
    'https://user:password@example.test',
    'https://user@example.test',
    'https://@example.test',
    'https:///example.test',
    'https://example.test/a\nb',
    ' https://example.test',
  ])('拒绝无效引用 %s', (documentUrl) => {
    const value = bundle();
    value.mappings[0]!.identityEvidence.documentUrl = documentUrl;
    expect(marketTushareFundIdentityV3Schema.safeParse(value).success).toBe(false);
  });

  it.each([
    '2025-02-29T00:00:00Z',
    '0000-01-01T00:00:00Z',
    '2026-09-28T10:00:00',
    '2026-09-28T10:00:00-00:00',
    '2026-09-28T10:00:00+24:00',
    '2026-09-28T10:00:00+00:60',
    '2026-09-28T10:00:60Z',
    `2026-09-28T10:00:00.${'1'.repeat(1025)}Z`,
  ])('拒绝非法或未知时间 %s', (observedAt) => {
    const value = bundle();
    value.mappings[0]!.observedAt = observedAt;
    expect(marketTushareFundIdentityV3Schema.safeParse(value).success).toBe(false);
  });

  it('全部严格字段、唯一证券与映射数量受限', () => {
    const value = bundle();
    expect(marketTushareFundIdentityV3Schema.safeParse({ ...value, extra: true }).success).toBe(
      false,
    );
    for (const mappings of [
      [],
      [value.mappings[0], value.mappings[0]],
      Array(1001).fill(value.mappings[0]),
    ])
      expect(marketTushareFundIdentityV3Schema.safeParse({ ...value, mappings }).success).toBe(
        false,
      );
    value.mappings = Array.from({ length: 1000 }, (_, index) => ({
      ...value.mappings[0]!,
      symbol: `${String(index).padStart(6, '0')}.SZ`,
      queryFundCode: `${String(index).padStart(6, '0')}.SZ`,
    }));
    expect(marketTushareFundIdentityV3Schema.safeParse(value).success).toBe(true);
  });

  it('拒绝各层及转义同名重复 JSON，字符串标点不视作结构', () => {
    const content = JSON.stringify(bundle());
    for (const altered of [
      content.replace('"contractVersion":1', '"contractVersion":1,"contractVersion":1'),
      content.replace('"queryFundCode":', '"queryFund\\u0043ode":"159516.SZ","queryFundCode":'),
      content.replace(
        '"documentUrl":',
        '"documentUrl":"https://other.example.test","documentUrl":',
      ),
    ])
      expect(() => parseMarketTushareFundIdentityV3(altered)).toThrow('重复 JSON');
    const value = bundle();
    value.mappings[0]!.identityEvidence.documentUrl = 'https://example.test/?q={"x":[],"x":[]}';
    expect(parseMarketTushareFundIdentityV3(JSON.stringify(value))).toEqual(value);
  });

  it('按 UTF-8 字节计量 1 MiB 原文并拒绝不完整代理字符', () => {
    const evidence = golden.response.tushareIdentityEvidence!;
    const content =
      evidence.content + ' '.repeat(1024 * 1024 - Buffer.byteLength(evidence.content));
    expect(parseMarketTushareFundIdentityV3(content)).toEqual(bundle());
    expect(
      marketTushareIdentityEvidenceV3Schema.safeParse({ ...evidence, content: content + ' ' })
        .success,
    ).toBe(false);
    expect(
      marketTushareIdentityEvidenceV3Schema.safeParse({ ...evidence, content: '中'.repeat(400000) })
        .success,
    ).toBe(false);
    expect(
      marketTushareIdentityEvidenceV3Schema.safeParse({ ...evidence, content: '\ud800' }).success,
    ).toBe(false);
  });

  it.each(['1.0', '1e0', 'true', 'NaN', 'Infinity'])(
    '原文版本拒绝非整数 JSON 表达 %s',
    (version) => {
      const content = JSON.stringify(bundle()).replace(
        '"contractVersion":1',
        `"contractVersion":${version}`,
      );
      expect(() => parseMarketTushareFundIdentityV3(content)).toThrow();
    },
  );
});

describe('Tushare 事件响应与精确准入关联', () => {
  it.each([
    'missing-evidence',
    'missing-admission',
    'ref',
    'digest',
    'currency',
    'revoked',
    'range',
    'target',
    'route',
    'future-record',
    'expired',
    'not-started',
    'unknown-offset',
    'date',
    'duplicate-scope',
    'ref-whitespace',
  ])('拒绝准入关联错误 %s', (change) => {
    const value = fixture();
    const admission = value.admission!;
    if (change === 'missing-evidence') delete value.tushareIdentityEvidence;
    else if (change === 'missing-admission') delete value.admission;
    else if (change === 'ref') value.tushareIdentityEvidence!.ref = `sha256:${'c'.repeat(64)}`;
    else if (change === 'digest') admission.evidenceSha256 = 'c'.repeat(64);
    else if (change === 'currency') value.facts[0]!.currency = 'USD';
    else if (change === 'revoked') Object.assign(admission, { invalidatedAt: value.fetchedAt });
    else if (change === 'range') admission.scopeDateTo = '2025-02-28';
    else if (change === 'target') admission.target.upstreamSource = 'other';
    else if (change === 'route') admission.routeKey.market = 'HK';
    else if (change === 'future-record') admission.recordedAt = '2026-09-28T12:00:00.000000001Z';
    else if (change === 'expired') admission.validUntil = value.fetchedAt;
    else if (change === 'not-started') admission.validFrom = '2026-09-28T12:00:00.000000001Z';
    else if (change === 'unknown-offset') value.fetchedAt = '2026-09-28T12:00:00-00:00';
    else if (change === 'date') admission.scopeDateFrom = '0000-01-01';
    else if (change === 'duplicate-scope') admission.scopeSymbols.push(value.symbol);
    else if (change === 'ref-whitespace') admission.evidenceRef = ` ${admission.evidenceRef}`;
    expect(marketEventResponseV3Schema.safeParse(value).success).toBe(false);
  });

  it.each(['other-symbol', 'other-range', 'selected-range', 'future-nanosecond', 'future-1024'])(
    '核对全部映射而非仅选中项 %s',
    (change) => {
      const value = fixture();
      const identity = bundle();
      if (change === 'other-symbol')
        identity.mappings.push({
          ...identity.mappings[0]!,
          symbol: '510300.SH',
          queryFundCode: '510300.SH',
        });
      else if (change === 'other-range') {
        identity.mappings.push({
          ...identity.mappings[0]!,
          symbol: '510300.SH',
          queryFundCode: '510300.SH',
          scopeDateTo: '2026-01-01',
        });
        value.admission!.scopeSymbols.push('510300.SH');
      } else if (change === 'selected-range') identity.mappings[0]!.scopeDateFrom = '2025-02-02';
      else if (change === 'future-nanosecond')
        identity.mappings[0]!.observedAt = '2026-09-28T11:00:00.000000002Z';
      else {
        value.admission!.recordedAt = `2026-09-28T11:00:00.${'0'.repeat(1024)}Z`;
        identity.mappings[0]!.observedAt = `2026-09-28T11:00:00.${'0'.repeat(1023)}1Z`;
      }
      rebind(value, JSON.stringify(identity));
      expect(marketEventResponseV3Schema.safeParse(value).success).toBe(false);
    },
  );

  it('精确比较短有效期、等价偏移、小数尾零与事实未来纳秒', () => {
    const value = fixture();
    value.fetchedAt = '2026-09-28T12:00:00.000000002Z';
    value.admission!.validFrom = '2026-09-28T12:00:00.000000001Z';
    value.admission!.validUntil = '2026-09-28T12:00:00.000000003Z';
    const identity = bundle();
    identity.mappings[0]!.observedAt = '2026-09-28T19:00:00.000000001000+08:00';
    rebind(value, JSON.stringify(identity));
    expect(marketEventResponseV3Schema.safeParse(value).success).toBe(true);
    value.facts[0]!.availableAt = '2026-09-28T12:00:00.000000003Z';
    expect(marketEventResponseV3Schema.safeParse(value).success).toBe(false);
  });

  it('保留 SHA 重算为 Server 后继职责，Schema 仅核对声明关联', () => {
    const value = fixture();
    value.tushareIdentityEvidence!.content += '\n';
    expect(marketEventResponseV3Schema.safeParse(value).success).toBe(true);
  });

  it('1024 位小数精确相等与一纳秒到期上界合法，原时间字符串不改写', () => {
    const value = fixture();
    const identity = bundle();
    const recordedAt = `2026-09-28T11:00:00.${'0'.repeat(1024)}Z`;
    value.admission!.recordedAt = recordedAt;
    identity.mappings[0]!.observedAt = recordedAt;
    value.admission!.validFrom = value.fetchedAt;
    value.admission!.validUntil = '2026-09-28T12:00:00.000000001Z';
    rebind(value, JSON.stringify(identity));
    const result = marketEventResponseV3Schema.parse(value);
    expect(result.admission!.recordedAt).toBe(recordedAt);
    expect(result.tushareIdentityEvidence!.content).toBe(value.tushareIdentityEvidence!.content);
  });

  it.each(['provider', 'upstream', 'market', 'asset', 'capability'])(
    '其他来源或能力禁止 Tushare 字段并保留原无字段路径 %s',
    (change) => {
      const value = fixture();
      delete value.admission;
      value.facts = [];
      if (change === 'provider') value.routeTarget.providerId = 'akshare';
      else if (change === 'upstream') value.routeTarget.upstreamSource = 'other';
      else if (change === 'market') value.routeKey.market = 'HK';
      else if (change === 'asset') value.routeKey.assetType = 'STOCK';
      else value.routeKey.capability = 'SPLIT_EVENT';
      expect(marketEventResponseV3Schema.safeParse(value).success).toBe(false);
      delete value.tushareIdentityEvidence;
      expect(marketEventResponseV3Schema.safeParse(value).success).toBe(true);
    },
  );

  it('不得混用 RQData 身份或拆分日期映射原文', () => {
    const value = fixture();
    for (const field of ['identityEvidence', 'dateMappingEvidence'] as const)
      expect(
        marketEventResponseV3Schema.safeParse({ ...value, [field]: value.tushareIdentityEvidence })
          .success,
      ).toBe(false);
  });
});
