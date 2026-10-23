import { z } from 'zod';
import { researchPrivateMaterialMatchesScopeV2 } from './research-private-material-v2.js';
import { newsTimeMicrosV3 } from './market-news-v3.js';
import {
  researchScopeSnapshotV2Schema,
  researchSubmissionV2Schema,
  researchScopeMatchesSubmissionV2,
} from './research-scope-v2.js';
import {
  researchFingerprintV2Schema,
  researchFrozenEvidenceV2Schema,
  researchQualityV2Schema,
} from './research-evidence-v2.js';

/** Ai 所有的冻结输入序列化；与 frozen-research-v1 分开解析。 */
export const aiFrozenResearchV2Schema = z
  .strictObject({
    version: z.literal('frozen-research-v2'),
    resultVersion: z.literal(2),
    request: researchSubmissionV2Schema,
    scopeSnapshot: researchScopeSnapshotV2Schema,
    prompt: z.strictObject({
      version: z.string().min(1).max(128),
      template: z.string().min(1).max(100_000),
    }),
    researchSettingsRevision: z.string().min(1).max(120),
    preparedAt: z.iso.datetime({ offset: true }),
    dataCutoffAt: z.iso.datetime({ offset: true }),
    inputFingerprint: researchFingerprintV2Schema,
    evidence: z.array(researchFrozenEvidenceV2Schema).min(1).max(1000),
    quality: researchQualityV2Schema,
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (
      !researchScopeMatchesSubmissionV2(value.request, value.scopeSnapshot) ||
      value.request.researchSettingsRevision !== value.researchSettingsRevision
    )
      reject('冻结提交与服务端范围或研究设置修订不一致');
    const prepared = newsTimeMicrosV3(value.preparedAt);
    const cutoff = newsTimeMicrosV3(value.dataCutoffAt);
    const confirmed = newsTimeMicrosV3(value.scopeSnapshot.confirmedAt);
    if (
      prepared === null ||
      cutoff === null ||
      confirmed === null ||
      cutoff > prepared ||
      confirmed > prepared
    )
      reject('冻结确认/截止时间必须有效且不晚于准备完成时间');
    if (
      new Set(value.evidence.map((entry) => entry.audit.evidenceId)).size !== value.evidence.length
    )
      reject('冻结证据身份重复');
    if (!value.evidence.some((entry) => entry.usable)) reject('没有可用证据时不能形成执行输入');
    for (const entry of value.evidence) {
      if (entry.usable && (entry.audit.kind === 'portfolio' || entry.audit.kind === 'strategy') && !researchPrivateMaterialMatchesScopeV2(entry.data, value.scopeSnapshot, entry.audit.kind)) reject('私人证据与冻结的账户、持仓或策略范围不一致');
      if (entry.required && !entry.usable) reject('必需证据不可用时不能形成执行输入');
      if (entry.usable && cutoff !== null) validateEvidenceClock(entry.audit, cutoff, reject);
      if (
        value.scopeSnapshot.scope === 'instrument' &&
        ['portfolio', 'risk', 'strategy', 'journal'].includes(entry.audit.kind)
      )
        reject('独立标的冻结包不能隐式附带私人研究材料');
    }
    const incomplete = value.evidence.some(
      (entry) => entry.status !== 'available' || !entry.usable || entry.reasons.length > 0,
    );
    if (incomplete && value.quality.status !== 'partial') reject('冻结质量不能掩盖不完整证据');
  });
type Audit = z.infer<typeof researchFrozenEvidenceV2Schema>['audit'];
function validateEvidenceClock(audit: Audit, cutoff: bigint, reject: (message: string) => void) {
  for (const name of ['publishedAt', 'availableAt', 'fetchedAt'] as const) {
    const raw = audit[name];
    if (raw === null) continue;
    const instant = newsTimeMicrosV3(raw);
    if (instant === null || instant > cutoff) reject('可引用证据的已知时间不能晚于冻结截止时间');
  }
}
export type AiFrozenResearchV2 = z.infer<typeof aiFrozenResearchV2Schema>;
