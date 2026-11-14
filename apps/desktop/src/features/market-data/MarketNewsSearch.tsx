import { useState, type FormEvent } from 'react';
import { marketNewsReadInputSchema, type MarketNewsReadInput } from '@thesis-ledger/schemas';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { fetchMarketNews } from './market-news.api.js';
import { InstrumentSymbolField } from './InstrumentSymbolField.js';
import { MarketNewsPages } from './MarketNewsPages.js';
import { useMarketNewsPages } from './useMarketNewsPages.js';
import { MarketNewsTimeRangeField, defaultMarketNewsTimeRange, resolveMarketNewsTimeRange } from './MarketNewsTimeRangeField.js';

export function MarketNewsSearch() {
  const [symbol, setSymbol] = useState('');
  const [range, setRange] = useState(defaultMarketNewsTimeRange);
  const [submitted, setSubmitted] = useState<MarketNewsReadInput | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const query = useMarketNewsPages('market-news', submitted, fetchMarketNews);
  const clear = () => { setSubmitted(null); setValidation(null); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const canonical = symbol.trim().toUpperCase();
    let market: 'CN' | 'US';
    if (/^\d{6}\.(SH|SZ|BJ)$/.test(canonical)) market = 'CN';
    else if (/^[A-Z][A-Z0-9.-]*\.US$/.test(canonical)) market = 'US';
    else {
      setValidation('请选择股票或填写有效的完整代码。');
      return;
    }
    try {
      const checked = marketNewsReadInputSchema.safeParse({
        instrument: { symbol: canonical, market, assetType: 'STOCK' },
        ...resolveMarketNewsTimeRange(range),
        limit: 5,
        requestBudgetMs: 15_000,
      });
      if (!checked.success) {
        setValidation('请核对股票代码和时间范围。');
        return;
      }
      setValidation(null);
      if (JSON.stringify(submitted) === JSON.stringify(checked.data)) void query.refetch();
      else setSubmitted(checked.data);
    } catch (error) {
      setValidation(error instanceof Error ? error.message : '请核对时间范围。');
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="market-news-symbol">股票代码</FieldLabel>
            <InstrumentSymbolField
              id="market-news-symbol"
              aria-label="股票代码"
              markets={['SH', 'SZ', 'BJ', 'US']}
              instrumentTypes={['STOCK']}
              value={symbol}
              onChange={(value) => { setSymbol(value); clear(); }}
            />
          </Field>
          <MarketNewsTimeRangeField value={range} onChange={(value) => { setRange(value); clear(); }} />
        </FieldGroup>
        <Button aria-busy={query.isFetching} type="submit" disabled={query.isFetching}>
          {query.isLoading && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {query.isFetching ? '正在读取…' : '读取新闻'}
        </Button>
      </form>
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
      {query.isError && !query.data && (
        <Alert variant="destructive">
          <AlertTitle>新闻未读取</AlertTitle>
          <AlertDescription>{requestFailureMessage(query.error)} 可保留代码重试。</AlertDescription>
        </Alert>
      )}
      <MarketNewsPages result={query.result} loading={query.isFetching} hasNext={query.hasNextPage}
        nextError={query.isFetchNextPageError} heading={submitted?.instrument.symbol ?? symbol}
        onMore={() => void query.fetchNextPage()} />
    </div>
  );
}
