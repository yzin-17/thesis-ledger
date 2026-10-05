import { journalReviewFallsInWindow, journalReviewWindow } from '@thesis-ledger/domain';
import {
  journalReviewCandidateContractSchema,
  type JournalReviewCandidateContract,
} from '@thesis-ledger/schemas';
import { journalBrowserStateFixture } from './browser-journal-state.fixture.js';

export function browserJournalCandidateForObject(
  current: JournalReviewCandidateContract,
  objectId: string,
) {
  const closeSlice = current.input.trade.closeSlices.find(
    (row) => `CLOSE_SLICE:${row.id}` === objectId,
  );
  if (!closeSlice || current.input.reference.reviewObjectId === objectId) return current;
  const slice = structuredClone(current);
  slice.input.reference = {
    reviewObjectType: 'CLOSE_SLICE',
    reviewObjectId: `CLOSE_SLICE:${closeSlice.id}`,
    tradeId: slice.input.trade.id,
    closeSliceId: closeSlice.id,
  };
  slice.effectiveClosedAt = null;
  slice.executedAt = closeSlice.occurredAt;
  return journalReviewCandidateContractSchema.parse(slice);
}

export function browserJournalScenarioCandidates(current: JournalReviewCandidateContract) {
  const state = journalBrowserStateFixture.state;
  if (['no-objects', 'legacy', 'legacy-ambiguous', 'period-empty'].includes(state)) return [];
  if (!['period-mixed', 'paged', 'stale-cursor', 'generation-conflict'].includes(state))
    return [current];
  const objectId = `CLOSE_SLICE:${current.input.trade.closeSlices[0]!.id}`;
  return [current, browserJournalCandidateForObject(current, objectId)];
}

export function browserJournalCandidatePage(
  url: URL,
  candidates: JournalReviewCandidateContract[],
) {
  const state = journalBrowserStateFixture.state;
  const cursor = url.searchParams.get('cursor');
  if (cursor && ['stale-cursor', 'generation-conflict'].includes(state)) {
    const errorCode =
      state === 'stale-cursor' ? 'JOURNAL_CURSOR_INVALID' : 'PROJECTION_GENERATION_CONFLICT';
    return new Response(
      JSON.stringify({ errorCode, message: '固定验收：投影世代已变化，请重新读取' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const window = journalReviewWindow({
    ...(start === null ? {} : { start }),
    ...(end === null ? {} : { end }),
  });
  const items = candidates.filter((row) => {
    const matchesSymbol =
      !url.searchParams.has('symbol') || row.input.trade.symbol === url.searchParams.get('symbol');
    return (
      matchesSymbol && journalReviewFallsInWindow(row.executedAt ?? row.effectiveClosedAt, window)
    );
  });
  const paged = ['paged', 'stale-cursor', 'generation-conflict'].includes(state);
  let page = items;
  let nextCursor: string | null = null;
  if (paged) {
    page = cursor ? items.slice(1) : items.slice(0, 1);
    if (!cursor && items.length > 1) nextCursor = 'fixture-generation-7-page-2';
  }
  return { items: page, total: items.length, nextCursor };
}

const held: (() => void)[] = [];
export function browserJournalHoldCandidateResponse(response: Response): Promise<Response> {
  if (journalBrowserStateFixture.state !== 'delayed-response') return Promise.resolve(response);
  return new Promise((resolve) => held.push(() => resolve(response)));
}
export function browserJournalReleaseCandidateResponses() {
  const pending = held.splice(0);
  for (const release of pending) release();
  return pending.length;
}
