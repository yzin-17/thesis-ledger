import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import {
  buildGenerationSchemaPrompt,
  assertGenerationSchemaPrompt,
} from '../../src/ai/ai-generation-schema-prompt.js';
import { buildFrozenResearchMessagesV2 } from '../../src/ai/ai-research-messages-v2.js';
import { researchOutputSchemaV2 } from '../../src/ai/ai-research-output-schema-v2.js';
import { researchInputTokenEstimate } from '../../src/ai/ai-research-sdk-reservation.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

const document = (schema: z.ZodType): unknown => {
  const prompt = buildGenerationSchemaPrompt(schema);
  const marker = 'OUTPUT_JSON_SCHEMA:';
  return JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as unknown;
};

describe('预算前的生成 Schema 描述', () => {
  it('缺失或过期的字段指令被拒绝，消息原文不变', () => {
    const schema = z.object({ amount: z.string(), currency: z.string() }).strict();
    const missing = [{ role: 'system', content: '只输出JSON' }];
    const stale = [
      {
        role: 'system',
        content: buildGenerationSchemaPrompt(z.object({ amount: z.string() }).strict()),
      },
    ];
    for (const messages of [missing, stale]) {
      const before = structuredClone(messages);
      expect(() => assertGenerationSchemaPrompt(schema, messages)).toThrow('缺少当前输出合同');
      expect(messages).toEqual(before);
    }
    const current = [{ role: 'system', content: buildGenerationSchemaPrompt(schema) }];
    expect(() => assertGenerationSchemaPrompt(schema, current)).not.toThrow();
    const reused = z.object({ amount: z.string() });
    const repeated = z.object({ left: reused, right: reused });
    const compact = [{ role: 'system', content: buildGenerationSchemaPrompt(repeated, 'ref') }];
    expect(compact[0]!.content).toContain('$defs');
    expect(() => assertGenerationSchemaPrompt(repeated, compact)).not.toThrow();
    expect(() => assertGenerationSchemaPrompt(schema, compact)).toThrow('缺少当前输出合同');
  });
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

  it('明确限制派生数值的单位、币种和精确运算，并优先直接引用', () => {
    const { frozen } = submissionV2Fixture();
    const message = buildFrozenResearchMessagesV2(frozen)[2]!.content;
    expect(message).toContain('add/subtract：两个操作数的 unit 和 currency 必须完全相同');
    expect(message).toContain('multiply：至少一个操作数');
    expect(message).toContain('divide：两操作数的 unit、currency 相同');
    expect(message).toContain('percentage_change：两操作数的 unit、currency 必须相同');
    expect(message).toContain('unit=ratio、currency=null');
    expect(message).toContain('7% 应写 value=0.07');
    expect(message).toContain('numericClaims 不要生成 kind=derived');
  });

  it('反证研究不要求派生数值，但普通研究保留有证据的派生能力', () => {
    const { frozen } = submissionV2Fixture();
    const counter = {
      ...frozen,
      prompt: { ...frozen.prompt, version: 'research-v2-counter-evidence' },
    };
    const normal = {
      ...frozen,
      prompt: { ...frozen.prompt, version: 'research-v2-primary-risks' },
    };
    expect(buildFrozenResearchMessagesV2(counter)[2]!.content).toContain(
      'numericClaims 必须为空数组 []，不得生成 kind=field 或 kind=derived',
    );
    expect(document(researchOutputSchemaV2(counter))).toHaveProperty(
      'properties.numericClaims.maxItems',
      0,
    );
    expect(researchOutputSchemaV2(counter).shape.numericClaims.safeParse([]).success).toBe(true);
    expect(researchOutputSchemaV2(counter).shape.numericClaims.safeParse([{}]).success).toBe(false);
    expect(buildFrozenResearchMessagesV2(normal)[2]!.content).not.toContain('当前是反证研究任务');
    expect(document(researchOutputSchemaV2(normal))).toHaveProperty(
      'properties.numericClaims.maxItems',
      100,
    );
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
    expect(messages[2]?.content).toContain('优先使用 kind=field');
    expect(messages[2]?.content).toContain('不完全确定时仅引用原始 kind=field');
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
