import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { NewsResult, newsSourceLabels } from './MarketNewsResult.js';

export function MarketNewsFeed() {
  const [provider, setProvider] = useState('cls');
  const [submitted, setSubmitted] = useState<MarketNewsFeedReadInput | null>(null);
  const query = useQuery({
    queryKey: ['desktop', 'market-news-feed', submitted],
    queryFn: ({ signal }) => fetchMarketNewsFeed(submitted!, signal),
    enabled: submitted !== null,
    retry: false,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const end = new Date();
    setSubmitted(
      marketNewsFeedReadInputSchema.parse({
        market: 'CN',
        providerId: provider,
        publishedStart: new Date(end.getTime() - 3 * 86_400_000).toISOString(),
        publishedEnd: end.toISOString(),
        limit: 5,
        requestBudgetMs: 15_000,
      }),
    );
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
              }}
            >
              {['cls', 'wallstreetcn'].map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {newsSourceLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
        财联社为全市场电报，华尔街见闻为 A 股频道。读取最近 3 天内的当前一页，最多 5 条，不会自动关联到某只股票。
        </p>
        <Button type="submit" disabled={query.isFetching}>
          {query.isFetching ? '正在读取…' : '读取快讯'}
        </Button>
      </form>
      {query.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取市场快讯…
        </p>
      )}
      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>快讯未读取</AlertTitle>
          <AlertDescription>{requestFailureMessage(query.error)} 可保留来源重试。</AlertDescription>
        </Alert>
      )}
      {query.data && <NewsResult result={query.data} heading="市场快讯" />}
    </div>
  );
}
