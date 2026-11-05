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
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
export function InstrumentPicker({
  onConfirmed,
}: {
  onConfirmed: (value: InstrumentSearchResult) => void;
}) {
  const { api, scope } = useMobileRuntime();
  const [input, setInput] = useState('');
  const [queryText, setQueryText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...scope, 'instruments', queryText],
    enabled: Boolean(queryText),
    queryFn: ({ signal }) => api.market.searchInstruments({ q: queryText, limit: 20 }, signal),
  });
  const confirm = useMobileCommand(
    (item: InstrumentSearchResult) => api.market.confirmInstrument(item.id),
    { refresh: false },
  );
  const select = async (item: InstrumentSearchResult) => {
    try {
      await confirm.mutateAsync(item);
      onConfirmed(item);
      setQueryText('');
      setFeedback(`已确认 ${item.displayName}（${item.symbol}）。`);
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Section title="选择目录标的">
      <Field label="代码或名称" value={input} onChange={setInput} editable={!confirm.isPending} />
      <Action
        label="搜索标的"
        disabled={!input.trim() || query.isFetching || confirm.isPending}
        onPress={() => {
          setFeedback(null);
          setQueryText(input.trim());
        }}
      />
      {queryText ? (
        <QueryStatus
          query={query}
          empty={query.data?.length === 0}
          retry={() => void query.refetch()}
        />
      ) : null}
      <Feedback message={feedback} error={confirm.isError} />
      {query.data?.map((item) => (
        <Section key={item.id}>
          <Copy>
            {item.displayName} · {item.symbol}
          </Copy>
          {item.disabledReason ? <Copy muted>{item.disabledReason}</Copy> : null}
          <Action
            label={`确认 ${item.displayName}`}
            disabled={
              !item.confirmable ||
              !item.active ||
              confirm.isPending ||
              query.isError ||
              query.isFetching
            }
            onPress={() => void select(item)}
          />
        </Section>
      ))}
    </Section>
  );
}
