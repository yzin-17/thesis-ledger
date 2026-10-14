import { describe, expect, it } from 'vitest';
import type { BacktestBenchmarkCostAssumption } from '@thesis-ledger/domain';
import {
  backtestBenchmarkCompatibilitySchemaV3,
  backtestBenchmarkCostAssumptionV3Schema,
} from '../src/backtest-result.js';

const cost: BacktestBenchmarkCostAssumption = {
  kind: 'execution-model',
  version: 'frozen-execution-cost-v1',
  fingerprint: '1234567890abcdef',
};

describe('执行模型型基准成本合同', () => {
  it('接受 Domain 成本身份并保留 V3 兼容报告中的原值', () => {
    const report = {
      status: 'compatible',
      strategyFingerprint: 'a'.repeat(16),
      benchmarkFingerprint: 'a'.repeat(16),
      missingFields: [],
      differentFields: [],
      costAssumption: cost,
    };
    expect(backtestBenchmarkCostAssumptionV3Schema.parse(cost)).toEqual(cost);
    expect(backtestBenchmarkCompatibilitySchemaV3.parse(report)).toEqual(report);
  });

  it.each([
    { ...cost, version: undefined },
    { ...cost, version: ' ' },
    { ...cost, fingerprint: undefined },
    { ...cost, fingerprint: '' },
    { ...cost, fingerprint: 'a'.repeat(64) },
    { ...cost, fingerprint: 'ABCDEF1234567890' },
    { ...cost, fingerprint: 'z'.repeat(16) },
  ])('拒绝缺失或无效的执行模型身份：%j', (value) => {
    expect(backtestBenchmarkCostAssumptionV3Schema.safeParse(value).success).toBe(false);
  });

  it.each([{ commissionRate: '0.0003' }, { paidFees: '35.25' }, { fills: [] }])(
    '拒绝把比例摘要或已成交结果混入执行模型身份：%j',
    (extra) => {
      expect(backtestBenchmarkCostAssumptionV3Schema.safeParse({ ...cost, ...extra }).success).toBe(
        false,
      );
    },
  );

  it('保留已有四类合同，旧 unsupported 指纹不改为新格式', () => {
    for (const legacy of [
      { kind: 'zero-cost', version: 'legacy-v2-zero-cost' },
      { kind: 'proportional', version: 'legacy-v3', commissionRate: '0.001', slippageRate: '0' },
      { kind: 'unsupported', version: 'legacy-v3', fingerprint: 'legacy-opaque-fingerprint' },
      { kind: 'unavailable' },
    ]) {
      expect(backtestBenchmarkCostAssumptionV3Schema.parse(legacy)).toEqual(legacy);
    }
  });
});
