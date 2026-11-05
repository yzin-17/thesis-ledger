import { describe, expect, it } from 'vitest';
import { fundHoldingsSchema } from '../src/market.js';
import {
  fundDisclosureEvidenceSchema,
  type FundDisclosureEvidence,
} from '../src/fund-disclosure-evidence.js';

type Matched = Extract<FundDisclosureEvidence, { status: 'matched' }>;
const proof = (changes: Partial<Matched> = {}): Matched => ({
  status: 'matched',
  fundSymbol: '161725.OF',
  reportPeriod: '2026-Q2',
  issuer: '受控合同样本',
  precision: 'DATE_ONLY',
  publishedOn: '2026-08-31',
  timezone: 'Asia/Shanghai',
  referenceObservedAt: '2026-10-21T00:00:00.000Z',
  availableAt: '2026-10-21T00:00:00.000Z',
  referenceVersion: 'a'.repeat(64),
  holdingsDigest: 'b'.repeat(64),
  matchedCount: 1,
  referenceCount: 74,
  algorithm: 'exact_symbol_weight_v1',
  sources: [
    { role: 'report', url: 'https://example.invalid/report', sha256: 'c'.repeat(64) },
    { role: 'publication_notice', url: 'https://example.invalid/notice', sha256: 'd'.repeat(64) },
  ],
  ...changes,
});
const payload = () => ({
  version: 3,
  fundSymbol: '161725.OF',
  reportPeriod: '2026-Q2',
  disclosureDate: null as string | null,
  provider: 'controlled',
  fetchedAt: '2026-10-21T01:00:00Z',
  evidenceVersion: 'b'.repeat(64),
  holdings: [{ symbol: '600519.SH', name: '受控证券', weight: 0.1728 }],
});

describe('基金日期型披露证据', () => {
  it('旧未知响应兼容；新证据保留日期与保守边界，不伪造精确披露', () => {
    expect(fundHoldingsSchema.parse(payload()).disclosureDate).toBeNull();
    const result = fundHoldingsSchema.parse({ ...payload(), disclosureEvidence: proof() });
    expect(result.disclosureDate).toBeNull();
    expect(result.disclosureEvidence).toMatchObject({
      publishedOn: '2026-08-31',
      availableAt: '2026-10-21T00:00:00.000Z',
    });
  });

  it('同日核对仍使用上海日结束，稍晚核对使用真实核对时刻', () => {
    const sameDay = proof({
      referenceObservedAt: '2026-08-31T07:00:00.000Z',
      availableAt: '2026-08-31T16:00:00.000Z',
    });
    expect(fundDisclosureEvidenceSchema.safeParse(sameDay).success).toBe(true);
    expect(
      fundDisclosureEvidenceSchema.safeParse({
        ...sameDay,
        availableAt: '2026-08-31T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      fundDisclosureEvidenceSchema.safeParse({
        ...proof(),
        availableAt: '2026-08-31T16:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it.each([
    { fundSymbol: '000001.OF' },
    { reportPeriod: '2026-Q1' },
    { holdingsDigest: 'e'.repeat(64) },
    { matchedCount: 2 },
    { referenceObservedAt: '2026-10-22T00:00:00.000Z', availableAt: '2026-10-22T00:00:00.000Z' },
  ])('不接受未绑定当前观察的证据 %j', (change) => {
    expect(
      fundHoldingsSchema.safeParse({ ...payload(), disclosureEvidence: proof(change) }).success,
    ).toBe(false);
  });

  it('已有精确时间不能被日期证据覆盖', () => {
    expect(
      fundHoldingsSchema.safeParse({
        ...payload(),
        disclosureDate: '2026-08-31T12:00:00Z',
        disclosureEvidence: proof(),
      }).success,
    ).toBe(false);
  });

  it.each([
    { publishedOn: '2026-06-29' },
    { publishedOn: '2027-01-01' },
    { referenceCount: 0 },
    { referenceObservedAt: 'broken' },
    { reportPeriod: 'invalid' },
    { referenceObservedAt: '2026-10-21T00:00:00.000001Z' },
  ])('日期、时效或格式矛盾须返回校验失败，不抛解析异常 %j', (change) => {
    expect(() => fundDisclosureEvidenceSchema.safeParse({ ...proof(), ...change })).not.toThrow();
    expect(fundDisclosureEvidenceSchema.safeParse({ ...proof(), ...change }).success).toBe(false);
  });

  it('报告和披露公告均需保留，同 URL 冲突摘要不被已匹配状态掩盖', () => {
    const value = proof();
    expect(
      fundDisclosureEvidenceSchema.safeParse({
        ...value,
        sources: [value.sources[0], value.sources[0]],
      }).success,
    ).toBe(false);
    value.sources[1] = { ...value.sources[1]!, url: value.sources[0]!.url };
    expect(fundDisclosureEvidenceSchema.safeParse(value).success).toBe(false);
  });

  it('失配证据不携带可用时刻，仍保留原观察及未知披露', () => {
    const unavailable = {
      status: 'unavailable',
      reasonCode: 'holdings_mismatch',
      fundSymbol: '161725.OF',
      reportPeriod: '2026-Q2',
      referenceVersion: 'a'.repeat(64),
    };
    expect(
      fundHoldingsSchema.safeParse({ ...payload(), disclosureEvidence: unavailable }).success,
    ).toBe(true);
    expect(
      fundDisclosureEvidenceSchema.safeParse({ ...unavailable, availableAt: proof().availableAt })
        .success,
    ).toBe(false);
  });
});
