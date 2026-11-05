import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  marketReferenceCatalog,
  marketReferenceOptions,
  marketReferenceInputSchema,
  marketReferenceIndexInfo,
  marketReferenceCodeInput,
  type MarketReferenceDataset,
  type MarketReferenceInput,
} from '@thesis-ledger/schemas';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { MarketReferenceResult } from './MarketReferenceResult.js';

function ReferenceQuery() {
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
    queryKey: ['desktop', 'market-reference', submitted],
    enabled: submitted !== null,
    queryFn: ({ signal }) => {
      if (!submitted) throw new Error('请先选择查询条件');
      return getDesktopApiClient().market.getReference(submitted, signal);
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
    <div className="flex min-w-0 flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel id="reference-type-label">资料类型</FieldLabel>
            <Select
              value={dataset}
              items={marketReferenceOptions}
              onValueChange={(value) => {
                if (value && value in marketReferenceCatalog) {
                  setDataset(value);
                  setStart('');
                  setEnd('');
                  clear();
                }
              }}
            >
              <SelectTrigger aria-labelledby="reference-type-label" className="w-full">
                <SelectValue>{entry.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {marketReferenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {codeInput ? (
            <Field>
              <FieldLabel htmlFor="reference-symbol">{codeInput.label}</FieldLabel>
              <Input
                id="reference-symbol"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  clear();
                }}
                autoComplete="off"
              />
              <FieldDescription>{codeInput.example}</FieldDescription>
            </Field>
          ) : null}
          {entry.scope === 'index' ? <p className="text-sm">指数：{index?.label}</p> : null}
          {entry.dateFilter ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="reference-start">起始日期</FieldLabel>
                <Input
                  id="reference-start"
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    clear();
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="reference-end">截止日期</FieldLabel>
                <Input
                  id="reference-end"
                  type="date"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    clear();
                  }}
                />
              </Field>
            </div>
          ) : null}
        </FieldGroup>
        <Button type="submit" disabled={query.isFetching}>
          {query.isFetching ? '正在读取资料…' : '查询资料'}
        </Button>
      </form>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {query.isFetching ? <p role="status">正在读取来源，请稍候。</p> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>资料暂未读到</AlertTitle>
          <AlertDescription>{requestFailureMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}
      {query.data ? <MarketReferenceResult result={query.data} /> : null}
      {query.data && submitted ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={!previous.length || query.isFetching}
            onClick={() => {
              const last = previous.at(-1);
              if (last) {
                setSubmitted(last);
                setPrevious((v) => v.slice(0, -1));
              }
            }}
          >
            上一页
          </Button>
          <span className="text-sm">第 {submitted.page} 页</span>
          <Button
            variant="outline"
            disabled={!query.data.hasMore || query.isFetching || submitted.page >= 1000}
            onClick={() => {
              setPrevious((v) => [...v, submitted]);
              setSubmitted({
                ...submitted,
                page: submitted.page + 1,
                cursor: query.data.nextCursor,
              });
            }}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MarketReferenceSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>市场资料</SheetTrigger>
      <SheetContent size="detail">
        <SheetHeader>
          <SheetTitle>市场资料查询</SheetTitle>
          <SheetDescription>
            按需查询财报、宏观和市场事实；每页五条，单位和覆盖范围以来源记录为准。
          </SheetDescription>
        </SheetHeader>
        <SheetBody>{open ? <ReferenceQuery /> : null}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
