import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DecimalValue,
  journalReviewFallsInWindow,
  journalReviewWindow,
} from '@thesis-ledger/domain';
import {
  journalReviewCursorSchema,
  type JournalReviewCandidateContract,
  type JournalReviewQuery,
  type JournalReviewCursor,
} from '@thesis-ledger/schemas';

type ProjectionVersion = Pick<JournalReviewCursor, 'ledgerRevision' | 'projectionGeneration'>;

const conflict = () =>
  new ConflictException({
    errorCode: 'PROJECTION_GENERATION_CONFLICT',
    message: '复盘投影已更新，请刷新后重试',
  });

function cursorFor(
  query: JournalReviewQuery,
  version: ProjectionVersion,
  afterObjectId: string,
): JournalReviewCursor {
  return {
    version: 1,
    accountId: query.accountId,
    mode: query.mode,
    symbol: query.symbol ?? null,
    start: query.start ?? null,
    end: query.end ?? null,
    ...version,
    afterObjectId,
  };
}

function readCursor(raw: string, query: JournalReviewQuery, version: ProjectionVersion) {
  let cursor: JournalReviewCursor;
  try {
    cursor = journalReviewCursorSchema.parse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
  } catch {
    throw new BadRequestException({
      errorCode: 'JOURNAL_CURSOR_INVALID',
      message: '复盘游标无效，请刷新后重试',
    });
  }
  const expected = cursorFor(query, version, cursor.afterObjectId);
  if (JSON.stringify(cursor) !== JSON.stringify(journalReviewCursorSchema.parse(expected)))
    throw conflict();
  return cursor;
}

const statisticalTime = (candidate: JournalReviewCandidateContract): string | null =>
  candidate.input.reference.reviewObjectType === 'TRADE_CYCLE'
    ? candidate.effectiveClosedAt
    : candidate.executedAt;

function compareCandidates(
  left: JournalReviewCandidateContract,
  right: JournalReviewCandidateContract,
) {
  const leftTime = statisticalTime(left);
  const rightTime = statisticalTime(right);
  if (leftTime === null && rightTime !== null) return 1;
  if (leftTime !== null && rightTime === null) return -1;
  if (leftTime !== null && rightTime !== null) {
    const leftInstant = journalReviewWindow({ start: leftTime }).startEpochSeconds!;
    const rightInstant = journalReviewWindow({ start: rightTime }).startEpochSeconds!;
    const comparison = DecimalValue.from(rightInstant).compareTo(leftInstant);
    if (comparison !== 0) return comparison;
  }
  return left.input.reference.reviewObjectId.localeCompare(right.input.reference.reviewObjectId);
}

export function journalReviewPage(
  candidates: readonly JournalReviewCandidateContract[],
  query: JournalReviewQuery,
  version: ProjectionVersion,
) {
  if (
    candidates.some(
      (candidate) =>
        candidate.input.trade.accountId === query.accountId &&
        candidate.input.trade.accountMode === query.mode &&
        (candidate.input.projection.projectionGeneration !== version.projectionGeneration ||
          candidate.input.projection.ledgerRevision !== version.ledgerRevision),
    )
  )
    throw conflict();
  const window = journalReviewWindow({
    ...(query.start === undefined ? {} : { start: query.start }),
    ...(query.end === undefined ? {} : { end: query.end }),
  });
  const items = candidates
    .filter(
      (candidate) =>
        candidate.input.trade.accountId === query.accountId &&
        candidate.input.trade.accountMode === query.mode &&
        (query.symbol === undefined || candidate.input.trade.symbol === query.symbol) &&
        journalReviewFallsInWindow(statisticalTime(candidate), window),
    )
    .sort(compareCandidates);
  let startIndex = 0;
  if (query.cursor !== undefined) {
    const cursor = readCursor(query.cursor, query, version);
    const cursorIndex = items.findIndex(
      (candidate) => candidate.input.reference.reviewObjectId === cursor.afterObjectId,
    );
    if (cursorIndex === -1) throw conflict();
    startIndex = cursorIndex + 1;
  }
  const page = items.slice(startIndex, startIndex + query.limit);
  const last = page.at(-1);
  const nextCursor =
    startIndex + page.length < items.length && last
      ? Buffer.from(
          JSON.stringify(cursorFor(query, version, last.input.reference.reviewObjectId)),
        ).toString('base64url')
      : null;
  return {
    items: page,
    total: items.length,
    nextCursor,
    projectionGeneration: version.projectionGeneration,
    ledgerRevision: version.ledgerRevision,
  };
}
