import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { strategyAddGainIssues } from '../src/strategy-add-gain-semantics.js';
import { aiGenerationContracts } from '../src/ai-execution.js';
import { tradePlanStageSchema } from '../src/backtest-trade-plan.js';

const plan = (value: string, kind: 'gainPercent' | 'entryAtrMultiple' = 'gainPercent') => ({
  tradePlan: {
    stages: [
      {
        id: 'add',
        trigger: { kind, value },
        action: { kind: 'add' as const, initialFraction: '1', maxEquityFraction: '0.3' },
      },
    ],
  },
});

describe('加仓涨幅的百分比语义', () => {
  it.each([
    '上涨0.5%时加仓',
    '持仓浮盈达到0.5%触发，追加首次买入数量的100%',
    '涨幅至少0.5％后加仓',
    '加仓触发条件为持仓收益达到0.5%，追加首次买入数量的100%',
    '持仓盈利达到0.5%时加仓',
  ])('拒绝百倍错误且不修改值：%s', (summary) => {
    const strategy = plan('0.5');
    expect(strategyAddGainIssues(strategy, [summary])).toMatchObject([
      { expected: '0.005', actual: '0.5', path: 'tradePlan.stages.0.trigger.value' },
    ]);
    expect(strategy.tradePlan.stages[0]!.trigger.value).toBe('0.5');
  });
  it.each([
    ['上涨0.5%时加仓', '0.0050'],
    ['上涨50%时加仓', '0.50'],
    ['浮盈0.00000001%时追加', '0.0000000001'],
    ['上涨150%时加仓', '1.5'],
  ])('明确且正确的百分比通过：%s', (summary, value) => {
    expect(strategyAddGainIssues(plan(value), [summary])).toEqual([]);
  });
  it.each([
    '未上涨0.5%不加仓',
    '浮盈0.5%不作为加仓条件',
    '日涨幅达到0.5%时加仓',
    '指数上涨0.5%时加仓',
    '上涨0.5%时减仓，之后加仓',
    '上涨0.5%或1%时加仓',
    '保持原加仓规则',
  ])('否定、其他基准与歧义不猜测：%s', (summary) => {
    expect(strategyAddGainIssues(plan('0.5'), [summary])).toEqual([]);
  });
  it('不把多阶段映射或ATR倍数当成唯一百分比规则', () => {
    const stages = plan('0.5').tradePlan.stages;
    expect(
      strategyAddGainIssues(
        { tradePlan: { stages: [...stages, { ...stages[0]!, id: 'second' }] } },
        ['上涨0.5%时加仓'],
      ),
    ).toEqual([]);
    expect(strategyAddGainIssues(plan('2', 'entryAtrMultiple'), ['上涨0.5%时加仓'])).toEqual([]);
    expect(strategyAddGainIssues({}, ['上涨0.5%时加仓'])).toEqual([]);
  });
  it('原始Schema允许合法50%，原生生成Schema直接包含小于1%的单位说明及ATR区别', () => {
    expect(tradePlanStageSchema.parse(plan('0.5').tradePlan.stages[0]).trigger.value).toBe('0.5');
    const json = JSON.stringify(z.toJSONSchema(aiGenerationContracts.strategyDiscovery.schema));
    expect(json).toContain('上涨0.5%必须写');
    expect(json).toContain('0.005');
    expect(json).toContain('不是百分比，不除以100');
  });
});
