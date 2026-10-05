import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  aiResearchContextSchema,
  journalPeriodAiExplanationSchema,
  journalPeriodAiFrozenEvidenceSchema,
  journalPeriodExplanationRequestSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  researchResultSchema,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../ai/ai-run.service.js';
import { AiResearchExecutor } from '../ai/ai-research.executor.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { journalReviewObjectFacts } from './journal-review-evidence.js';
import { journalPeriodReviewPrompt } from './journal-review-prompt.js';

@Injectable()
export class JournalPeriodReviewAi {
  constructor(
    private readonly analysis: JournalReviewAnalysis,
    private readonly runs: AiRunService,
    private readonly executor: AiResearchExecutor,
  ) {}
  async start(raw: unknown) {
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
    const run = await this.runs.startResearch(
      {
        question:
          '请分别解读完整交易周期与减仓片段的统计结果、排除原因和未知证据，输出中文复盘，不给买卖指令。',
        context: { scope: 'account', accountId: request.accountId },
      },
      {
        version: 'frozen-research-v1',
        prompt: journalPeriodReviewPrompt,
        source: {
          tool: 'getJournalPeriodReview',
          permission: 'journal:read',
          evidence: {
            sourceId: `journal-period:${request.accountId}:${request.mode}:${request.start}:${request.end}:${analyzed.ledgerRevision}:${analyzed.projectionGeneration}`,
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
    const notFound = () =>
      new NotFoundException({
        errorCode: 'JOURNAL_AI_NOT_FOUND',
        message: '周期解读不存在或不属于当前账户模式',
      });
    if (!run) throw notFound();
    let frozen;
    try {
      frozen = await this.runs.frozenEvidence(run.id);
    } catch {
      throw notFound();
    }
    const parsed = journalPeriodAiFrozenEvidenceSchema.safeParse(frozen?.source.evidence.data);
    const context = aiResearchContextSchema.safeParse(run.context);
    if (
      !parsed.success ||
      !context.success ||
      context.data.scope !== 'account' ||
      context.data.accountId !== scope.accountId ||
      parsed.data.request.accountId !== scope.accountId ||
      parsed.data.request.mode !== scope.mode ||
      frozen?.source.tool !== 'getJournalPeriodReview' ||
      frozen.source.permission !== 'journal:read' ||
      frozen.prompt.version !== run.promptVersion
    )
      throw notFound();
    const request = parsed.data.request;
    const result = researchResultSchema.safeParse(run.result);
    return journalPeriodAiExplanationSchema.parse({
      id: run.id,
      ...scope,
      symbol: request.symbol ?? null,
      start: request.start,
      end: request.end,
      ledgerRevision: request.expectedLedgerRevision,
      projectionGeneration: request.expectedProjectionGeneration,
      objectFingerprints: request.objectFingerprints,
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
      algorithmVersion: parsed.data.result.algorithmVersion,
      status: run.status,
      errorCode: run.errorCode,
      errorSummary: run.errorSummary,
      result: result.success ? result.data : null,
      createdAt: run.createdAt.toISOString(),
    });
  }
}
