import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  authoringContentSchema,
  authoringOperationInputSchema,
  authoringDraftReadSchema,
} from '../src/strategy-authoring.js';
import {
  authoringDefinitionCheck,
  authoringStrategySchema,
} from '../src/strategy-authoring-definition.js';

const sample = () =>
  JSON.parse(
    readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'),
  );
const valid = (value: unknown) => authoringStrategySchema.safeParse(JSON.stringify(value)).success;
const content = {
  title: '',
  description: '',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '{',
  manualChanges: [],
};

describe('自然语言编写合同和能力交集', () => {
  it('读合同不会把终态无引用或未审核内容伪装成有效定义', () => {
    const record = {
      id: '11111111-1111-4111-8111-111111111111',
      ownerId: 'alice',
      state: 'editing',
      revision: 1,
      title: '',
      savedVersionId: null,
      content,
      validation: { status: 'invalid', issues: [] },
      createdAt: '2026-10-04T01:00:00Z',
      updatedAt: '2026-10-04T01:00:00Z',
    };
    expect(authoringDraftReadSchema.safeParse(record).success).toBe(true);
    expect(authoringDraftReadSchema.safeParse({ ...record, state: 'saved' }).success).toBe(false);
    expect(
      authoringDraftReadSchema.safeParse({ ...record, validation: { status: 'valid', issues: [] } })
        .success,
    ).toBe(false);
  });
  it.each(['1d', '60m', '30m', '15m', '5m', '1m'])('确认单一 %s 周期可表达', (timeframe) => {
    const definition = sample();
    definition.primaryTimeframe = timeframe;
    definition.signalSources[0].timeframe = timeframe;
    expect(valid(definition)).toBe(true);
  });
  it.each(['CN', 'HK', 'US'])('确认 %s 场内市场及完整 boolean 条件', (market) => {
    const definition = sample();
    definition.executionInstrument.market = market;
    definition.signalSources[0].asset.market = market;
    definition.entry = {
      type: 'all',
      conditions: [
        definition.entry,
        { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      ],
    };
    definition.exit = {
      type: 'any',
      conditions: [
        definition.exit,
        {
          type: 'compare',
          operator: 'gte',
          left: { type: 'positionState', field: 'holdingPeriods' },
          right: { type: 'constant', value: '20' },
        },
      ],
    };
    expect(valid(definition)).toBe(true);
  });
  it('允许保存不完整内容，校验状态由服务端推导', () => {
    expect(authoringContentSchema.parse(content).definitionText).toBe('{');
    expect(authoringContentSchema.safeParse({ ...content, validation: 'valid' }).success).toBe(
      false,
    );
    expect(authoringDefinitionCheck('').status).toBe('incomplete');
    expect(authoringDefinitionCheck('{').status).toBe('invalid');
    expect(authoringDefinitionCheck(JSON.stringify(sample())).status).toBe('structurally_valid');
  });
  it('场内和 CN NAV 日频定义均可表达，不恢复旧合同', () => {
    expect(valid(sample())).toBe(true);
    const nav = sample();
    nav.executionInstrument = { symbol: '110011.OF', market: 'CN', assetType: 'fund' };
    nav.signalSources[0].asset = nav.executionInstrument;
    nav.signalSources[0].series = ['nav'];
    nav.entry.left.field = 'nav';
    nav.entry.right.input.field = 'nav';
    nav.exit.left.field = 'nav';
    nav.exit.right.input.field = 'nav';
    nav.execution = {
      mode: 'nav',
      requestTypes: ['subscribe', 'redeem'],
      timing: 'nextAvailableNav',
    };
    expect(valid(nav)).toBe(true);
    nav.schemaVersion = '1';
    expect(valid(nav)).toBe(false);
  });
  it.each(['MA', 'EMA', 'RSI', 'MACD', 'ATR', 'VWAP', 'Highest', 'Lowest'])(
    '确认 %s 指标与仓位风险合同',
    (name) => {
      const definition = sample();
      const indicator = definition.entry.right;
      indicator.name = name;
      if (name === 'MACD') {
        indicator.params = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };
        indicator.output = 'histogram';
      }
      expect(valid(definition)).toBe(true);
    },
  );
  it.each(['fixedAmount', 'fixedQuantity', 'percentOfEquity', 'targetWeight'])(
    '确认 %s 仓位',
    (type) => {
      const definition = sample();
      const field = {
        fixedAmount: 'amount',
        fixedQuantity: 'quantity',
        percentOfEquity: 'percent',
        targetWeight: 'weight',
      }[type]!;
      definition.sizing = { type, [field]: '0.5' };
      definition.risk = [
        { type: 'maxHoldingPeriod', periods: 20 },
        { type: 'fixedTakeProfit', percent: '0.1' },
      ];
      expect(valid(definition)).toBe(true);
    },
  );
  it('拒绝多标的、多周期、费用缺失、百分比错误和当日收盘执行', () => {
    const mutations = [
      (d: ReturnType<typeof sample>) => {
        d.signalSources.push({ ...d.signalSources[0], id: 'second' });
      },
      (d: ReturnType<typeof sample>) => {
        d.signalSources[0].asset.symbol = '600000.SH';
      },
      (d: ReturnType<typeof sample>) => {
        d.signalSources[0].timeframe = '5m';
      },
      (d: ReturnType<typeof sample>) => {
        delete d.cost;
      },
      (d: ReturnType<typeof sample>) => {
        d.risk[0].percent = '5';
      },
      (d: ReturnType<typeof sample>) => {
        d.execution.timing = 'sameBarClose';
      },
      (d: ReturnType<typeof sample>) => {
        d.benchmark = d.executionInstrument;
      },
      (d: ReturnType<typeof sample>) => {
        d.entry = { type: 'code', code: 'buy()' };
      },
      (d: ReturnType<typeof sample>) => {
        d.entry = { type: 'corporateActionEvent', eventType: 'cashDividend' };
      },
    ];
    for (const mutate of mutations) {
      const definition = sample();
      mutate(definition);
      expect(valid(definition)).toBe(false);
    }
  });
  it('拒绝递归过深和嵌套指标及输入上限', () => {
    const definition = sample();
    definition.entry.right.input = structuredClone(definition.entry.right);
    expect(valid(definition)).toBe(false);
    for (let i = 0; i < 100; i++) definition.entry = { type: 'not', expression: definition.entry };
    expect(valid(definition)).toBe(false);
    expect(
      authoringContentSchema.safeParse({ ...content, description: '中'.repeat(12_001) }).success,
    ).toBe(false);
    expect(
      authoringContentSchema.safeParse({ ...content, definitionText: '中'.repeat(65_536) }).success,
    ).toBe(false);
  });
  it('费用未知必须确认，不接受零金额替代未知事实', () => {
    const input = {
      kind: 'analyze',
      expectedRevision: 1,
      idempotencyKey: 'click-1',
      providerId: 'selected',
      model: 'chosen',
      promptVersion: 'nl-v1',
      capabilityVersion: 'authoring-v1',
      intent: '',
      cost: { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
      unknownCostAcknowledgedAt: null,
    };
    expect(authoringOperationInputSchema.safeParse(input).success).toBe(false);
    input.unknownCostAcknowledgedAt = '2026-10-04T01:00:00Z' as never;
    expect(authoringOperationInputSchema.safeParse(input).success).toBe(true);
    input.cost.amount = '0' as never;
    expect(authoringOperationInputSchema.safeParse(input).success).toBe(false);
  });
});
