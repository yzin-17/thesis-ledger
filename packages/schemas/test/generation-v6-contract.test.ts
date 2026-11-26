import { createHash } from 'node:crypto';
import { z } from 'zod';
import { expect, it } from 'vitest';
import { aiGenerationContracts } from '../src/ai-execution.js';
import { discoveryGenerationOutputV6Schema } from '../src/strategy-generation-v6.js';

it.each([
  [aiGenerationContracts.authoringGeneration, 'e9f2585e04dbadef03a4a1ccffcd73ed12353ecd7d321906d236448aee52f18a'],
  [aiGenerationContracts.authoringModification, 'e9f2585e04dbadef03a4a1ccffcd73ed12353ecd7d321906d236448aee52f18a'],
  [aiGenerationContracts.strategyDiscovery, '5aa5062ac04de079463022b69bfa899d84f1c0658a61da74d18d86e194a3222f'],
] as const)('冻结现行模型生成合同的完整 JSON Schema', (contract, expected) => {
  const json = z.toJSONSchema(contract.schema, { io: 'input', unrepresentable: 'any' });
  expect(createHash('sha256').update(JSON.stringify(json)).digest('hex')).toBe(expected);
});

it('V6探索由模型声明全部逻辑来源及坐标，不输出重复字段集合', () => {
  const off = { type: 'compare', operator: 'eq', left: { type: 'constant', value: '0' }, right: { type: 'constant', value: '1' } };
  const raw = { strategy: { name: '零交易', signalSources: [], entryTrigger: 'rising-edge', entry: off, exit: off,
    sizing: { type: 'fixedAmount', amount: '1000' }, risk: [] }, reason: '保留恒假条件', evidenceRefs: [] };
  expect(discoveryGenerationOutputV6Schema.safeParse(raw).success).toBe(true);
  expect(discoveryGenerationOutputV6Schema.safeParse({ ...raw, strategy: { ...raw.strategy, series: ['close'] } }).success).toBe(false);
  const json = JSON.stringify(z.toJSONSchema(discoveryGenerationOutputV6Schema, { io: 'input', unrepresentable: 'any' }));
  expect(json).toContain('capture');
  expect(json).toContain('lag(1)');
});
