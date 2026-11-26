import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  journalAiExplanationSchema,
  journalAiFrozenEvidenceSchema,
  journalReviewExplanationRequestSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  type IdentityPrincipal,
} from '@thesis-ledger/schemas';
import { localIdentityPrincipal } from '../identity/local-workspace.js';
import { JournalAiResearchV2 } from './journal-ai-research-v2.js';
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
    private readonly v2: JournalAiResearchV2,
  ) {}
  async start(raw: unknown, principal: IdentityPrincipal) {
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
    const runId = await this.v2.start(principal, {
      scope: { accountId: request.accountId, mode: request.mode },
      question:
        '请核对计划与实际偏差、行为证据与反事实限制，给出中文复盘解读；保留未知，不给买卖指令。',
      prompt: journalReviewPrompt,
      data,
    });
    return this.get(runId, { accountId: request.accountId, mode: request.mode }, principal);
  }
  async get(id: string, raw: unknown, principal: IdentityPrincipal) {
    const scope = journalSnapshotDetailQuerySchema.parse(raw);
    const runId = journalSnapshotIdSchema.parse(id);
    const fresh = await this.v2.read(principal, runId, scope);
    if (fresh) {
      if (!fresh.object || fresh.period) throw notFound();
      const { row, object, result } = fresh;
      return journalAiExplanationSchema.parse({
        id: row.id,
        accountId: scope.accountId,
        mode: scope.mode,
        reviewObjectId: object.reviewObjectId,
        evidenceFingerprint: object.evidenceFingerprint,
        analysisDraft: object.analysisDraft,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        algorithmVersion: object.result.algorithmVersion,
        status: row.status,
        errorCode: row.errorCode,
        errorSummary: row.errorSummary,
        result,
        createdAt: row.createdAt.toISOString(),
      });
    }
    throw notFound();
  }
  async snapshotMetadata(
    id: string,
    input: JournalReviewEvidenceInput,
    algorithmVersion: string,
    principal: IdentityPrincipal | null = localIdentityPrincipal(),
  ) {
    if (!principal) throw notFound();
    const view = await this.get(
      id,
      {
        accountId: input.trade.accountId,
        mode: input.trade.accountMode,
      },
      principal,
    );
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
