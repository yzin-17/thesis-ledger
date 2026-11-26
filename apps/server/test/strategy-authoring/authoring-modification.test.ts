import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authoringStrategySchema, executionConfigSchema, type AuthoringContent, type BacktestStrategy } from '@thesis-ledger/schemas';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { authoringProposal } from './authoring-proposal.fixture.js';

const fixture = authoringStrategySchema.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8')) as BacktestStrategy;
const definition: BacktestStrategy = {
  ...fixture,
  entryTrigger: 'rising-edge',
  signalSources: fixture.signalSources.map((source) => ({ ...source, series: ['close'] })),
};
const content: AuthoringContent = { title: '局部修改', description: '均线交易', questions: [],
  requirements: [{ id: 'rule', quote: '均线交易', interpretation: '均线交叉', state: 'understood', definitionPaths: ['entry', 'exit'] }],
  runtimeIntents: [], removedRequirements: [], definitionText: JSON.stringify(definition), manualChanges: [],
  confirmation: { instrumentId: 'catalog', instrument: definition.executionInstrument, timeframe: definition.primaryTimeframe,
    entrySummary: '上穿入场', exitSummary: '下穿退出', sizing: definition.sizing, risk: definition.risk, noExtraRiskConfirmed: false,
    execution: executionConfigSchema.parse(definition.execution), cost: definition.cost, periodsAreBarsConfirmed: true } };
const selection = { intent: '止损改为 3%，其他不变', modificationTarget: 'risk' as const };
const output = (value: BacktestStrategy) =>
  authoringProposal(value, [{ requirementId: 'rule', definitionPaths: ['entry', 'exit'] }]);
describe('服务端局部修改范围', () => {
  it('只改变明确固定止损比例并生成实际差异', () => {
    const after: BacktestStrategy = { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] };
    const result = validateAuthoringModification(content, selection, output(after));
    expect(result.definition).toEqual(after);
    expect(result.allowedPaths).toEqual(['risk.0']);
    expect(result.confirmation.risk).toEqual(after.risk);
    expect(result.differences).toHaveLength(1);
  });
  it.each(['entry', 'executionInstrument', 'primaryTimeframe', 'cost', 'name'])('拒绝附带修改 %s', (key) => {
    const after: BacktestStrategy = { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] };
    if (key === 'entry') after.entry = definition.exit;
    else if (key === 'executionInstrument') after.executionInstrument = { ...definition.executionInstrument, symbol: '159516.SZ' };
    else if (key === 'primaryTimeframe') after.primaryTimeframe = '60m';
    else if (key === 'cost') after.cost = { ...definition.cost, commissionRate: '0.001' };
    else after.name = '模型擅自重命名';
    expect(() => validateAuthoringModification(content, selection, output(after))).toThrow();
  });
  it('拒绝无范围、模糊百分比、比例不符和空修改', () => {
    for (const request of [{ intent: selection.intent }, { ...selection, intent: '调整风险' }, { ...selection, intent: '止损 3% 或 4%' }])
      expect(() => validateAuthoringModification(content, request, output(definition))).toThrow();
    expect(() => validateAuthoringModification(content, selection, output(definition))).toThrow();
    expect(() => validateAuthoringModification(content, { intent: '保持入场', modificationTarget: 'entry' }, output(definition))).toThrow();
  });
});

it('已有买单按当前模板 ID 修改期限，已确认的委托与基线冲突时拒绝', () => {
  const order = (id: string, kind: 'entry' | 'exit') => ({
    id, action: { kind }, order: { kind: 'market' as const }, validity: { kind: 'DAY' as const },
  });
  const execution = { mode: 'exchange' as const, timing: 'dailyBarOrders' as const, orders: [order('open-A', 'entry'), order('close-B', 'exit')] };
  const baseline = { ...definition, execution };
  const draft = { ...content, definitionText: JSON.stringify(baseline), confirmation: { ...content.confirmation!, execution } };
  const range = { modificationTarget: 'entryOrderValidity' as const, intent: '将买单改为两根有效' };
  const change = { change: 'validity', templateId: 'open-A', requirementId: 'rule', value: { kind: 'bars', bars: 2 } };
  const checked = validateAuthoringModification(draft, range, change);
  expect(checked.definition).toEqual({ ...baseline, execution: { ...execution, orders: [{ ...execution.orders[0], validity: change.value }, execution.orders[1]] } });
  expect(() => validateAuthoringModification(draft, range, { ...change, templateId: 'close-B' })).toThrow();
  const conflict = structuredClone(draft);
  conflict.confirmation.execution.orders[1]!.id = 'different-exit';
  expect(() => validateAuthoringModification(conflict, range, change)).toThrow('请先核对基线');
});
