import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  aiGenerationContracts,
  optimizationDiscoveryGenerationOutputSchema,
} from '../src/index.js';

it('发现先完整配置再回读说明，拒绝旧输出且说明不改配置', () => {
  const strategy = {
    name: '隔离格式样本',
    series: ['close'],
    entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'percentOfEquity', percent: '0.2' },
    risk: [],
  };
  const previous = { strategy, evidenceRefs: [] };
  expect(optimizationDiscoveryGenerationOutputSchema.parse(previous)).toEqual(previous);
  const schema = aiGenerationContracts.strategyDiscovery.schema;
  expect(schema.safeParse(previous).success).toBe(false);
  const output = { ...previous, reason: '核对文本不能改变策略的入场与退出' };
  expect(schema.safeParse(output).success).toBe(false);
  const document = z.toJSONSchema(schema, { target: 'draft-7' });
  const native = (document.anyOf?.[0] ?? document) as typeof document;
  expect(Object.keys(native.properties!)[0]).toBe('strategy');
  expect(native.required).toContain('reason');
  const rules = Object.fromEntries(Object.entries(strategy).filter(([key]) => key !== 'series'));
  const current = { ...output, strategy: { ...rules, signalSources: [], entryTrigger: 'rising-edge' } };
  expect(schema.parse(current)).toEqual(current);
  expect(schema.parse({ ...current, reason: '不同说明也不能补写任何保护' })).toMatchObject({
    strategy: current.strategy,
  });
});
