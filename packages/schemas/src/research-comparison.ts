import { z } from 'zod';
import { researchReportSummarySchema, type ResearchReportDetail } from './research-read.js';

export const researchComparisonGroupSchema = z.enum([
  'opinion',
  'evidence',
  'conditions',
  'inputs',
  'model',
]);
const field = z.strictObject({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  status: z.enum(['unchanged', 'text_changed', 'value_changed']),
  before: z.json(),
  after: z.json(),
});

const side = z.strictObject({
  evidenceId: z.uuid(),
  providerId: z.string().nullable(),
  sourceIds: z.array(z.string()),
});
export const researchReportComparisonSchema = z
  .strictObject({
    version: z.literal('research-comparison-v1'),
    selection: z.enum(['default', 'explicit']),
    status: z.enum(['compared', 'incompatible', 'unavailable', 'no_previous', 'search_incomplete']),
    current: researchReportSummarySchema,
    previous: researchReportSummarySchema.nullable(),
    frozenFingerprints: z.strictObject({
      before: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      after: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    }),
    issues: z
      .array(
        z.strictObject({
          code: z.enum([
            'mode',
            'scope',
            'object',
            'accounts',
            'template',
            'legacy_fields_missing',
            'result_unavailable',
            'no_previous',
            'search_incomplete',
            'completion_time_unrecorded',
          ]),
          message: z.string().min(1).max(300),
        }),
      )
      .max(10),
    groups: z
      .array(
        z.strictObject({
          key: researchComparisonGroupSchema,
          label: z.string().min(1).max(120),
          status: z.enum(['unchanged', 'changed', 'unavailable']),
          fields: z.array(field).max(20),
        }),
      )
      .length(5),
    evidence: z
      .array(
        z.strictObject({
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          kind: z.enum(['quote', 'news', 'reference', 'portfolio', 'risk', 'strategy', 'journal']),
          status: z.enum(['added', 'removed', 'unchanged']),
          before: z.array(side).max(1000),
          after: z.array(side).max(1000),
        }),
      )
      .max(2000),
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (value.status === 'compared') {
      if (
        value.current.resultVersion !== 2 ||
        value.previous?.resultVersion !== 2 ||
        value.current.historicalScope.status !== 'known' ||
        value.previous.historicalScope.status !== 'known' ||
        !value.frozenFingerprints.before ||
        !value.frozenFingerprints.after ||
        !value.evidence.length
      )
        reject('字段比较必须具有两端可信 V2 范围、冻结指纹和证据');
    }
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (new Set(value.groups.map((group) => group.key)).size !== 5)
      reject('比较维度必须完整且不重复');
    if (value.status === 'compared') {
      if (
        !value.previous ||
        value.issues.length ||
        value.groups.some((group) => group.status === 'unavailable' || !group.fields.length)
      )
        reject('字段比较必须具有两端资料和完整维度');
    } else if (
      !value.issues.length ||
      value.evidence.length ||
      value.groups.some((group) => group.status !== 'unavailable' || group.fields.length > 0)
    )
      reject('不可比或未完成状态必须说明原因且不能提供字段差异');
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (new Set(value.evidence.map((entry) => entry.fingerprint)).size !== value.evidence.length)
      reject('同一证据指纹不得重复登记');
    for (const entry of value.evidence) {
      if (entry.status === 'added' && (entry.before.length || !entry.after.length))
        reject('新增证据的前后引用不一致');
      if (entry.status === 'removed' && (!entry.before.length || entry.after.length))
        reject('移除证据的前后引用不一致');
      if (entry.status === 'unchanged' && (!entry.before.length || !entry.after.length))
        reject('未变证据必须有两端引用');
    }
  });
export type ResearchReportComparison = z.infer<typeof researchReportComparisonSchema>;
export type ResearchComparisonGroup = z.infer<typeof researchComparisonGroupSchema>;

/** 比较范围的规范身份，不包含会随持仓/行情更新的输入值，也不提供读取授权。 */
export function researchComparisonIdentity(detail: ResearchReportDetail) {
  if (detail.historicalScope.status !== 'known' || !detail.submission) return null;
  const snapshot = detail.historicalScope.snapshot;
  const request = detail.submission;
  let object: Record<string, string | null>;
  let accounts: string[] = [];
  if (snapshot.scope === 'instrument' || snapshot.scope === 'position') {
    const instrument = snapshot.instrument;
    object = {
      instrumentId: instrument.instrumentId.toLowerCase(),
      market: instrument.market,
      assetType: instrument.assetType,
      symbol: instrument.symbol,
      currency: instrument.currency,
    };
    if (snapshot.scope === 'position') accounts = [snapshot.accountId.toLowerCase()];
  } else if (snapshot.scope === 'portfolio') {
    object = { portfolioId: snapshot.portfolioId };
    accounts = snapshot.accountIds.map((id) => id.toLowerCase()).sort();
  } else if (snapshot.scope === 'account') {
    object = { accountId: snapshot.accountId.toLowerCase() };
    accounts = [snapshot.accountId.toLowerCase()];
  } else {
    object = { strategyVersionId: snapshot.strategyVersionId.toLowerCase() };
  }
  let template: { kind: 'preset' | 'question'; value: string };
  if (request.templateId) template = { kind: 'preset', value: request.templateId };
  else template = { kind: 'question', value: request.question };
  return { mode: snapshot.mode, scope: snapshot.scope, object, accounts, template };
}
