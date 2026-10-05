import {
  journalReviewQuerySchema,
  journalReviewObjectLocatorSchema,
  journalReviewReferenceLocatorSchema,
  type JournalReviewReferenceLocator,
  journalReviewListContractSchema,
  journalReviewCandidateContractSchema,
  journalReviewSnapshotRequestSchema,
  journalReviewAnalysisResponseSchema,
  journalPeriodReviewRequestSchema,
  journalPeriodReviewResponseSchema,
  journalSnapshotHistoryQuerySchema,
  journalSnapshotHistoryResponseSchema,
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
  journalStoredSnapshotViewSchema,
  type JournalReviewQuery,
  type JournalReviewSnapshotRequest,
  type JournalPeriodReviewRequest,
  type JournalSnapshotHistoryQuery,
  journalAiExplanationSchema,
  journalReviewExplanationRequestSchema,
  journalPeriodExplanationRequestSchema,
  journalPeriodAiExplanationSchema,
  type JournalPeriodExplanationRequest,
  type JournalAnalysisDraft,
} from '@thesis-ledger/schemas';

type ParsedSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
type RequestParsed = <T>(path: string, schema: ParsedSchema<T>, init?: RequestInit) => Promise<T>;
type PostParsed = <T>(path: string, body: unknown, schema: ParsedSchema<T>) => Promise<T>;
type QuerySuffix = (params: Record<string, string | number | undefined>) => string;

const belongs = (
  candidate: { input: { trade: { accountId: string; accountMode: string } } },
  scope: { accountId: string; mode: string },
) =>
  candidate.input.trade.accountId === scope.accountId &&
  candidate.input.trade.accountMode === scope.mode;
const savedBelongs = (
  snapshot: { accountId: string; mode: string },
  scope: { accountId: string; mode: string },
) => snapshot.accountId === scope.accountId && snapshot.mode === scope.mode;
const sameFingerprints = (actual: Record<string, string>, expected: Record<string, string>) =>
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.keys(expected).every((id) => actual[id] === expected[id]);
const sameDraft = (
  actual: JournalAnalysisDraft | null | undefined,
  expected: JournalAnalysisDraft | null | undefined,
) => {
  if (actual == null || expected == null) return actual == null && expected == null;
  const keys = ['plannedEntry', 'plannedExit', 'stopLoss', 'expectedHoldingDays', 'note'] as const;
  return keys.every((key) => actual[key] === expected[key]);
};
const sameAlgorithm = (actual: string, expected: string | undefined) =>
  expected === undefined || actual === expected;

export function journalReviewClient(get: RequestParsed, post: PostParsed, suffix: QuerySuffix) {
  return {
    explainPeriod: (input: JournalPeriodExplanationRequest) => {
      const request = journalPeriodExplanationRequestSchema.parse(input);
      return post(
        '/journal/period-explanations',
        request,
        journalPeriodAiExplanationSchema.refine(
          (value) =>
            savedBelongs(value, request) &&
            value.symbol === (request.symbol ?? null) &&
            value.start === request.start &&
            value.end === request.end &&
            value.ledgerRevision === request.expectedLedgerRevision &&
            value.projectionGeneration === request.expectedProjectionGeneration &&
            value.algorithmVersion === request.expectedAlgorithmVersion &&
            sameFingerprints(value.objectFingerprints, request.objectFingerprints),
        ),
      );
    },
    periodExplanation: (
      id: string,
      input: { accountId: string; mode?: 'actual' | 'shadow' },
      signal?: AbortSignal,
    ) => {
      const scope = journalSnapshotDetailQuerySchema.parse(input);
      const runId = journalSnapshotIdSchema.parse(id);
      return get(
        `/journal/period-explanations/${encodeURIComponent(runId)}${suffix(scope)}`,
        journalPeriodAiExplanationSchema.refine(
          (value) => savedBelongs(value, scope) && value.id === runId,
        ),
        signal === undefined ? undefined : { signal },
      );
    },
    explain: (input: JournalReviewSnapshotRequest) => {
      const request = journalReviewExplanationRequestSchema.parse(input);
      return post(
        '/journal/explanations',
        request,
        journalAiExplanationSchema.refine(
          (value) =>
            savedBelongs(value, request) &&
            value.reviewObjectId === request.reference.reviewObjectId &&
            value.evidenceFingerprint === request.evidenceFingerprint &&
            sameDraft(value.analysisDraft, request.analysisDraft) &&
            sameAlgorithm(value.algorithmVersion, request.expectedAlgorithmVersion),
        ),
      );
    },
    explanation: (
      id: string,
      input: { accountId: string; mode?: 'actual' | 'shadow' },
      signal?: AbortSignal,
    ) => {
      const scope = journalSnapshotDetailQuerySchema.parse(input);
      const runId = journalSnapshotIdSchema.parse(id);
      return get(
        `/journal/explanations/${encodeURIComponent(runId)}${suffix(scope)}`,
        journalAiExplanationSchema.refine(
          (value) => savedBelongs(value, scope) && value.id === runId,
        ),
        signal === undefined ? undefined : { signal },
      );
    },
    resolveReference: (input: JournalReviewReferenceLocator, signal?: AbortSignal) => {
      const query = journalReviewReferenceLocatorSchema.parse(input);
      return get(
        `/journal/review-object-reference${suffix(query)}`,
        journalReviewCandidateContractSchema.refine((value) => {
          const reference = value.input.reference;
          if (
            !belongs(value, query) ||
            reference.tradeId !== query.tradeId ||
            reference.reviewObjectType !== query.reviewObjectType
          )
            return false;
          return (
            query.reviewObjectType === 'TRADE_CYCLE' ||
            (reference.reviewObjectType === 'CLOSE_SLICE' &&
              reference.closeSliceId === query.closeSliceId)
          );
        }),
        signal === undefined ? undefined : { signal },
      );
    },
    candidates: (
      input: Omit<JournalReviewQuery, 'limit' | 'mode'> & {
        limit?: number;
        mode?: 'actual' | 'shadow';
      },
      signal?: AbortSignal,
    ) => {
      const query = journalReviewQuerySchema.parse(input);
      const response = journalReviewListContractSchema.refine(
        (value) =>
          value.items.every((row) => belongs(row, query)) &&
          value.legacyItems.every(
            (row) =>
              row.accountId === query.accountId &&
              (row.accountMode === null || row.accountMode === query.mode),
          ),
      );
      return get(
        `/journal/review-candidates${suffix(query)}`,
        response,
        signal === undefined ? undefined : { signal },
      );
    },
    object: (
      input: { accountId: string; mode?: 'actual' | 'shadow'; reviewObjectId: string },
      signal?: AbortSignal,
    ) => {
      const query = journalReviewObjectLocatorSchema.parse(input);
      const { reviewObjectId, ...scope } = query;
      return get(
        `/journal/review-objects/${encodeURIComponent(reviewObjectId)}${suffix(scope)}`,
        journalReviewCandidateContractSchema.refine(
          (value) =>
            belongs(value, query) && value.input.reference.reviewObjectId === reviewObjectId,
        ),
        signal === undefined ? undefined : { signal },
      );
    },
    analyze: (input: JournalReviewSnapshotRequest) => {
      const request = journalReviewSnapshotRequestSchema.parse(input);
      return post(
        '/journal/analysis/object',
        request,
        journalReviewAnalysisResponseSchema.refine(
          (value) =>
            belongs(value.candidate, request) &&
            value.candidate.input.reference.reviewObjectId === request.reference.reviewObjectId &&
            value.candidate.input.projection.evidenceFingerprint === request.evidenceFingerprint &&
            sameDraft(value.candidate.input.analysisDraft, request.analysisDraft) &&
            sameAlgorithm(value.result.algorithmVersion, request.expectedAlgorithmVersion),
        ),
      );
    },
    period: (input: JournalPeriodReviewRequest) => {
      const request = journalPeriodReviewRequestSchema.parse(input);
      return post(
        '/journal/analysis/period',
        request,
        journalPeriodReviewResponseSchema.refine(
          (value) =>
            savedBelongs(value, request) &&
            value.symbol === (request.symbol ?? null) &&
            value.result.window.start === request.start &&
            value.result.window.end === request.end,
        ),
      );
    },
    save: (input: JournalReviewSnapshotRequest) => {
      const request = journalReviewSnapshotRequestSchema.parse(input);
      return post(
        '/journal/review-snapshots',
        request,
        journalStoredSnapshotViewSchema.refine(
          (value) =>
            savedBelongs(value, request) &&
            value.compatibility === 'CURRENT_CONTRACT' &&
            value.snapshot.inputSnapshot.reference.reviewObjectId ===
              request.reference.reviewObjectId &&
            value.snapshot.inputSnapshot.projection.evidenceFingerprint ===
              request.evidenceFingerprint &&
            sameDraft(value.snapshot.inputSnapshot.analysisDraft, request.analysisDraft) &&
            sameAlgorithm(
              value.snapshot.outputSnapshot.algorithmVersion,
              request.expectedAlgorithmVersion,
            ) &&
            (value.snapshot.outputSnapshot.aiExplanation?.id ?? null) === (request.aiRunId ?? null),
        ),
      );
    },
    history: (
      input: Omit<JournalSnapshotHistoryQuery, 'limit' | 'mode'> & {
        limit?: number;
        mode?: 'actual' | 'shadow';
      },
      signal?: AbortSignal,
    ) => {
      const query = journalSnapshotHistoryQuerySchema.parse(input);
      return get(
        `/journal/review-snapshots${suffix(query)}`,
        journalSnapshotHistoryResponseSchema.refine((value) =>
          value.items.every((row) => savedBelongs(row, query)),
        ),
        signal === undefined ? undefined : { signal },
      );
    },
    snapshot: (
      id: string,
      input: { accountId: string; mode?: 'actual' | 'shadow' },
      signal?: AbortSignal,
    ) => {
      const query = journalSnapshotDetailQuerySchema.parse(input);
      const snapshotId = journalSnapshotIdSchema.parse(id);
      return get(
        `/journal/review-snapshots/${encodeURIComponent(snapshotId)}${suffix(query)}`,
        journalStoredSnapshotViewSchema.refine(
          (value) =>
            savedBelongs(value, query) &&
            (value.compatibility === 'CURRENT_CONTRACT' ? value.snapshot.id : value.id) ===
              snapshotId,
        ),
        signal === undefined ? undefined : { signal },
      );
    },
  };
}
