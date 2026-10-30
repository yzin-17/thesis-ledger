import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { buildFrozenResearchMessagesV2 } from '../../src/ai/ai-research-messages-v2.js';
import { researchInputTokenEstimate } from '../../src/ai/ai-research-sdk-reservation.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

const document = (schema: z.ZodType): unknown => {
  const prompt = buildGenerationSchemaPrompt(schema);
  const marker = 'OUTPUT_JSON_SCHEMA:';
  return JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as unknown;
};

describe('预算前的生成 Schema 描述', () => {
  it('完整描述研究必填字段与固定操作数元组', () => {
    expect(document(researchGenerationV2Contract.schema)).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      required: [
        'version',
        'conclusion',
        'rationale',
        'claims',
        'numericClaims',
        'invalidationConditions',
        'nextSteps',
        'risks',
        'unknowns',
        'disclaimer',
        'confidence',
      ],
      properties: {
        numericClaims: {
          items: {
            oneOf: [
              expect.objectContaining({ type: 'object' }),
              expect.objectContaining({
                properties: expect.objectContaining({
                  operands: expect.objectContaining({ minItems: 2, maxItems: 2, items: false }),
                }),
              }),
            ],
          },
        },
        confidence: {
          properties: { basis: { type: 'array', minItems: 1 } },
        },
      },
    });
  });

  it('可选元组尾项不被当作必填，固定长度仍保留上界', () => {
    const schema = z.tuple([z.string(), z.number().optional()]);
    expect(schema.safeParse(['ok']).success).toBe(true);
    expect(document(schema)).toMatchObject({
      minItems: 1,
      maxItems: 2,
      items: false,
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('保留 rest 元组语义', () => {
    const schema = z.tuple([z.string()]).rest(z.number());
    expect(schema.safeParse(['ok', 1, 2]).success).toBe(true);
    const output = document(schema);
    expect(output).toMatchObject({ minItems: 1, items: { type: 'number' } });
    expect(output).not.toHaveProperty('maxItems');
  });

  it('研究预估包含完整 Schema，同时保留冻结模板、材料及输入对象', () => {
    const { frozen } = submissionV2Fixture();
    const before = structuredClone(frozen);
    const messages = buildFrozenResearchMessagesV2(frozen);
    expect(messages[0]).toEqual({
      role: 'system',
      content: buildGenerationSchemaPrompt(researchGenerationV2Contract.schema),
    });
    expect(messages[1]).toEqual({ role: 'system', content: frozen.prompt.template });
    expect(messages[2]?.content).toContain('优先使用kind=field');
    expect(messages[2]?.content).toContain('无法精确核验时');
    const user = messages.at(-1);
    expect(user?.role).toBe('user');
    const payload = JSON.parse(String(user?.content).slice('RESEARCH_REQUEST_JSON:'.length)) as {
      materials: unknown[];
      question: string;
    };
    expect(payload.question).toBe(frozen.request.question);
    expect(payload.materials).toHaveLength(frozen.evidence.filter((entry) => entry.usable).length);
    expect(researchInputTokenEstimate(messages)).toBeGreaterThan(
      researchInputTokenEstimate(messages.slice(1)),
    );
    expect(frozen).toEqual(before);
    expect(buildFrozenResearchMessagesV2(frozen)).toEqual(messages);
  });
});
