import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import type { BacktestKnownCashResearchInputV3 } from '@thesis-ledger/schemas';
import {
  freezeKnownCashResearchInputV3,
  projectKnownCashResearchAccountingV3,
  verifyKnownCashResearchInputV3,
} from '../../src/backtest/backtest-known-cash-research-v3.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

function body(): Omit<BacktestKnownCashResearchInputV3, 'recordsHash' | 'contentHash'> {
  return {
    policy: {
      version: 'known-announced-cash-events-v1',
      entitlement: 'settled-record-date-holdings',
      receivable: 'ex-date',
      settlement: 'assume-scheduled-payment-date',
      missingEvents: 'excluded-with-unknown-coverage',
      usage: 'accounting-only',
      splitEvents: 'not-modelled',
      historicalAvailability: 'notVerified',
    },
    scope: {
      symbol: '510300.SH',
      market: 'CN',
      instrumentType: 'ETF',
      currency: 'CNY',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
      dataAsOf: '2026-10-09T14:00:00Z',
    },
    executionPriceProtocol: {
      ...JSON.parse(
        readFileSync(
          new URL(
            '../../../../packages/schemas/fixtures/execution-price.raw-events.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
      history: { basis: 'fixed-provider-snapshot' },
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
    },
    source: {
      target: { providerId: 'provider-a', upstreamSource: 'distributions', routeIndex: 0 },
      providerRevision: 'r1',
      adapterRevision: 'adapter-v1',
      normalizationRevision: 'normalizer-v1',
      responseSha256: 'a'.repeat(64),
      observedAt: '2026-10-09T13:00:00Z',
    },
    revisions: { desiredRevision: 3, effectivePolicyRevision: 3, catalogRevision: 74 },
    coverage: { complete: false, reason: '历史覆盖未知' },
    ignoredEmptyRows: 0,
    records: [
      {
        symbol: '510300.SH',
        announcementDate: '2025-06-11',
        recordDate: '2025-06-17',
        effectiveDate: '2025-06-18',
        paymentDate: '2025-06-27',
        amountPerFundUnit: '0.088',
        currency: 'CNY',
        planStatus: 'implementation-plan-announced',
        statusBasis: 'research-assumption',
        sourcePlanStatus: 'opaque',
        sourceSemanticsRevision: 'semantics-v1',
        sourceAmount: { value: '0.88', unit: 'per-ten-fund-units' },
      },
    ],
  };
}
const marketInputs = {
  calendar: cnTradingCalendar,
  bars: [{ openedAt: '2025-06-18T01:30:00Z' }, { openedAt: '2025-06-27T01:30:00Z' }],
};

describe('已知现金方案冻结与既有时点投影', () => {
  it('独立绑定来源与假设，离线重复投影保留未知覆盖和源时钟', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('离线');
    });
    try {
      const frozen = freezeKnownCashResearchInputV3(body());
      const original = JSON.stringify(frozen);
      const result = projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, marketInputs);
      expect(result.input.coverage.complete).toBe(false);
      expect(result.actions[0]).toMatchObject({
        cashAmount: '0.088',
        recordDate: '2025-06-17',
        effectiveDate: '2025-06-18',
        accountingAt: '2025-06-18T01:30:00Z',
        cashSettlementAt: '2025-06-27T01:30:00Z',
        availableAt: frozen.source.observedAt,
        researchClock: { basis: 'fixed-provider-snapshot', dataAsOf: frozen.scope.dataAsOf },
        provider: 'provider-a',
        providerRevision: 'r1',
      });
      expect(result.actions[0]).not.toHaveProperty('strategyVisibility');
      expect(
        projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, marketInputs),
      ).toEqual(result);
      expect(JSON.stringify(frozen)).toBe(original);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('窗口末尾未到发放日保留应收，不能提前提供可用现金', () => {
    const input = body();
    input.scope.endDate = '2025-06-19';
    const frozen = freezeKnownCashResearchInputV3(input);
    const { actions } = projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, {
      ...marketInputs,
      bars: [marketInputs.bars[0]!],
    });
    expect(actions[0]).not.toHaveProperty('cashSettlementAt');
  });
  it.each([
    ['除息开盘', { ...marketInputs, bars: [marketInputs.bars[1]!] }, '生效日冻结开盘'],
    ['发放开盘', { ...marketInputs, bars: [marketInputs.bars[0]!] }, '发放日缺冻结开盘'],
  ])('缺%s时仍拒绝', (_label, inputs, message) => {
    const frozen = freezeKnownCashResearchInputV3(body());
    expect(() => projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, inputs)).toThrow(
      message,
    );
  });
  it('登记日不是除息前最后交易日时拒绝', () => {
    const input = body();
    input.records[0]!.recordDate = '2025-06-16';
    const frozen = freezeKnownCashResearchInputV3(input);
    expect(() =>
      projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, marketInputs),
    ).toThrow('最后交易日');
  });
  it('原始每十份单位必须精确匹配，不依赖浮点舍入', () => {
    const input = body();
    input.records[0]!.amountPerFundUnit = '0.12345678901234567890123456789';
    input.records[0]!.sourceAmount.value = '1.2345678901234567890123456789';
    expect(freezeKnownCashResearchInputV3(input).records[0]!.amountPerFundUnit).toBe(
      input.records[0]!.amountPerFundUnit,
    );
    input.records[0]!.sourceAmount.value = '1.2345678901234567890123456788';
    expect(() => freezeKnownCashResearchInputV3(input)).toThrow('原金额');
    input.records[0]!.sourceAmount = {
      value: input.records[0]!.amountPerFundUnit,
      unit: 'per-fund-unit',
    };
    expect(freezeKnownCashResearchInputV3(input).records).toHaveLength(1);
  });
  it.each([
    [
      '来源',
      (x: ReturnType<typeof body>) => {
        x.source.target.providerId = 'provider-b';
      },
    ],
    [
      '源摘要',
      (x: ReturnType<typeof body>) => {
        x.source.responseSha256 = 'b'.repeat(64);
      },
    ],
    [
      '控制版本',
      (x: ReturnType<typeof body>) => {
        x.revisions.catalogRevision++;
      },
    ],
    [
      '区间',
      (x: ReturnType<typeof body>) => {
        x.scope.endDate = '2025-06-29';
      },
    ],
    [
      '观察时钟',
      (x: ReturnType<typeof body>) => {
        x.source.observedAt = '2026-10-09T13:01:00Z';
      },
    ],
    [
      '原进度',
      (x: ReturnType<typeof body>) => {
        x.records[0]!.sourcePlanStatus = 'other-opaque';
      },
    ],
    [
      '占位数',
      (x: ReturnType<typeof body>) => {
        x.ignoredEmptyRows++;
      },
    ],
    [
      '未知覆盖原因',
      (x: ReturnType<typeof body>) => {
        x.coverage.reason = '其他未知原因';
      },
    ],
  ])('重新冻结%s后必须重新准备，不能用自校验替代准备绑定', (_label, change) => {
    const input = body();
    const prepared = freezeKnownCashResearchInputV3(input);
    change(input);
    const updated = freezeKnownCashResearchInputV3(input);
    expect(updated.contentHash).not.toBe(prepared.contentHash);
    expect(() => verifyKnownCashResearchInputV3(updated, prepared.contentHash)).toThrow(
      '需重新准备',
    );
    expect(verifyKnownCashResearchInputV3(updated, updated.contentHash)).toEqual(updated);
  });
  it('直接篡改内容或仅重算整包摘要仍拒绝', () => {
    const frozen = freezeKnownCashResearchInputV3(body());
    const prepared = frozen.contentHash;
    frozen.records[0]!.sourcePlanStatus = 'modified';
    expect(() => verifyKnownCashResearchInputV3(frozen, prepared)).toThrow('摘要不一致');
    frozen.contentHash = hashCanonicalManifest(frozen);
    expect(() => verifyKnownCashResearchInputV3(frozen, frozen.contentHash)).toThrow('摘要不一致');
  });
  it('任意通用来源均使用同一投影，不解释供应商枚举', () => {
    const input = body();
    input.source.target = {
      providerId: 'another-source',
      upstreamSource: 'structured-plans',
      routeIndex: 1,
    };
    input.records[0]!.sourcePlanStatus = 'ANNOUNCED';
    input.records[0]!.statusBasis = 'source-defined';
    const frozen = freezeKnownCashResearchInputV3(input);
    expect(
      projectKnownCashResearchAccountingV3(frozen, frozen.contentHash, marketInputs).actions[0]!
        .provider,
    ).toBe('another-source');
  });
});
