import { watchlistInstrumentSchema } from '@thesis-ledger/schemas';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import { MultiSelectField } from '../../components/MultiSelectField';
import {
  Action,
  Copy,
  Feedback,
  Field,
  QueryList,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
function filterInstrumentChoices(
  rows: readonly InstrumentSearchResult[] | undefined,
  markets?: readonly string[],
  instrumentTypes?: readonly string[],
  accepts?: (item: InstrumentSearchResult) => boolean,
): InstrumentSearchResult[] {
  return (rows ?? []).filter((item) =>
    (!markets || markets.includes(item.market)) &&
    (!instrumentTypes || instrumentTypes.includes(item.instrumentType)) &&
    (!accepts || accepts(item)),
  );
}

function instrumentInputDisplay(input: string, displayName: string | undefined, focused: boolean): string {
  if (!focused && displayName && displayName !== input) return `${displayName} · ${input}`;
  return input;
}

export function InstrumentPicker({
  onConfirmed,
  purpose = 'holding',
  value,
  displayName,
  onInputChange,
  label = '代码或名称',
  editable = true,
  markets,
  instrumentTypes,
  accepts,
  selection,
}: {
  purpose?: 'holding' | 'research' | 'watchlist' | 'browse';
  value?: string;
  displayName?: string | undefined;
  onInputChange?: (value: string) => void;
  label?: string;
  editable?: boolean;
  markets?: readonly string[];
  instrumentTypes?: readonly string[];
  accepts?: (item: InstrumentSearchResult) => boolean;
  onConfirmed: (value: InstrumentSearchResult) => void | boolean;
  selection?: {
    items: readonly Pick<InstrumentSearchResult, 'id' | 'symbol' | 'displayName'>[];
    onRemove: (id: string) => void;
  };
}) {
  const { api, scope } = useMobileRuntime();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
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
  const items = current ? filterInstrumentChoices(query.data, markets, instrumentTypes, accepts) : [];
  const select = async (item: InstrumentSearchResult) => {
    if (!editable || !current || query.isFetching || query.isError) return;
    try {
      if (selection?.items.some((selected) => selected.id === item.id)) {
        selection.onRemove(item.id);
        setInput('');
        inputRef.current?.focus();
        return;
      }
      if (purpose === 'holding') await confirm.mutateAsync(item);
      if (onConfirmed(item) === false) return;
      if (selection) {
        setInput('');
        inputRef.current?.focus();
        return;
      }
      setQueryText('');
      setFeedback(`已选择 ${item.displayName}（${item.symbol}）。`);
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  const choiceLabel = (item: InstrumentSearchResult) => {
    if (selection?.items.some((selected) => selected.id === item.id)) return `取消选择 ${item.displayName}`;
    if (purpose === 'holding') return `确认 ${item.displayName}`;
    return `选择 ${item.displayName}`;
  };
  return (
    <Section variant={selection ? 'content' : 'panel'} {...(onInputChange ? {} : { title: '选择目录标的' })}>
      {selection ? <MultiSelectField
        label={label} value={input} onChange={setInput} inputRef={inputRef}
        editable={editable && !confirm.isPending}
        selected={selection.items.map((item) => ({
          id: item.id,
          label: item.displayName === item.symbol ? item.symbol : `${item.displayName} · ${item.symbol}`,
        }))}
        onRemove={selection.onRemove}
      /> : <Field
        label={label}
        value={instrumentInputDisplay(input, displayName, focused)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={setInput}
        editable={editable && !confirm.isPending}
      />}
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
            <Section key={item.id} variant={selection ? 'content' : 'panel'}>
              <Copy>
                {item.displayName} · {item.symbol}
              </Copy>
              {purpose === 'holding' && item.disabledReason ? (
                <Copy muted>{item.disabledReason}</Copy>
              ) : null}
              <Action
                label={choiceLabel(item)}
                primary={Boolean(selection?.items.some((selected) => selected.id === item.id))}
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
