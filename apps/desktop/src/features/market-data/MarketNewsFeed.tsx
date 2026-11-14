import { Spinner } from '@/components/ui/spinner';
import { useState, type FormEvent } from 'react';
import {
  marketNewsFeedReadInputSchema,
  type MarketNewsFeedReadInput,
} from '@thesis-ledger/schemas';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { fetchMarketNewsFeed } from './market-news-feed.api.js';
import { newsSourceLabels } from './MarketNewsResult.js';
import { MarketNewsPages } from './MarketNewsPages.js';
import { useMarketNewsPages } from './useMarketNewsPages.js';
import { MarketNewsTimeRangeField, defaultMarketNewsTimeRange, resolveMarketNewsTimeRange } from './MarketNewsTimeRangeField.js';

export function MarketNewsFeed() {
  const [provider, setProvider] = useState('cls');
  const [range, setRange] = useState(defaultMarketNewsTimeRange);
  const [validation, setValidation] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<MarketNewsFeedReadInput | null>(null);
  const query = useMarketNewsPages('market-news-feed', submitted, fetchMarketNewsFeed);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const input = marketNewsFeedReadInputSchema.parse({
        market: 'CN',
        providerId: provider,
        ...resolveMarketNewsTimeRange(range),
        limit: 5,
        requestBudgetMs: 15_000,
      });
      setValidation(null);
      if (JSON.stringify(submitted) === JSON.stringify(input)) void query.refetch();
      else setSubmitted(input);
    } catch (error) {
      setValidation(error instanceof Error ? error.message : '请核对时间范围。');
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FieldGroup>
          <Field>
            <FieldLabel id="market-news-feed-source-label">快讯来源</FieldLabel>
            <ToggleGroup
              aria-labelledby="market-news-feed-source-label"
              value={[provider]}
              onValueChange={(values) => {
                if (!values[0]) return;
                setProvider(values[0]);
                setSubmitted(null);
                setValidation(null);
              }}
            >
              {['cls', 'wallstreetcn'].map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {newsSourceLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <MarketNewsTimeRangeField value={range} onChange={(value) => {
            setRange(value);
            setSubmitted(null);
            setValidation(null);
          }} />
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          财联社为全市场电报，华尔街见闻为 A 股频道。每次最多 5 条，不代表区间内完整历史，不会自动关联到某只股票。
        </p>
        <Button aria-busy={query.isFetching} type="submit" disabled={query.isFetching}>
          {query.isLoading && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {query.isFetching ? '正在读取…' : '读取快讯'}
        </Button>
      </form>
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
      {query.isError && !query.data && (
        <Alert variant="destructive">
          <AlertTitle>快讯未读取</AlertTitle>
          <AlertDescription>{requestFailureMessage(query.error)} 可保留来源重试。</AlertDescription>
        </Alert>
      )}
      <MarketNewsPages result={query.result} loading={query.isFetching} hasNext={query.hasNextPage}
        nextError={query.isFetchNextPageError} heading="市场快讯" onMore={() => void query.fetchNextPage()} />
    </div>
  );
}
