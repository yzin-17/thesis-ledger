import { useInfiniteQuery } from '@tanstack/react-query';
import type { JournalStoredSnapshotView } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '@/shared/api/client';
import { formatDateTime } from '@/lib/date-display';
import { reviewObjectLabels } from './journal-review-display.js';

export type JournalSnapshotRow = {
  kind: 'single' | 'period';
  id: string;
  createdAt: string;
  title: string;
  description: string;
  evidenceStatus: string | null;
  aiSaved: boolean | null;
};
type SourcePage = { items: JournalSnapshotRow[]; cursor: string | null | undefined };
type HistoryCursor = { single: SourcePage; period: SourcePage };
type HistoryScope = {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string | null;
  start: string;
  end: string;
};
const pageSize = 20;

function singleRow(
  view: JournalStoredSnapshotView,
  names: Map<string, string>,
): JournalSnapshotRow {
  if (view.compatibility === 'LEGACY_UNSUPPORTED') {
    return {
      kind: 'single',
      id: view.id,
      createdAt: view.createdAt,
      title: '标的未知',
      description:
        reviewObjectLabels[view.reviewObjectType as keyof typeof reviewObjectLabels] ?? '旧版复盘',
      evidenceStatus: '旧快照待确认',
      aiSaved: null,
    };
  }
  const { snapshot } = view;
  const { symbol } = snapshot.inputSnapshot.trade;
  const name = names.get(symbol.toUpperCase());
  return {
    kind: 'single',
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    title: name ? `${name} · ${symbol}` : symbol,
    description: reviewObjectLabels[snapshot.inputSnapshot.reference.reviewObjectType],
    evidenceStatus: snapshot.status === 'STALE' ? '证据已变化' : '证据一致',
    aiSaved: Boolean(snapshot.outputSnapshot.aiExplanation),
  };
}

async function readSingle(
  scope: HistoryScope,
  source: SourcePage,
  signal: AbortSignal,
): Promise<SourcePage> {
  if (source.items.length > 0 || source.cursor === null) return source;
  const page = await getDesktopApiClient().journalReviews.history(
    {
      accountId: scope.accountId,
      mode: scope.mode,
      ...(scope.reviewObjectId ? { reviewObjectId: scope.reviewObjectId } : {}),
      ...(scope.start ? { start: scope.start } : {}),
      ...(scope.end ? { end: scope.end } : {}),
      ...(source.cursor ? { cursor: source.cursor } : {}),
      limit: pageSize,
    },
    signal,
  );
  const names = new Map(
    page.instrumentDirectory.items.map((item) => [item.symbol.toUpperCase(), item.displayName]),
  );
  return { items: page.items.map((view) => singleRow(view, names)), cursor: page.nextCursor };
}

async function readPeriod(
  scope: HistoryScope,
  source: SourcePage,
  signal: AbortSignal,
): Promise<SourcePage> {
  if (source.items.length > 0 || source.cursor === null) return source;
  // 周期接口没有保存时间筛选；逐页筛选，直到命中范围或越过下界。
  let cursor: SourcePage['cursor'] = source.cursor;
  do {
    const page = await getDesktopApiClient().journalReviews.periodHistory(
      {
        accountId: scope.accountId,
        mode: scope.mode,
        ...(cursor ? { cursor } : {}),
        limit: pageSize,
      },
      signal,
    );
    cursor = page.nextCursor;
    const items: JournalSnapshotRow[] = [];
    for (const item of page.items) {
      const savedAt = Date.parse(item.createdAt);
      if (scope.start && savedAt < Date.parse(scope.start)) {
        cursor = null;
        break;
      }
      if (scope.end && savedAt >= Date.parse(scope.end)) continue;
      items.push({
        kind: 'period',
        id: item.id,
        createdAt: item.createdAt,
        title: `${formatDateTime(item.start)} — ${formatDateTime(item.end)}`,
        description: item.symbol ?? '账户全部标的',
        evidenceStatus: null,
        aiSaved: Boolean(item.aiExplanation),
      });
    }
    if (items.length > 0) return { items, cursor };
  } while (cursor !== null);
  return { items: [], cursor: null };
}

async function readPage(scope: HistoryScope, cursor: HistoryCursor, signal: AbortSignal) {
  // 缓冲两路未消费的行；每次只取两路的最新项，翻页也保持全局时间顺序。
  let single = { ...cursor.single, items: [...cursor.single.items] };
  let period = { ...cursor.period, items: [...cursor.period.items] };
  const items: JournalSnapshotRow[] = [];
  while (items.length < pageSize) {
    [single, period] = await Promise.all([
      readSingle(scope, single, signal),
      readPeriod(scope, period, signal),
    ]);
    const first = single.items[0];
    const second = period.items[0];
    if (!first && !second) break;
    if (!second || (first && Date.parse(first.createdAt) >= Date.parse(second.createdAt))) {
      items.push(single.items.shift()!);
    } else {
      items.push(period.items.shift()!);
    }
  }
  const hasMore =
    single.items.length > 0 ||
    single.cursor !== null ||
    period.items.length > 0 ||
    period.cursor !== null;
  return { items, nextCursor: hasMore ? { single, period } : null };
}

export function useJournalSnapshotHistory(scope: HistoryScope) {
  const initialPageParam: HistoryCursor = {
    single: { items: [], cursor: undefined },
    period: { items: [], cursor: scope.reviewObjectId ? null : undefined },
  };
  return useInfiniteQuery({
    queryKey: [
      'journal-review-history',
      scope.accountId,
      scope.mode,
      'combined',
      scope.reviewObjectId,
      scope.start,
      scope.end,
    ],
    initialPageParam,
    queryFn: ({ pageParam, signal }) => readPage(scope, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
}
