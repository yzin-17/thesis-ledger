import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  aiResearchContextSchema,
  journalAiExplanationSchema,
  journalAiFrozenEvidenceSchema,
  journalReviewExplanationRequestSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  researchResultSchema,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiResearchExecutor } from '../ai/ai-research.executor.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { journalReviewObjectFacts, journalReviewDraftKey } from './journal-review-evidence.js';
import { journalAiSnapshotMetadataSchema } from '@thesis-ledger/schemas';
import type { JournalReviewEvidenceInput } from '@thesis-ledger/schemas';
import { journalReviewPrompt } from './journal-review-prompt.js';

const notFound = () =>
  new NotFoundException({
    errorCode: 'JOURNAL_AI_NOT_FOUND',
    message: '复盘解读不存在或不属于当前账户模式',
  });
@Injectable()
export class JournalReviewAi {
  constructor(
    private readonly analysis: JournalReviewAnalysis,
    private readonly runs: AiRunService,
    private readonly executor: AiResearchExecutor,
  ) {}
  async start(raw: unknown) {
    const request = journalReviewExplanationRequestSchema.parse(raw);
    const analyzed = await this.analysis.analyze(request);
    const input = analyzed.candidate.input;
    const data = journalAiFrozenEvidenceSchema.parse({
      version: 'journal-review-ai-v1',
      accountId: request.accountId,
      mode: request.mode,
      reviewObjectId: input.reference.reviewObjectId,
      evidenceFingerprint: input.projection.evidenceFingerprint,
      analysisDraft: input.analysisDraft,
      facts: journalReviewObjectFacts(input),
      result: analyzed.result,
    });
    const run = await this.runs.startResearch(
      {
        question:
          '请核对计划与实际偏差、行为证据与反事实限制，给出中文复盘解读；保留未知，不给买卖指令。',
        context: { scope: 'account', accountId: request.accountId },
      },
      {
        version: 'frozen-research-v1',
        prompt: journalReviewPrompt,
        source: {
          tool: 'getJournalReview',
          permission: 'journal:read',
          evidence: {
            sourceId: `journal:${input.reference.reviewObjectId}:${input.projection.evidenceFingerprint}`,
            provider: 'thesis-ledger',
            fetchedAt: new Date().toISOString(),
            data,
          },
        },
      },
    );
    this.executor.dispatch(run.id);
    return this.get(run.id, { accountId: request.accountId, mode: request.mode });
  }
  async get(id: string, raw: unknown) {
    const scope = journalSnapshotDetailQuerySchema.parse(raw);
    const run = await this.runs.resume(journalSnapshotIdSchema.parse(id));
    if (!run) throw notFound();
    let frozen;
    try {
      frozen = await this.runs.frozenEvidence(run.id);
    } catch {
      throw notFound();
    }
    const evidence = journalAiFrozenEvidenceSchema.safeParse(frozen?.source.evidence.data);
    const context = aiResearchContextSchema.safeParse(run.context);
    if (
      !evidence.success ||
      !context.success ||
      context.data.scope !== 'account' ||
      context.data.accountId !== scope.accountId ||
      evidence.data.accountId !== scope.accountId ||
      evidence.data.mode !== scope.mode ||
      frozen?.source.tool !== 'getJournalReview' ||
      frozen.source.permission !== 'journal:read' ||
      frozen.prompt.version !== run.promptVersion
    )
      throw notFound();
    const result = researchResultSchema.safeParse(run.result);
    return journalAiExplanationSchema.parse({
      id: run.id,
      accountId: scope.accountId,
      mode: scope.mode,
      reviewObjectId: evidence.data.reviewObjectId,
      evidenceFingerprint: evidence.data.evidenceFingerprint,
      analysisDraft: evidence.data.analysisDraft,
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
      algorithmVersion: evidence.data.result.algorithmVersion,
      status: run.status,
      errorCode: run.errorCode,
      errorSummary: run.errorSummary,
      result: result.success ? result.data : null,
      createdAt: run.createdAt.toISOString(),
    });
  }
  async snapshotMetadata(id: string, input: JournalReviewEvidenceInput, algorithmVersion: string) {
    const view = await this.get(id, {
      accountId: input.trade.accountId,
      mode: input.trade.accountMode,
    });
    if (
      view.reviewObjectId !== input.reference.reviewObjectId ||
      view.evidenceFingerprint !== input.projection.evidenceFingerprint ||
      journalReviewDraftKey(view.analysisDraft) !== journalReviewDraftKey(input.analysisDraft) ||
      view.algorithmVersion !== algorithmVersion
    )
      throw new ConflictException({
        errorCode: 'JOURNAL_AI_CONTEXT_CHANGED',
        message: 'AI 解读与本次事实或草稿不一致，请重新分析后选择对应任务',
      });
    return journalAiSnapshotMetadataSchema.parse({
      id: view.id,
      provider: view.provider,
      model: view.model,
      promptVersion: view.promptVersion,
      status: view.status,
    });
  }
}
