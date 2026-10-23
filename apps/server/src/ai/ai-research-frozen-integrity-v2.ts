import { createHash } from 'node:crypto';
import {
  aiFrozenResearchV2Schema,
  type AiFrozenResearchV2,
  type ResearchFrozenEvidenceV2,
} from '@thesis-ledger/schemas';
import { AiFrozenResearchError } from './ai-frozen-research.js';
import { qualifyFrozenResearchEvidenceV2 } from './ai-research-evidence-quality-v2.js';

/** 冻结协议按 UTF-16 键序编码；省略 JSON 不保存的 undefined 对象字段。 */
function researchJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(researchJson).join(',')}]`;
  const data = value as Record<string, unknown>;
  return `{${Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${researchJson(data[key])}`)
    .join(',')}}`;
}
const fingerprint = (value: unknown) =>
  createHash('sha256').update(researchJson(value)).digest('hex');

function evidenceFingerprint(value: ResearchFrozenEvidenceV2) {
  const audit = Object.fromEntries(
    Object.entries(value.audit).filter(([key]) => !['evidenceId', 'fingerprint'].includes(key)),
  );
  return fingerprint({
    version: 'research-evidence-fingerprint-v2',
    audit,
    required: value.required,
    usable: value.usable,
    status: value.status,
    data: value.data,
    numericFields: value.numericFields,
    reasons: value.reasons,
  });
}
function inputFingerprint(value: AiFrozenResearchV2) {
  const input = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'inputFingerprint'),
  );
  return fingerprint({ protocol: 'research-input-fingerprint-v2', input });
}

/** 只供服务端证据生产者调用；计算摘要不提供来源资格或调用授权。 */
export function sealAiFrozenResearchV2(value: unknown): AiFrozenResearchV2 {
  const frozen = aiFrozenResearchV2Schema.parse(structuredClone(value));
  for (const entry of frozen.evidence) entry.audit.fingerprint = evidenceFingerprint(entry);
  frozen.inputFingerprint = inputFingerprint(frozen);
  return frozen;
}

/** 执行端只核验，不替损坏的历史包重算并覆盖指纹。 */
export function verifyAiFrozenResearchV2(value: unknown): AiFrozenResearchV2 {
  const parsed = aiFrozenResearchV2Schema.safeParse(value);
  if (!parsed.success) throw new AiFrozenResearchError('V2 冻结材料合同无效');
  const frozen = parsed.data;
  if (frozen.evidence.some((entry) => entry.audit.fingerprint !== evidenceFingerprint(entry)))
    throw new AiFrozenResearchError('V2 冻结证据内容或来源指纹不一致');
  if (frozen.inputFingerprint !== inputFingerprint(frozen))
    throw new AiFrozenResearchError('V2 冻结输入指纹不一致');
  if (
    frozen.evidence.some(
      (entry) => entry.usable && qualifyFrozenResearchEvidenceV2(entry) !== 'usable',
    )
  )
    throw new AiFrozenResearchError('V2 冻结证据声明可用但缺少合格的实际材料');
  return frozen;
}
