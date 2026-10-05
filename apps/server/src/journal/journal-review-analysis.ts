import { ConflictException, Injectable } from '@nestjs/common';
import { journalAnalyze, journalAnalyzePeriod } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalReviewSnapshotRequestSchema,
  type JournalReviewCandidateContract,
  journalPeriodReviewRequestSchema,
  journalPeriodReviewResultSchema,
  journalPeriodReviewResponseSchema,
} from '@thesis-ledger/schemas';
import { JournalReviewQuery } from './journal-review-query.js';
import { journalReviewWithDraft } from './journal-review-draft.js';

export const journalAnalyzeCandidate = (candidate: JournalReviewCandidateContract) =>
  journalDeterministicReviewSchema.parse(journalAnalyze(candidate));

@Injectable()
export class JournalReviewAnalysis {
  constructor(private readonly candidates: JournalReviewQuery) {}

  async analyze(raw: unknown) {
    const request = journalReviewSnapshotRequestSchema.parse(raw);
    const candidate = journalReviewWithDraft(
      await this.candidates.get(request),
      request.analysisDraft,
    );
    if (request.evidenceFingerprint !== candidate.input.projection.evidenceFingerprint)
      throw new ConflictException({
        errorCode: 'JOURNAL_EVIDENCE_CHANGED',
        message: '复盘证据已变化，请刷新后重新分析',
      });
    const result = journalAnalyzeCandidate(candidate);
    if (
      request.expectedAlgorithmVersion !== undefined &&
      request.expectedAlgorithmVersion !== result.algorithmVersion
    )
      throw new ConflictException({
        errorCode: 'JOURNAL_ALGORITHM_CHANGED',
        message: '复盘算法版本已变化，请重新分析',
      });
    return { candidate, result };
  }

  async period(raw: unknown) {
    const request = journalPeriodReviewRequestSchema.parse(raw);
    const context = await this.candidates.readContext(request);
    const result = journalPeriodReviewResultSchema.parse(
      journalAnalyzePeriod(context.candidates, request),
    );
    const selectedIds = new Set([
      ...result.tradeCycles.includedObjectIds,
      ...result.tradeCycles.excluded.map((row) => row.reviewObjectId),
      ...result.closeSlices.includedObjectIds,
      ...result.closeSlices.excluded.map((row) => row.reviewObjectId),
      ...result.unknownTime.map((row) => row.reviewObjectId),
    ]);
    return journalPeriodReviewResponseSchema.parse({
      accountId: request.accountId,
      mode: request.mode,
      symbol: request.symbol ?? null,
      ...context.version,
      candidates: context.candidates.filter((row) =>
        selectedIds.has(row.input.reference.reviewObjectId),
      ),
      result,
    });
  }
}
