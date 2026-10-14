import { describe, expect, it } from 'vitest';
import { aiResearchGenerationSchema } from '@thesis-ledger/schemas';
import { researchOutputInstructions } from '../../src/ai/ai-research-output-prompt.js';

describe('研究生成字段的提示合同', () => {
  it('实际 Schema 进入文本消息，明确对象证据与必填根字段', () => {
    const instructions = researchOutputInstructions();
    const schema = JSON.parse(instructions.split('RESEARCH_OUTPUT_JSON_SCHEMA:')[1]!);
    expect(schema.required).toEqual(
      expect.arrayContaining(['conclusion', 'evidence', 'risks', 'unknowns', 'disclaimer']),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.evidence.items.type).toBe('object');
    expect(schema.properties.evidence.items.required).toEqual(['claim', 'citations']);
    expect(schema.properties.evidence.items.properties.citations.minItems).toBe(1);
    expect(instructions).toContain('不得创造来源或审计标识');
  });
  it('模型合同不要求服务端元数据，旧实际失败仍被拒绝', () => {
    const schema = JSON.parse(
      researchOutputInstructions().split('RESEARCH_OUTPUT_JSON_SCHEMA:')[1]!,
    );
    for (const key of ['provider', 'version', 'createdAt', 'context'])
      expect(schema.properties).not.toHaveProperty(key);
    expect(
      aiResearchGenerationSchema.safeParse({ summary: '已有 JSON', evidence: ['字符串证据'] })
        .success,
    ).toBe(false);
    expect(
      aiResearchGenerationSchema.safeParse({
        conclusion: '受控事实解读',
        evidence: [
          {
            claim: '受控证据',
            citations: [{ sourceId: 'fixture:source', tool: 'getJournalReview' }],
          },
        ],
        risks: [],
        unknowns: [],
        disclaimer: '受控测试',
      }).success,
    ).toBe(true);
  });
});
