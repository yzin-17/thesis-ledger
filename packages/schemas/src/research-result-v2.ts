import { z } from 'zod';
import {
  researchCurrencyV2Schema,
  researchScopeSnapshotV2Schema,
  researchScopeInstrumentsV2,
} from './research-scope-v2.js';
import {
  researchEvidenceBindingV2Schema,
  researchFingerprintV2Schema,
  researchQualityV2Schema,
  researchNumericFieldV2Schema,
} from './research-evidence-v2.js';
import { aiFrozenResearchV2Schema, type AiFrozenResearchV2 } from './ai-frozen-research-v2.js';
import { newsTimeMicrosV3 } from './market-news-v3.js';

const text = z.string().trim().min(1).max(4000);
const id = z.string().min(1).max(80);
const evidenceIds = z
  .array(z.uuid())
  .max(100)
  .refine((values) => new Set(values).size === values.length);
const references = { id, description: text, evidenceIds };
const claims = z.discriminatedUnion('kind', [
  z.strictObject({
    ...references,
    kind: z.literal('price-direction'),
    instrumentId: z.uuid(),
    direction: z.enum(['up', 'down']),
    tradingDays: z.union([z.literal(5), z.literal(20)]),
    evidenceIds: evidenceIds.refine((values) => values.length > 0),
    rationale: text,
  }),
  z.strictObject({ ...references, kind: z.literal('qualitative'), rationale: text }),
]);
const invalidation = z.discriminatedUnion('kind', [
  z.strictObject({
    ...references,
    kind: z.literal('price-threshold'),
    instrumentId: z.uuid(),
    operator: z.enum(['gt', 'gte', 'lt', 'lte']),
    value: z.number().finite().nonnegative(),
    unit: z.literal('price'),
    currency: researchCurrencyV2Schema,
    tradingDays: z.union([z.literal(5), z.literal(20)]),
  }),
  z.strictObject({
    ...references,
    kind: z.literal('qualitative'),
    observation: z.literal('manual'),
  }),
  z.strictObject({ ...references, kind: z.literal('unknown'), reason: text }),
]);
const fieldValue = z.strictObject({
  evidenceId: z.uuid(),
  ...researchNumericFieldV2Schema.shape,
  value: z.number().finite(),
});
const numericClaim = z.discriminatedUnion('kind', [
  z.strictObject({ id, description: text, kind: z.literal('field'), source: fieldValue }),
  z.strictObject({
    id,
    description: text,
    kind: z.literal('derived'),
    operation: z.enum(['add', 'subtract', 'multiply', 'divide', 'percentage_change']),
    operands: z.tuple([fieldValue, fieldValue]),
    value: z.number().finite(),
    unit: z.string().min(1).max(64),
    currency: researchCurrencyV2Schema.nullable(),
    assumptions: z.array(text).max(30),
  }),
]);
const nextStep = z
  .strictObject({
    action: z.enum(['view_evidence', 'update_data', 'compare_reports', 'review_due']),
    description: text,
    evidenceIds,
    claimId: id.nullable(),
  })
  .refine(
    (value) => value.action !== 'view_evidence' || value.evidenceIds.length > 0,
    '查看证据动作必须指定实际证据',
  );

/** 模型只输出推断与引用选择，不得绑定来源、范围、权限、模型或费用。 */
export const researchGenerationV2Schema = z
  .strictObject({
    version: z.literal(2),
    conclusion: text,
    rationale: z.array(text).max(50),
    claims: z.array(claims).max(100),
    numericClaims: z.array(numericClaim).max(100),
    invalidationConditions: z.array(invalidation).max(100),
    nextSteps: z.array(nextStep).max(50),
    risks: z.array(text).max(50),
    unknowns: z.array(text).max(50),
    disclaimer: text,
    confidence: z.strictObject({
      level: z.enum(['low', 'medium', 'high', 'unassessed']),
      basis: z.array(text).min(1).max(30),
    }),
  })
  .superRefine((value, context) => {
    const claimIds = new Set(value.claims.map((claim) => claim.id));
    if (
      claimIds.size !== value.claims.length ||
      new Set(value.numericClaims.map((claim) => claim.id)).size !== value.numericClaims.length ||
      new Set(value.invalidationConditions.map((condition) => condition.id)).size !==
        value.invalidationConditions.length
    )
      context.addIssue({ code: 'custom', message: '研究断言或条件身份重复' });
    for (const step of value.nextSteps) {
      if (step.claimId !== null && !claimIds.has(step.claimId))
        context.addIssue({ code: 'custom', message: '研究动作引用不存在的断言' });
    }
  });
export const researchGenerationV2Contract = {
  ref: { id: 'research', version: 'research-generation-v2' },
  schema: researchGenerationV2Schema,
} as const;
const resultShape = z.strictObject({
  version: z.literal(2),
  inputFingerprint: researchFingerprintV2Schema,
  scopeSnapshot: researchScopeSnapshotV2Schema,
  createdAt: z.iso.datetime({ offset: true }),
  dataCutoffAt: z.iso.datetime({ offset: true }),
  promptVersion: z.string().min(1).max(128),
  model: z.strictObject({
    providerId: z.string().min(1).max(128),
    modelId: z.string().min(1).max(256),
    researchSettingsRevision: z.string().min(1).max(120),
  }),
  inference: researchGenerationV2Schema,
  evidenceBindings: z.array(researchEvidenceBindingV2Schema).min(1).max(1000),
  quality: researchQualityV2Schema,
});
type Result = z.infer<typeof resultShape>;

function referencedEvidenceIds(inference: Result['inference']) {
  return [
    ...inference.claims.flatMap((claim) => claim.evidenceIds),
    ...inference.invalidationConditions.flatMap((condition) => condition.evidenceIds),
    ...inference.nextSteps.flatMap((step) => step.evidenceIds),
    ...inference.numericClaims.flatMap((claim) =>
      claim.kind === 'field'
        ? [claim.source.evidenceId]
        : claim.operands.map((operand) => operand.evidenceId),
    ),
  ];
}
function validateScopeReferences(value: Result, reject: (message: string) => void) {
  const instruments = researchScopeInstrumentsV2(value.scopeSnapshot);
  const byId = new Map(instruments.map((instrument) => [instrument.instrumentId, instrument]));
  for (const claim of value.inference.claims) {
    if (claim.kind === 'price-direction' && !byId.has(claim.instrumentId))
      reject('价格断言必须属于冻结研究范围');
  }
  for (const condition of value.inference.invalidationConditions) {
    if (condition.kind !== 'price-threshold') continue;
    if (byId.get(condition.instrumentId)?.currency !== condition.currency)
      reject('价格条件的标的或币种与冻结范围不一致');
  }
}
export const researchResultV2Schema = resultShape.superRefine((value, context) => {
  const reject = (message: string) => context.addIssue({ code: 'custom', message });
  const ids = new Set(value.evidenceBindings.map((binding) => binding.audit.evidenceId));
  if (ids.size !== value.evidenceBindings.length) reject('成功引用身份重复');
  if (referencedEvidenceIds(value.inference).some((reference) => !ids.has(reference)))
    reject('模型引用了本次成功证据集以外的资料');
  validateScopeReferences(value, reject);
  const created = newsTimeMicrosV3(value.createdAt);
  const cutoff = newsTimeMicrosV3(value.dataCutoffAt);
  if (created === null || cutoff === null || cutoff > created)
    reject('产物时间和数据截止时间不一致');
});
export type ResearchResultV2 = z.infer<typeof researchResultV2Schema>;
export type ResearchGenerationV2 = z.infer<typeof researchGenerationV2Schema>;

/** 服务端保存前的关联合同；字段取值和派生运算仍须 T6 对照冻结数据核验。 */
export function correlateResearchResultV2(
  frozenInput: AiFrozenResearchV2,
  raw: unknown,
  ownedToolCallIds: readonly string[],
) {
  const frozen = aiFrozenResearchV2Schema.parse(frozenInput);
  const result = researchResultV2Schema.parse(raw);
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  if (
    result.inputFingerprint !== frozen.inputFingerprint ||
    result.dataCutoffAt !== frozen.dataCutoffAt ||
    result.promptVersion !== frozen.prompt.version ||
    result.model.researchSettingsRevision !== frozen.researchSettingsRevision ||
    !same(result.scopeSnapshot, frozen.scopeSnapshot) ||
    !same(result.quality, frozen.quality)
  )
    throw new Error('研究产物与冻结范围、版本或质量不一致');
  const prepared = newsTimeMicrosV3(frozen.preparedAt);
  const created = newsTimeMicrosV3(result.createdAt);
  if (prepared === null || created === null || created < prepared)
    throw new Error('研究产物早于准备完成时间');
  const available = new Map(
    frozen.evidence
      .filter((entry) => entry.usable)
      .map((entry) => [entry.audit.evidenceId, entry.audit]),
  );
  const owned = new Set(ownedToolCallIds);
  for (const binding of result.evidenceBindings) {
    if (!owned.has(binding.toolCallId)) throw new Error('研究引用了不属于当前任务的 Tool 调用');
    if (!same(available.get(binding.audit.evidenceId), binding.audit))
      throw new Error('研究引用没有绑定本次可用冻结证据的来源审计');
  }
  return result;
}
