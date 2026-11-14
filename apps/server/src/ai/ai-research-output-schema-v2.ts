import { researchGenerationV2Schema, type AiFrozenResearchV2 } from '@thesis-ledger/schemas';

/**
 * 反证研究只要求引用可验证事实与说明假设弱点，不需要派生数值。
 * 使用 V2 的收窄子 Schema 同时约束 SDK 出站 JSON Schema 和入站解析；
 * 不修改 V2 公共协议，也不绕过数值证据校验。
 */
const counterEvidenceSchema = researchGenerationV2Schema.safeExtend({
  numericClaims: researchGenerationV2Schema.shape.numericClaims.max(0),
});

export const researchOutputSchemaV2 = (frozen: Pick<AiFrozenResearchV2, 'prompt'>) =>
  frozen.prompt.version === 'research-v2-counter-evidence'
    ? counterEvidenceSchema
    : researchGenerationV2Schema;
