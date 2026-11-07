import { MarketReferenceCodeField } from './MarketReferenceCodeField';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  marketReferenceCatalog,
  marketReferenceInputSchema,
  marketReferenceIndexInfo,
  marketReferenceCodeInput,
  type MarketReferenceDataset,
  type MarketReferenceInput,
} from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryList,
} from '../../components/MobilePrimitives';
import { ReferenceTypePicker } from './ReferenceTypePicker';
import { ReferenceResult } from './ReferenceResult';

export function MarketReferenceScreen() {
  const { api, scope } = useMobileRuntime();
  const [dataset, setDataset] = useState<MarketReferenceDataset>('financial-balance');
  const [symbol, setSymbol] = useState('600519.SH');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitted, setSubmitted] = useState<MarketReferenceInput | null>(null);
  const [previous, setPrevious] = useState<MarketReferenceInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entry = marketReferenceCatalog[dataset];
  const index = marketReferenceIndexInfo(dataset);
  const codeInput = marketReferenceCodeInput(dataset);
  const query = useQuery({
    queryKey: [...scope, 'market-reference', submitted],
    enabled: submitted !== null,
    queryFn: ({ signal }) => {
      if (!submitted) throw new Error('请先选择查询条件');
      return api.market.getReference(submitted, signal);
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const clear = () => {
    setSubmitted(null);
    setPrevious([]);
    setError(null);
  };
  const read = () => {
    const checked = marketReferenceInputSchema.safeParse({
      dataset,
      symbol: codeInput ? symbol.trim().toUpperCase() : null,
      indexCode: entry.scope === 'index' ? (index?.code ?? null) : null,
      start: entry.dateFilter ? start || null : null,
      end: entry.dateFilter ? end || null : null,
    });
    if (!checked.success) {
      setError(
        '请核对本资料支持的代码及日期；快照须填写同一天，日历最多七天，中债曲线最多 360 天。',
      );
      return;
    }
    setError(null);
    setPrevious([]);
    if (JSON.stringify(submitted) === JSON.stringify(checked.data)) void query.refetch();
    else setSubmitted(checked.data);
  };
  return (
    <Page title="市场资料查询">
      <ReferenceTypePicker
        value={dataset}
        onChange={(value) => {
          setDataset(value);
          setStart('');
          setEnd('');
          clear();
        }}
      />
      <MarketReferenceCodeField dataset={dataset} value={symbol} onChange={(value) => { setSymbol(value); clear(); }} />
      {entry.scope === 'index' ? <Copy>指数：{index?.label}</Copy> : null}
      {entry.dateFilter ? (
        <>
          <Field
            label="起始日期 YYYY-MM-DD"
            value={start}
            onChange={(v) => {
              setStart(v);
              clear();
            }}
          />
          <Field
            label="截止日期 YYYY-MM-DD"
            value={end}
            onChange={(v) => {
              setEnd(v);
              clear();
            }}
          />
        </>
      ) : null}
      <Copy muted>每页五条，缺失显示为 —；日期、单位和覆盖范围以本次来源记录为准。</Copy>
      <Feedback message={error} error />
      <Action label="查询资料" primary disabled={query.isFetching} onPress={read} />
      {submitted && (
        <QueryList
          query={query}
          retry={() => void query.refetch()}
          label="正在刷新市场资料"
        >
          {query.data ? <ReferenceResult data={query.data} /> : null}
        </QueryList>
      )}
      {query.data && submitted ? (
        <>
          <Copy>第 {submitted.page} 页</Copy>
          <Action
            label="上一页资料"
            disabled={!previous.length || query.isFetching}
            onPress={() => {
              const last = previous.at(-1);
              if (last) {
                setSubmitted(last);
                setPrevious((v) => v.slice(0, -1));
              }
            }}
          />
          <Action
            label="下一页资料"
            disabled={!query.data.hasMore || query.isFetching || submitted.page >= 1000}
            onPress={() => {
              setPrevious((v) => [...v, submitted]);
              setSubmitted({
                ...submitted,
                page: submitted.page + 1,
                cursor: query.data.nextCursor,
              });
            }}
          />
        </>
      ) : null}
    </Page>
  );
}
