import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  journalPeriodAiExplanationSchema,
  journalPeriodAiFrozenEvidenceSchema,
  journalPeriodExplanationRequestSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  type IdentityPrincipal,
} from '@thesis-ledger/schemas';
import { JournalAiResearchV2 } from './journal-ai-research-v2.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { journalReviewObjectFacts } from './journal-review-evidence.js';
import { journalPeriodReviewPrompt } from './journal-review-prompt.js';

@Injectable()
export class JournalPeriodReviewAi {
  constructor(
    private readonly analysis: JournalReviewAnalysis,
    private readonly v2: JournalAiResearchV2,
  ) {}
  async start(raw: unknown, principal: IdentityPrincipal) {
    const request = journalPeriodExplanationRequestSchema.parse(raw);
    const {
      expectedLedgerRevision,
      expectedProjectionGeneration,
      expectedAlgorithmVersion,
      objectFingerprints,
      ...scope
    } = request;
    const analyzed = await this.analysis.period(scope);
    const current = Object.fromEntries(
      analyzed.candidates.map((row) => [
        row.input.reference.reviewObjectId,
        row.input.projection.evidenceFingerprint,
      ]),
    );
    const ids = Object.keys(current);
    if (
      expectedLedgerRevision !== analyzed.ledgerRevision ||
      expectedProjectionGeneration !== analyzed.projectionGeneration ||
      ids.length !== Object.keys(objectFingerprints).length ||
      ids.some((id) => current[id] !== objectFingerprints[id])
    )
      throw new ConflictException({
        errorCode: 'JOURNAL_EVIDENCE_CHANGED',
        message: '周期复盘证据已变化，请重新统计后提交解读',
      });
    if (expectedAlgorithmVersion !== analyzed.result.algorithmVersion)
      throw new ConflictException({
        errorCode: 'JOURNAL_ALGORITHM_CHANGED',
        message: '复盘算法版本已变化，请重新统计',
      });
    const data = journalPeriodAiFrozenEvidenceSchema.parse({
      version: 'journal-period-ai-v1',
      request,
      facts: analyzed.candidates.map((row) => journalReviewObjectFacts(row.input)),
      result: analyzed.result,
    });
    const runId = await this.v2.start(principal, {
      scope: { accountId: request.accountId, mode: request.mode },
      question:
        '请分别解读完整交易周期与减仓片段的统计结果、排除原因和未知证据，输出中文复盘，不给买卖指令。',
      prompt: journalPeriodReviewPrompt,
      data,
    });
    return this.get(runId, { accountId: request.accountId, mode: request.mode }, principal);
  }
  async get(id: string, raw: unknown, principal: IdentityPrincipal) {
    const scope = journalSnapshotDetailQuerySchema.parse(raw);
    const runId = journalSnapshotIdSchema.parse(id);
    const fresh = await this.v2.read(principal, runId, scope);
    const notFound = () =>
      new NotFoundException({
        errorCode: 'JOURNAL_AI_NOT_FOUND',
        message: '周期解读不存在或不属于当前账户模式',
      });
    if (fresh) {
      if (!fresh.period || fresh.object) throw notFound();
      const { row, period, result } = fresh;
      const request = period.request;
      return journalPeriodAiExplanationSchema.parse({
        id: row.id,
        ...scope,
        symbol: request.symbol ?? null,
        start: request.start,
        end: request.end,
        ledgerRevision: request.expectedLedgerRevision,
        projectionGeneration: request.expectedProjectionGeneration,
        objectFingerprints: request.objectFingerprints,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        algorithmVersion: period.result.algorithmVersion,
        status: row.status,
        errorCode: row.errorCode,
        errorSummary: row.errorSummary,
        result,
        createdAt: row.createdAt.toISOString(),
      });
    }
    throw notFound();
  }
}
