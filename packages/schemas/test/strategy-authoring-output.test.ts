import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  authoringGenerationOutputSchema,
  authoringModificationOutputSchema,
} from '../src/strategy-authoring-generation.js';
import { aiGenerationContracts, aiGenerationContractRefSchema } from '../src/ai-execution.js';

const definition = JSON.parse(
  readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'),
);
const sample = {
  definition,
  coverage: [{ requirementId: 'rule', definitionPaths: ['entry', 'risk.0.percent'] }],
};
describe('编写模型输出的完整结构化合同', () => {
  it('生成及修改直接表达 AST 和执行结构，不再给上游发送 unknown 字段', () => {
    for (const schema of [authoringGenerationOutputSchema, authoringModificationOutputSchema]) {
      expect(schema.parse(sample)).toEqual(sample);
      const output = z.toJSONSchema(schema, { io: 'output' });
      const wire = JSON.stringify(output);
      expect(wire).toContain('nextEligibleBarOpen');
      expect(wire).toContain('sourceId');
      expect(wire).toContain('conditions');
      expect(wire).toContain('nextAvailableNav');
      const properties = (output.properties!.definition as Record<string, unknown>)
        .properties as Record<string, unknown>;
      expect(properties.entry).not.toEqual({});
      expect(properties.execution).not.toEqual({});
    }
  });
  it('拒绝错误的条件或执行表达，保留当前 Canonical 交叉约束', () => {
    expect(
      authoringGenerationOutputSchema.safeParse({
        ...sample,
        definition: { ...definition, entry: 'close > MA20' },
      }).success,
    ).toBe(false);
    expect(
      authoringGenerationOutputSchema.safeParse({
        ...sample,
        definition: { ...definition, execution: { type: 'exchange' } },
      }).success,
    ).toBe(false);
    expect(
      authoringGenerationOutputSchema.safeParse({
        ...sample,
        definition: {
          ...definition,
          entry: {
            ...definition.entry,
            left: { type: 'series', sourceId: 'undeclared', field: 'close' },
          },
        },
      }).success,
    ).toBe(false);
  });
  it('新请求使用 v2，历史 v1 引用仍可读且不会伪装成新验证', () => {
    expect(aiGenerationContracts.authoringGeneration.ref.version).toBe('authoring-generation-v2');
    expect(aiGenerationContracts.authoringModification.ref.version).toBe(
      'authoring-modification-v2',
    );
    expect(
      aiGenerationContractRefSchema.parse({
        id: 'strategy_authoring_generation',
        version: 'authoring-generation-v1',
      }).version,
    ).toBe('authoring-generation-v1');
  });
});
