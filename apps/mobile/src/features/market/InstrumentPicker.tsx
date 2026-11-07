import { watchlistInstrumentSchema } from '@thesis-ledger/schemas';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Copy,
  Feedback,
  Field,
  QueryList,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
export function InstrumentPicker({
  onConfirmed,
  purpose = 'holding',
  value,
  onInputChange,
  label = '代码或名称',
  editable = true,
  markets,
  instrumentTypes,
  accepts,
}: {
  purpose?: 'holding' | 'research' | 'watchlist' | 'browse';
  value?: string;
  onInputChange?: (value: string) => void;
  label?: string;
  editable?: boolean;
  markets?: readonly string[];
  instrumentTypes?: readonly string[];
  accepts?: (item: InstrumentSearchResult) => boolean;
  onConfirmed: (value: InstrumentSearchResult) => void;
}) {
  const { api, scope } = useMobileRuntime();
  const [text, setText] = useState('');
  const input = value ?? text;
  const setInput = (next: string) => {
    setText(next);
    onInputChange?.(next);
    setQueryText('');
    setFeedback(null);
  };
  const [queryText, setQueryText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...scope, 'instruments', queryText],
    enabled: editable && Boolean(queryText) && input.trim() === queryText,
    queryFn: ({ signal }) => api.market.searchInstruments({ q: queryText, limit: 20 }, signal),
  });
  const confirm = useMobileCommand(
    (item: InstrumentSearchResult) => api.market.confirmInstrument(item.id),
    { refresh: false },
  );
  const current = input.trim() === queryText;
  const items = (current ? (query.data ?? []) : []).filter(
    (item) =>
      (!markets || markets.includes(item.market)) &&
      (!instrumentTypes || instrumentTypes.includes(item.instrumentType)) &&
      (!accepts || accepts(item)),
  );
  const select = async (item: InstrumentSearchResult) => {
    if (!editable || !current || query.isFetching || query.isError) return;
    try {
      if (purpose === 'holding') await confirm.mutateAsync(item);
      onConfirmed(item);
      setQueryText('');
      setFeedback(`已选择 ${item.displayName}（${item.symbol}）。`);
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Section {...(onInputChange ? {} : { title: '选择目录标的' })}>
      <Field
        label={label}
        value={input}
        onChange={setInput}
        editable={editable && !confirm.isPending}
      />
      <Action
        label="搜索标的"
        disabled={!editable || !input.trim() || query.isFetching || confirm.isPending}
        onPress={() => {
          setFeedback(null);
          if (queryText === input.trim()) void query.refetch();
          else setQueryText(input.trim());
        }}
      />
      <Feedback busy={confirm.isPending} message={feedback} error={confirm.isError} />
      {queryText && current && editable && (
        <QueryList
          query={query}
          empty={query.isSuccess && items.length === 0}
          retry={() => void query.refetch()}
          label="正在刷新标的搜索"
          gap={12}
        >
          {items.map((item) => (
            <Section key={item.id}>
              <Copy>
                {item.displayName} · {item.symbol}
              </Copy>
              {purpose === 'holding' && item.disabledReason ? (
                <Copy muted>{item.disabledReason}</Copy>
              ) : null}
              <Action
                label={`${purpose === 'holding' ? '确认' : '选择'} ${item.displayName}`}
                disabled={
                  !editable ||
                  (purpose === 'holding' && !item.confirmable) ||
                  (purpose === 'research' &&
                    !['STOCK', 'ETF', 'INDEX', 'MUTUAL_FUND'].includes(item.instrumentType)) ||
                  (purpose === 'watchlist' &&
                    !watchlistInstrumentSchema.safeParse({
                      id: item.id,
                      canonicalCode: item.canonicalCode,
                      market: item.market,
                      instrumentType: item.instrumentType,
                      active: item.active,
                    }).success) ||
                  !item.active ||
                  confirm.isPending ||
                  query.isError ||
                  query.isFetching
                }
                onPress={() => void select(item)}
              />
            </Section>
          ))}
        </QueryList>
      )}
    </Section>
  );
}
