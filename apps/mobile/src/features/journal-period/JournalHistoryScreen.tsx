import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { JournalResult } from '../journal-trade/JournalFacts';
export function JournalHistoryScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'JournalHistory'>>();
  const { api, scope } = useMobileRuntime();
  const [selected, setSelected] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: [...scope, 'journal-history', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.journalReviews.history(
        { ...params, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Page title="历史复盘快照">
      <Copy muted>历史快照保留当时输入与结果，重新读取不会重算。</Copy>
      <QueryStatus query={query} empty={!items.length} retry={() => void query.refetch()} />
      {items.map((row) => {
        if (row.compatibility === 'LEGACY_UNSUPPORTED')
          return (
            <Section key={row.id} title="旧格式快照">
              <Copy>{row.createdAt} · 需要重新确认</Copy>
              {row.reasons.map((r, i) => (
                <Copy key={i}>{r}</Copy>
              ))}
            </Section>
          );
        const value = row.snapshot;
        return (
          <Section key={value.id} title={value.inputSnapshot.trade.symbol}>
            <Copy>
              {value.createdAt} ·{' '}
              {value.status === 'CURRENT' ? '当前版本' : '事实已变化，保留当时结果'}
            </Copy>
            <Action label={`读取快照 ${value.id}`} onPress={() => setSelected(value.id)} />
            {selected === value.id ? (
              <>
                <Copy>对象 {value.inputSnapshot.reference.reviewObjectId}</Copy>
                <Copy>原始事实指纹 {value.inputSnapshot.projection.evidenceFingerprint}</Copy>
                <Copy>草稿备注 {value.inputSnapshot.analysisDraft?.note ?? '未填写'}</Copy>
                <JournalResult result={value.outputSnapshot} />
              </>
            ) : null}
          </Section>
        );
      })}
      {query.hasNextPage ? (
        <Action
          label="更多历史快照"
          disabled={query.isFetching}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
