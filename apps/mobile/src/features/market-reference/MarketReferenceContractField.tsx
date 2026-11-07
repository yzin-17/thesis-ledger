import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  referenceContractChoices,
  referenceContractSources,
  referenceContractReadInput,
  isReferenceOptionUnderlying,
  type ReferenceContractKind,
  type ReferenceContractSource,
} from '@thesis-ledger/api-client';
import { marketReferenceCatalog, type MarketReferenceInput } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  QueryList,
  Section,
} from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';

export function MarketReferenceContractField({
  kind,
  value,
  onChange,
}: {
  kind: ReferenceContractKind;
  value: string;
  onChange: (value: string) => void;
}) {
  const { api, scope } = useMobileRuntime();
  const [source, setSource] = useState<ReferenceContractSource>(
    kind === 'future' ? 'futures-daily-shfe' : 'etf-option-contracts',
  );
  const [date, setDate] = useState('');
  const [underlying, setUnderlying] = useState('');
  const [submitted, setSubmitted] = useState<MarketReferenceInput | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...scope, 'market-reference', 'contract-choices', submitted],
    enabled: Boolean(submitted),
    queryFn: ({ signal }) => api.market.getReference(submitted!, signal),
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const reset = () => {
    setSubmitted(null);
    setError(null);
  };
  const read = () => {
    try {
      const input = referenceContractReadInput(source, date, underlying);
      setError(null);
      setFilter('');
      if (JSON.stringify(input) === JSON.stringify(submitted)) void query.refetch();
      else setSubmitted(input);
    } catch {
      setError(kind === 'future' ? '请选择清单交易日。' : '请选择当前支持的沪市 ETF。');
    }
  };
  const choices =
    submitted && query.data && !query.isError ? referenceContractChoices(query.data) : [];
  const needle = filter.trim().toLocaleLowerCase();
  const items = choices.filter((item) =>
    `${item.label} ${item.value} ${item.description}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <Section>
      <Field
        label={kind === 'future' ? '期货代码' : '期权合约代码'}
        value={value}
        onChange={(next) => {
          onChange(next);
          setFilter(next);
        }}
      />
      <Copy muted>仅搜索已读取的本页清单，代码仍可手工填写；来源日期不代表当前可交易。</Copy>
      {kind === 'future' ? (
        <>
          <Choices
            label="合约清单来源"
            value={source}
            options={referenceContractSources(kind)}
            onChange={(next) => {
              setSource(next);
              reset();
            }}
          />
          <Field
            label="合约清单交易日 YYYY-MM-DD"
            value={date}
            onChange={(next) => {
              setDate(next);
              reset();
            }}
          />
        </>
      ) : (
        <>
          <InstrumentPicker
            purpose="browse"
            label="期权标的 ETF"
            value={underlying}
            onInputChange={(next) => {
              setUnderlying(next);
              reset();
            }}
            markets={['SH']}
            instrumentTypes={['ETF']}
            accepts={(item) => isReferenceOptionUnderlying(item.symbol)}
            onConfirmed={(item) => {
              setUnderlying(item.symbol);
              reset();
            }}
          />
          <Copy muted>读取所选 ETF 当前近月的认购、认沽清单，不扫描其他月份。</Copy>
        </>
      )}
      <Feedback message={error} error />
      <Action
        label={query.isFetching ? '正在读取合约…' : '读取合约清单'}
        disabled={query.isFetching}
        onPress={read}
      />
      {submitted && (
        <QueryList
          query={query}
          retry={() => void query.refetch()}
          empty={query.isSuccess && !items.length}
          label="正在刷新合约清单"
        >
          {items.map((item) => (
            <Section key={item.id}>
              <Copy>{item.label}</Copy>
              <Copy muted>{item.description}</Copy>
              <Action
                label={`选择 ${item.label}`}
                disabled={query.isFetching || query.isError}
                onPress={() => {
                  onChange(item.value);
                  setFilter(item.value);
                }}
              />
            </Section>
          ))}
        </QueryList>
      )}
      {query.data &&
        submitted &&
        !choices.length &&
        query.data.items.length > 0 &&
        !query.isError && <Copy muted>本页来源代码不符合当前查询格式，未推断转换。</Copy>}
      {query.data && submitted && !query.isError && (
        <>
          <Copy muted>
            {marketReferenceCatalog[query.data.dataset].label} ·{' '}
            {query.data.start || query.data.symbol} · 抓取于 {query.data.fetchedAt}。本页{' '}
            {choices.length} 条可选合约，清单可随来源变化。
          </Copy>
          <Copy>第 {submitted.page} 页</Copy>
          <Action
            label="上一页合约"
            disabled={query.isFetching || submitted.page === 1}
            onPress={() => {
              setFilter('');
              setSubmitted({ ...submitted, page: submitted.page - 1 });
            }}
          />
          <Action
            label="下一页合约"
            disabled={query.isFetching || !query.data.hasMore || submitted.page >= 1000}
            onPress={() => {
              setFilter('');
              setSubmitted({ ...submitted, page: submitted.page + 1 });
            }}
          />
        </>
      )}
    </Section>
  );
}
