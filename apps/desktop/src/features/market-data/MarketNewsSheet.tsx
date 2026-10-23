import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketNewsReadInputSchema, type MarketNewsReadInput } from '@thesis-ledger/schemas';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { fetchMarketNews } from './market-news.api.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NewsResult } from './MarketNewsResult.js';
import { MarketNewsFeed } from './MarketNewsFeed.js';

function NewsSearch() {
  const [symbol, setSymbol] = useState('600519.SH');
  const [submitted, setSubmitted] = useState<MarketNewsReadInput | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['desktop', 'market-news', submitted],
    queryFn: ({ signal }) => fetchMarketNews(submitted!, signal),
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
    const canonical = symbol.trim().toUpperCase();
    let market: 'CN' | 'US';
    if (/^\d{6}\.(SH|SZ|BJ)$/.test(canonical)) {
      market = 'CN';
    } else if (/^[A-Z][A-Z0-9.-]*\.US$/.test(canonical)) {
      market = 'US';
    } else {
      setValidation('请输入规范股票代码，例如 600519.SH 或 NVDA.US。');
      return;
    }
    const checked = marketNewsReadInputSchema.safeParse({
      instrument: { symbol: canonical, market, assetType: 'STOCK' },
      publishedStart: new Date(end.getTime() - 3 * 86_400_000).toISOString(),
      publishedEnd: end.toISOString(),
      limit: 5,
      requestBudgetMs: 15_000,
    });
    if (!checked.success) {
      setValidation('请输入规范股票代码，例如 600519.SH 或 NVDA.US。');
      return;
    }
    setValidation(null);
    setSubmitted(checked.data);
  };
  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="market-news-symbol">股票代码</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="market-news-symbol"
                value={symbol}
                autoComplete="off"
                onChange={(event) => {
                  setSymbol(event.target.value);
                  setSubmitted(null);
                  setValidation(null);
                }}
              />
              <Button type="submit" disabled={query.isFetching}>
                {query.isFetching ? '正在读取…' : '读取新闻'}
              </Button>
            </div>
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          最近 3 天，最多 5 条。当前已核验 600519.SH 与 NVDA.US，数据来源以本次结果为准。
        </p>
      </form>
      {validation && (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      {query.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取新闻…
        </p>
      )}
      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>新闻未读取</AlertTitle>
          <AlertDescription>{requestFailureMessage(query.error)} 可保留代码重试。</AlertDescription>
        </Alert>
      )}
      {query.data && <NewsResult result={query.data} heading={query.data.instrument.symbol} />}
    </div>
  );
}

export function MarketNewsSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>新闻</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>新闻与快讯</SheetTitle>
          <SheetDescription>
            个股新闻与市场快讯分别读取，展示实际来源、标题与引用链接。NVIDIA
            官方订阅限个人非商业用途。
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {open && (
            <Tabs defaultValue="stock">
              <TabsList aria-label="新闻类型">
                <TabsTrigger value="stock">个股新闻</TabsTrigger>
                <TabsTrigger value="feed">市场快讯</TabsTrigger>
              </TabsList>
              <TabsContent value="stock">
                <NewsSearch />
              </TabsContent>
              <TabsContent value="feed">
                <MarketNewsFeed />
              </TabsContent>
            </Tabs>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
