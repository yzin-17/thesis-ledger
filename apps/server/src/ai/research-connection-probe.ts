import {
  researchGenerationV2Contract,
  type AiGenerationContractRef,
} from '@thesis-ledger/schemas';

/** 格式探针无研究材料；用原合同校验样例，覆盖JSON Schema未表达的引用约束。 */
export function researchConnectionProbe(reference: AiGenerationContractRef) {
  if (reference.id !== 'research' || reference.version !== 'research-generation-v2') return null;
  return researchGenerationV2Contract.schema.parse({
    version: 2,
    conclusion: '本次仅验证研究输出格式。',
    rationale: ['未提供研究材料，不能形成研究断言。'],
    claims: [],
    numericClaims: [],
    invalidationConditions: [],
    nextSteps: [
      {
        action: 'review_due',
        description: '取得实际材料后再进行研究。',
        evidenceIds: [],
        claimId: null,
      },
    ],
    risks: ['格式验证不能替代正式研究验收。'],
    unknowns: ['尚无实际研究材料。'],
    disclaimer: '本次为格式验证，不构成投资建议。',
    confidence: { level: 'unassessed', basis: ['未执行实际研究。'] },
  });
}
