import { describe, expect, it } from 'vitest';
import { strategySchema } from '@thesis-ledger/schemas';
import { convertStrategyDefinition } from '../../src/platform/named-v1-strategy-conversion.js';

const asset = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' };
const previous = {
  schemaVersion: '2',
  name: '运行价格绑定',
  signalSources: [{ id: 'price', asset, timeframe: '1d', series: ['close'] }],
  executionInstrument: asset,
  primaryTimeframe: '1d',
  entry: { type: 'positionState', field: 'isOpen' },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'percentOfEquity', percent: '1' },
  risk: [],
  execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
  cost: { commissionRate: '0', slippageRate: '0' },
};

describe('具名策略定义的原配置转换', () => {
  it('明确保存运行价格绑定并保留其他配置', () => {
    const result = convertStrategyDefinition(2, previous);
    expect(result).toEqual({
      outcome: 'convert',
      definition: { ...previous, schemaVersion: 'strategy-definition-v1',
        signalSources: [{ ...previous.signalSources[0], priceCoordinate: 'run' }] },
    });
    expect(strategySchema.safeParse(previous).success).toBe(false);
  });

  it('在冻结规则中转换保护启用结构', () => {
    const condition = { type: 'positionState', field: 'isOpen' };
    const result = convertStrategyDefinition(2, { ...previous, tradePlan: {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      initialStop: { kind: 'percent', percent: '0.05', activateWhen: condition },
      trailing: { drawdownPercent: '0.03', activateWhen: condition },
    } });
    expect(result).toMatchObject({ outcome: 'convert', definition: { tradePlan: {
      initialStop: { kind: 'percent', percent: '0.05', activation: { kind: 'condition', condition } },
      trailing: { drawdownPercent: '0.03', activation: { kind: 'condition', condition } },
    } } });
  });

  it('拒绝转换与旧运行价格绑定冲突的字段', () => {
    const input = { ...previous, signalSources: [{ ...previous.signalSources[0], priceCoordinate: 'research' }] };
    expect(convertStrategyDefinition(2, input).outcome).toBe('delete');
    expect(convertStrategyDefinition(1, input).outcome).toBe('blocked');
  });
});
