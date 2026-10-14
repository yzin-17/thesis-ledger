import { z } from 'zod';
import { aiResearchGenerationSchema } from '@thesis-ledger/schemas';

/** 文本输出也消费实际生成合同，不能依赖模型猜测合同名称。 */
export function researchOutputInstructions() {
  return [
    '请只返回满足以下 JSON Schema 的 JSON 对象，不要 Markdown 或额外文字。',
    'evidence 必须为对象数组；每项 claim 的 citations 仅引用本次 RESEARCH_REQUEST_JSON 中的服务端证据，保留 sourceId、tool、toolCallId。不得创造来源或审计标识。',
    'provider、version、createdAt、context 由服务端补充，不需要生成。',
    `RESEARCH_OUTPUT_JSON_SCHEMA:${JSON.stringify(z.toJSONSchema(aiResearchGenerationSchema))}`,
  ].join('\n');
}
