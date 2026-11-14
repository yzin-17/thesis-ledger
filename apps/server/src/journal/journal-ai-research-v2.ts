import { createHash, randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import {
  journalAiFrozenEvidenceSchema,
  journalPeriodAiFrozenEvidenceSchema,
  type ResearchResultV2,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiResearchExecutor } from '../ai/ai-research.executor.js';
import { AiResearchReportsQuery } from '../ai/ai-research-reports.query.js';
import { AiRoutingSettingsService } from '../ai/ai-routing-settings.service.js';
import { sealAiFrozenResearchV2 } from '../ai/ai-research-frozen-integrity-v2.js';
import { ResearchScopePermissions } from '../research/research-scope-permissions.js';
import { journalResearchNumericFields } from './journal-research-numeric-fields.js';

type JournalData =
  | ReturnType<typeof journalAiFrozenEvidenceSchema.parse>
  | ReturnType<typeof journalPeriodAiFrozenEvidenceSchema.parse>;
type Prompt = { version: string; template: string };
type JournalScope = { accountId: string; mode: 'actual' | 'shadow' };

const access = new ResearchScopePermissions();
const journalNotFound = () =>
  new NotFoundException({
    errorCode: 'JOURNAL_AI_NOT_FOUND',
    message: '复盘解读不存在或不属于当前账户模式',
  });

/** 两种 Journal 解释复用同一套已冻结的 V2 研究执行；不替换或重写既有 V1 任务。 */
@Injectable()
export class JournalAiResearchV2 {
  constructor(
    private readonly runs: AiRunService,
    private readonly executor: AiResearchExecutor,
    private readonly routing: AiRoutingSettingsService,
    private readonly reports: AiResearchReportsQuery,
  ) {}

  async start(
    principal: IdentityPrincipal,
    input: {
      scope: JournalScope;
      question: string;
      prompt: Prompt;
      data: JournalData;
    },
  ) {
    const { scope, question, prompt } = input;
    const checked =
      input.data.version === 'journal-review-ai-v1'
        ? journalAiFrozenEvidenceSchema.parse(input.data)
        : journalPeriodAiFrozenEvidenceSchema.parse(input.data);
    const sourceScope =
      checked.version === 'journal-review-ai-v1'
        ? { accountId: checked.accountId, mode: checked.mode }
        : { accountId: checked.request.accountId, mode: checked.request.mode };
    if (sourceScope.accountId !== scope.accountId || sourceScope.mode !== scope.mode)
      throw journalNotFound();

    const revision = (await this.routing.read()).revision;
    await this.runs.researchV2Default(revision);
    const now = new Date().toISOString();
    const data = JSON.parse(JSON.stringify(checked)) as JournalData;
    const frozen = sealAiFrozenResearchV2({
      version: 'frozen-research-v2',
      resultVersion: 2,
      request: {
        version: 2,
        submissionId: randomUUID(),
        mode: scope.mode,
        scope: { scope: 'account', accountId: scope.accountId },
        question,
        researchSettingsRevision: revision,
      },
      scopeSnapshot: {
        version: 'research-scope-v2',
        scope: 'account',
        accountId: scope.accountId,
        mode: scope.mode,
        instruments: [],
        confirmedAt: now,
      },
      prompt,
      researchSettingsRevision: revision,
      preparedAt: now,
      dataCutoffAt: now,
      inputFingerprint: '0'.repeat(64),
      evidence: [
        {
          audit: {
            evidenceId: randomUUID(),
            fingerprint: '0'.repeat(64),
            kind: 'journal',
            providerId: 'thesis-ledger',
            upstreamSource: 'journal-deterministic-analysis',
            contractVersion: checked.version,
            policyRevision: null,
            routeRevision: null,
            credentialRevision: null,
            sourceIds: [
              'journal:' + createHash('sha256').update(JSON.stringify(data)).digest('hex'),
            ],
            sourceUrls: [],
            publishedAt: null,
            availableAt: null,
            fetchedAt: now,
          },
          required: true,
          usable: true,
          status: 'available',
          data,
          numericFields: journalResearchNumericFields(data),
          reasons: [],
        },
      ],
      quality: { status: 'complete', reasons: [] },
    });
    const created = await this.runs.startResearchV2(principal.id, frozen, access);
    if (!created.reused) this.executor.dispatch(created.run.id);
    return created.run.id;
  }

  /** 只读取匹配身份、账户、模式且通过 V2 审计验证的 Journal 冻结结果。 */
  async read(principal: IdentityPrincipal, id: string, scope: JournalScope) {
    let report;
    try {
      report = await this.reports.journalDetail(principal.id, id, scope, access);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
    const { row, frozen, detail } = report;
    const source = frozen?.evidence.find(
      (entry) =>
        entry.audit.kind === 'journal' &&
        entry.usable &&
        entry.audit.providerId === 'thesis-ledger',
    );
    if (!source || frozen?.prompt.version !== row.promptVersion) throw journalNotFound();
    const object = journalAiFrozenEvidenceSchema.safeParse(source.data);
    const period = journalPeriodAiFrozenEvidenceSchema.safeParse(source.data);
    let sourceScope: { accountId: string; mode: 'actual' | 'shadow' } | null = null;
    if (object.success) sourceScope = { accountId: object.data.accountId, mode: object.data.mode };
    else if (period.success)
      sourceScope = { accountId: period.data.request.accountId, mode: period.data.request.mode };
    if (sourceScope?.accountId !== scope.accountId || sourceScope.mode !== scope.mode)
      throw journalNotFound();
    const result: ResearchResultV2 | null =
      detail.availability === 'available' && detail.result?.version === 2 ? detail.result : null;
    return {
      row,
      result,
      object: object.success ? object.data : null,
      period: period.success ? period.data : null,
    };
  }
}
