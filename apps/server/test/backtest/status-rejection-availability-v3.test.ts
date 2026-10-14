import { describe, expect, it } from 'vitest';
import type { SimulationReject } from '@thesis-ledger/domain';
import { expectedStatusRejectionV3 } from '../../src/backtest/backtest-status-rejection-availability-v3.js';
import { tradingStatusRunConfig } from './trading-status-fixtures.js';
const reject: SimulationReject = { rejectionId: 'status-test', code: 'RULE_REJECTED',
  reason: '目标Bar被冻结模型排除', occurredAt: '2024-05-10T20:00:00Z', availableAt: '2024-05-10T20:00:00Z',
  ruleVersion: 'test', inputFacts: ['bar.suspended=true'] };
describe('新状态模型的拒单结果披露', () => {
  it('必须显式选择新结果策略，旧配置保留原行为', async () => {
    const config = await tradingStatusRunConfig();
    config.executionPriceProtocol.accountingBasis = 'normalized-series';
    const execution = config.executionModel!.segments[0]!.execution;
    if (execution.mode !== 'exchange') throw new Error('缺少模型');
    execution.statusPolicy = { intradayHalt: 'exclude-known-halt-date-v1' };
    expect(expectedStatusRejectionV3(config, reject)).toBe(false);
    execution.statusPolicy.resultAvailability = 'valid-metrics-with-status-rejections-v1';
    expect(expectedStatusRejectionV3(config, reject)).toBe(true);
    expect(expectedStatusRejectionV3(config, { ...reject, inputFacts: ['price.unavailable=true'] })).toBe(false);
    expect(expectedStatusRejectionV3(config, { ...reject, code: 'FUTURE_DATA' })).toBe(false);
    config.executionPriceProtocol.accountingBasis = 'raw-events';
    expect(expectedStatusRejectionV3(config, reject)).toBe(false);
  });
});
