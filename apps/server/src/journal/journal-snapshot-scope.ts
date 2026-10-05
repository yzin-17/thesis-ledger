import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DecimalValue, journalReviewWindow } from '@thesis-ledger/domain';
import {
  journalSnapshotHistoryCursorSchema,
  type JournalSnapshotHistoryQuery,
} from '@thesis-ledger/schemas';

function ceilingMilliseconds(value: string, epochSeconds: string) {
  const milliseconds = Date.parse(value);
  const precise = DecimalValue.from(epochSeconds).times('1000');
  if (precise.compareTo(String(milliseconds)) > 0) return new Date(milliseconds + 1);
  return new Date(milliseconds);
}

export function journalSnapshotWhere(
  query: JournalSnapshotHistoryQuery,
): Prisma.JournalReviewSnapshotWhereInput {
  const window = journalReviewWindow({
    ...(query.start === undefined ? {} : { start: query.start }),
    ...(query.end === undefined ? {} : { end: query.end }),
  });
  const object = query.reviewObjectId;
  let reference: Prisma.JournalReviewSnapshotWhereInput = {};
  if (object?.startsWith('TRADE_CYCLE:'))
    reference = {
      reviewObjectType: 'TRADE_CYCLE',
      tradeId: object.slice('TRADE_CYCLE:'.length),
      closeSliceId: null,
    };
  else if (object?.startsWith('CLOSE_SLICE:'))
    reference = {
      reviewObjectType: 'CLOSE_SLICE',
      closeSliceId: object.slice('CLOSE_SLICE:'.length),
    };
  return {
    accountId: query.accountId,
    mode: query.mode,
    ...reference,
    createdAt: {
      ...(query.start === undefined
        ? {}
        : { gte: ceilingMilliseconds(query.start, window.startEpochSeconds!) }),
      ...(query.end === undefined
        ? {}
        : { lt: ceilingMilliseconds(query.end, window.endEpochSeconds!) }),
    },
  };
}

const cursorValue = (query: JournalSnapshotHistoryQuery, afterSnapshotId: string) => ({
  version: 1 as const,
  accountId: query.accountId,
  mode: query.mode,
  reviewObjectId: query.reviewObjectId ?? null,
  start: query.start ?? null,
  end: query.end ?? null,
  afterSnapshotId,
});
export const journalSnapshotCursor = (
  query: JournalSnapshotHistoryQuery,
  afterSnapshotId: string,
) => Buffer.from(JSON.stringify(cursorValue(query, afterSnapshotId))).toString('base64url');

export function readJournalSnapshotCursor(query: JournalSnapshotHistoryQuery) {
  if (query.cursor === undefined) return null;
  try {
    const parsed = journalSnapshotHistoryCursorSchema.parse(
      JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
    );
    if (JSON.stringify(parsed) !== JSON.stringify(cursorValue(query, parsed.afterSnapshotId)))
      throw new Error('范围变化');
    return parsed.afterSnapshotId;
  } catch {
    throw new BadRequestException({
      errorCode: 'JOURNAL_SNAPSHOT_CURSOR_INVALID',
      message: '复盘快照游标已失效，请重新查询',
    });
  }
}
