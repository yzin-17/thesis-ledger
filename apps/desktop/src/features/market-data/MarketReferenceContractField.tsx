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
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { InstrumentSearchCombobox } from './InstrumentSearchCombobox.js';
import { InstrumentSymbolField } from './InstrumentSymbolField.js';

/** Contracts come from a user-requested reference page, never from fabricated Instrument rows. */
export function MarketReferenceContractField({
  kind,
  value,
  onChange,
}: {
  kind: ReferenceContractKind;
  value: string;
  onChange: (value: string) => void;
}) {
  const [source, setSource] = useState<ReferenceContractSource>(
    kind === 'future' ? 'futures-daily-shfe' : 'etf-option-contracts',
  );
  const [date, setDate] = useState('');
  const [underlying, setUnderlying] = useState('');
  const [submitted, setSubmitted] = useState<MarketReferenceInput | null>(null);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['desktop', 'market-reference', 'contract-choices', submitted],
    enabled: Boolean(submitted),
    queryFn: ({ signal }) => getDesktopApiClient().market.getReference(submitted!, signal),
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const reset = () => {
    setSubmitted(null);
    setError(null);
    setOpen(false);
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
  const items = choices
    .filter((item) =>
      `${item.label} ${item.value} ${item.description}`.toLocaleLowerCase().includes(needle),
    )
    .map((item) => ({
      id: item.id,
      symbol: item.value,
      displayName: `${item.label} · ${item.description}`,
      market: '',
    }));
  let status = '先选择来源条件，读取合约清单后搜索选择。';
  if (query.isError) status = '合约清单读取失败，请重新读取。';
  else if (submitted && query.isSuccess && !choices.length && query.data.items.length)
    status = '本页来源代码不符合当前查询格式，未推断转换。';
  else if (submitted && query.isSuccess && !items.length)
    status = '本页没有匹配的可用合约；可翻页或保留手工代码。';
  else if (items.length) status = '';
  const label = kind === 'future' ? '期货代码' : '期权合约代码';
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="reference-symbol">{label}</FieldLabel>
        <InstrumentSearchCombobox
          id="reference-symbol"
          label={label}
          input={value}
          items={items}
          busy={query.isFetching}
          status={status}
          open={open}
          onOpenChange={setOpen}
          onInputChange={(next) => {
            onChange(next);
            setFilter(next);
          }}
          onSelect={(item) => {
            onChange(item.symbol);
            setFilter('');
            setOpen(false);
          }}
          onRetry={query.isError ? read : undefined}
        />
        <FieldDescription>
          仅搜索已读取的本页清单，代码仍可手工填写；来源日期不代表当前可交易。
        </FieldDescription>
      </Field>
      {kind === 'future' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>清单来源</FieldLabel>
            <Select
              value={source}
              items={referenceContractSources(kind)}
              onValueChange={(next) => {
                if (next) {
                  setSource(next);
                  reset();
                }
              }}
            >
              <SelectTrigger aria-label="合约清单来源">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {referenceContractSources(kind).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>清单交易日</FieldLabel>
            <DateInput
              aria-label="合约清单交易日"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                reset();
              }}
            />
          </Field>
        </div>
      ) : (
        <Field>
          <FieldLabel>期权标的 ETF</FieldLabel>
          <InstrumentSymbolField
            aria-label="期权标的 ETF"
            value={underlying}
            markets={['SH']}
            instrumentTypes={['ETF']}
            accepts={(item) => isReferenceOptionUnderlying(item.symbol)}
            onChange={(next) => {
              setUnderlying(next);
              reset();
            }}
          />
          <FieldDescription>
            读取所选 ETF 当前近月的认购、认沽清单，不扫描其他月份。
          </FieldDescription>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={read}
          aria-busy={query.isFetching}
        >
          {query.isFetching ? '正在读取合约…' : '读取合约清单'}
        </Button>
        {query.data && submitted && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={query.isFetching || submitted.page === 1}
              onClick={() => {
                setFilter('');
                setSubmitted({ ...submitted, page: submitted.page - 1 });
              }}
            >
              上一页合约
            </Button>
            <span className="text-xs text-muted-foreground">第 {submitted.page} 页</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={query.isFetching || !query.data.hasMore || submitted.page >= 1000}
              onClick={() => {
                setFilter('');
                setSubmitted({ ...submitted, page: submitted.page + 1 });
              }}
            >
              下一页合约
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {requestFailureMessage(query.error)}
        </p>
      )}
      {query.data && submitted && !query.isError && (
        <p className="text-xs text-muted-foreground">
          {marketReferenceCatalog[query.data.dataset].label} ·{' '}
          {query.data.start || query.data.symbol} · 抓取于 {query.data.fetchedAt}。本页{' '}
          {choices.length} 条可选合约，清单可随来源变化。
        </p>
      )}
    </FieldGroup>
  );
}
