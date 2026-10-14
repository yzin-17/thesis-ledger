import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketStatusCompositionV1Schema,
  statusCapabilityQueryV1Schema,
  evaluateStatusCompositionV1,
} from '../src/market-status-composition-v1.js';
import { backtestStatusCompositionV1Schema } from '../src/backtest-status-composition-v1.js';

const samples = JSON.parse(
  readFileSync(
    new URL('./fixtures/market-status-capabilities-v1.shared.json', import.meta.url),
    'utf8',
  ),
).valid;
function fixture() {
  const entries = samples.map((value: { request: object; result: object }) => {
    const item = structuredClone(value);
    const query = statusCapabilityQueryV1Schema.parse(
      Object.fromEntries(
        Object.entries(item.request).filter(
          ([key]) => !['routeTarget', 'policyRevision'].includes(key),
        ),
      ),
    );
    return {
      requirement: 'optional',
      status: 'included',
      query,
      request: item.request,
      result: item.result,
    };
  });
  return JSON.parse(
    JSON.stringify({
      version: 'market-status-composition-v1',
      policy: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'composition-policy',
        revision: 7,
        sourceDesiredRevision: 7,
        enabled: true,
        appliedAt: '2026-10-10T00:00:00Z',
        routes: samples.map((item: { request: { routeKey: object; routeTarget: object } }) => ({
          key: item.request.routeKey,
          enabled: true,
          reason: null,
          targets: [{ ...item.request.routeTarget, eligible: true, reason: null }],
        })),
      },
      entries,
    }),
  );
}
describe('独立能力组合和冻结合同', () => {
  it('五种请求/结果分别保留，基础日期没有价格覆盖', () => {
    const value = marketStatusCompositionV1Schema.parse(fixture());
    expect(value.entries).toHaveLength(5);
    expect(evaluateStatusCompositionV1(value.entries).blockedCapabilities).toEqual([]);
    const dates = value.entries.find(
      (item) => item.query.routeKey.capability === 'SECURITY_BASIC_DATES',
    )!;
    expect('range' in dates.query).toBe(false);
    expect(dates.status === 'included' && 'coverageProof' in dates.result).toBe(false);
  });
  it('必需窗口与可选部分失败分别判断，不伪造成功', () => {
    const raw = fixture();
    raw.entries[1] = { ...raw.entries[1], status: 'failed', error: 'unavailable' };
    delete raw.entries[1].request;
    delete raw.entries[1].result;
    let value = marketStatusCompositionV1Schema.parse(raw);
    expect(evaluateStatusCompositionV1(value.entries).blockedCapabilities).toEqual([]);
    raw.entries[1].requirement = 'completeWindow';
    value = marketStatusCompositionV1Schema.parse(raw);
    expect(evaluateStatusCompositionV1(value.entries).blockedCapabilities).toEqual([
      'RISK_WARNING',
    ]);
  });
  it('必需日期按字段判断，outDate 未提供不等于上市日未知', () => {
    const raw = fixture(),
      dates = raw.entries.at(-1);
    dates.requirement = 'ipoDate';
    expect(
      evaluateStatusCompositionV1(marketStatusCompositionV1Schema.parse(raw).entries)
        .blockedCapabilities,
    ).toEqual([]);
    dates.requirement = 'outDate';
    expect(
      evaluateStatusCompositionV1(marketStatusCompositionV1Schema.parse(raw).entries)
        .blockedCapabilities,
    ).toEqual(['SECURITY_BASIC_DATES']);
  });
  it('明确交易与已摘牌资格冲突保留双方，不按顺序覆盖', () => {
    const raw = fixture();
    raw.entries[0].requirement = 'completeWindow';
    raw.entries[0].result.days[0].state = 'trading';
    raw.entries[3].result.days[0].phase = 'delisted';
    const evaluation = evaluateStatusCompositionV1(
      marketStatusCompositionV1Schema.parse(raw).entries,
    );
    expect(evaluation.conflicts[0]).toMatchObject({
      field: 'exchangeTradeEligibility',
      capabilities: ['DAILY_TRADING_STATUS', 'LISTING_PHASE'],
    });
    expect(evaluation.blockedCapabilities).toContain('DAILY_TRADING_STATUS');
  });
  it('拒绝混合证券、窗口、政策、请求参数和未启用功能', () => {
    for (const mutate of [
      (raw: ReturnType<typeof fixture>) => {
        raw.entries[0].query.symbol = '600519.SH';
      },
      (raw: ReturnType<typeof fixture>) => {
        raw.entries[0].request.policyRevision = 8;
      },
      (raw: ReturnType<typeof fixture>) => {
        raw.policy.routes[0].enabled = false;
      },
      (raw: ReturnType<typeof fixture>) => {
        raw.entries.push(raw.entries[0]);
      },
    ]) {
      const raw = fixture();
      mutate(raw);
      expect(marketStatusCompositionV1Schema.safeParse(raw).success).toBe(false);
    }
  });
  it('新冻结校验采用事实和真实时钟，阻断必需缺失', () => {
    const composition = marketStatusCompositionV1Schema.parse(fixture());
    const snapshot = {
      freezeVersion: 'frozen-status-composition-v1',
      runConfigChecksum: 'a'.repeat(64),
      frozenAt: '2026-10-11T00:00:00Z',
      composition,
      adoption: {
        policy: 'known-suspensions-only-v1',
        suspendedDates: evaluateStatusCompositionV1(composition.entries).suspendedDates,
        observedAfterPriceCutoff: true,
      },
    };
    expect(backtestStatusCompositionV1Schema.safeParse(snapshot).success).toBe(true);
    expect(
      backtestStatusCompositionV1Schema.safeParse({
        ...snapshot,
        adoption: { ...snapshot.adoption, suspendedDates: ['2024-07-16'] },
      }).success,
    ).toBe(false);
    expect(
      backtestStatusCompositionV1Schema.safeParse({ ...snapshot, frozenAt: '2000-01-01T00:00:00Z' })
        .success,
    ).toBe(false);
    const required = fixture();
    required.entries.at(-1).requirement = 'outDate';
    expect(
      backtestStatusCompositionV1Schema.safeParse({ ...snapshot, composition: required }).success,
    ).toBe(false);
  });
});
