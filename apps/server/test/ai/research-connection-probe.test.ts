import { describe, expect, it } from 'vitest';
import { aiGenerationContracts, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { probeMessages } from '../../src/ai/provider-connection-test.js';
import { researchConnectionProbe } from '../../src/ai/research-connection-probe.js';

describe('研究V2用途格式探针', () => {
  it('生成原合同合法的无材料实例并明确要求原样返回', () => {
    const example = researchConnectionProbe(researchGenerationV2Contract.ref);
    expect(researchGenerationV2Contract.schema.safeParse(example).success).toBe(true);
    expect(example?.claims).toEqual([]);
    expect(example?.numericClaims).toEqual([]);
    expect(example?.nextSteps[0]).toMatchObject({ action: 'review_due', claimId: null });
    const messages = probeMessages('research', researchGenerationV2Contract.ref);
    expect(messages[0]!.content).toContain('不增加、删减或修改字段');
    expect(messages[1]!.content).toContain(JSON.stringify(example));
  });

  it('准确区分研究V1及其他用途，不改变已有探针', () => {
    expect(researchConnectionProbe(aiGenerationContracts.research.ref)).toBeNull();
    expect(researchConnectionProbe(aiGenerationContracts.parameterOptimization.ref)).toBeNull();
    expect(probeMessages('research')[1]!.content).toContain('最小可用实例');
  });

  it('仍拒绝真实失败中没有实际证据的查看动作', () => {
    const example = researchConnectionProbe(researchGenerationV2Contract.ref)!;
    const invalid = {
      ...example,
      nextSteps: [{ action: 'view_evidence', description: '查看', evidenceIds: [], claimId: null }],
    };
    const result = researchGenerationV2Contract.schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ message: '查看证据动作必须指定实际证据' }),
      );
  });
});
