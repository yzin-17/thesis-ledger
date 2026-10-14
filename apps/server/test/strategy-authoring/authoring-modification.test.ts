import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authoringStrategySchema, executionConfigSchema, type AuthoringContent } from '@thesis-ledger/schemas';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';

const definition = authoringStrategySchema.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'));
const content: AuthoringContent = { title: '局部修改', description: '均线交易', questions: [],
  requirements: [{ id: 'rule', quote: '均线交易', interpretation: '均线交叉', state: 'understood', definitionPaths: ['entry', 'exit'] }],
  runtimeIntents: [], removedRequirements: [], definitionText: JSON.stringify(definition), manualChanges: [],
  confirmation: { instrumentId: 'catalog', instrument: definition.executionInstrument, timeframe: definition.primaryTimeframe,
    entrySummary: '上穿入场', exitSummary: '下穿退出', sizing: definition.sizing, risk: definition.risk, noExtraRiskConfirmed: false,
    execution: executionConfigSchema.parse(definition.execution), cost: definition.cost, periodsAreBarsConfirmed: true } };
const selection = { intent: '止损改为 3%，其他不变', modificationTarget: 'risk' as const };
const output = (value: unknown) => ({ definition: value, coverage: [{ requirementId: 'rule', definitionPaths: ['entry', 'exit'] }] });
describe('服务端局部修改范围', () => {
  it('只改变明确固定止损比例并生成实际差异', () => {
    const after = { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] };
    const result = validateAuthoringModification(content, selection, output(after));
    expect(result.definition).toEqual(after);
    expect(result.allowedPaths).toEqual(['risk.0']);
    expect(result.confirmation.risk).toEqual(after.risk);
    expect(result.differences).toHaveLength(1);
  });
  it.each(['entry', 'executionInstrument', 'primaryTimeframe', 'cost', 'name'])('拒绝附带修改 %s', (key) => {
    const after = { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }], [key]: definition[key as keyof typeof definition] };
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
