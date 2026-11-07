import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { ArrowUpRightIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  marketAnnouncementSymbolSchema,
  marketNewsReadInputSchema,
  marketNewsDefaultWindowMs,
  marketNewsDefaultPageSize,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/date-display';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useResearchIdentity } from '../ai/research.queries.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import { NewsResult } from '../market-data/MarketNewsResult.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const types = { stock: 'STOCK', fund: 'MUTUAL_FUND', etf: 'ETF' } as const;
function SourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="inline-flex min-h-8 items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
      href={href} target="_blank" rel="noreferrer">
      {children}<ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
    </a>
  );
}
function Research({ position }: { position: MarketDetailPosition }) {
  const navigate = useNavigate();
  const api = getDesktopApiClient();
  const owner = useResearchIdentity();
  const mode = useOptionalPortfolioMode()?.mode ?? position.mode ?? 'actual';
  const kind = position.asset.assetType && types[position.asset.assetType];
  const lookup = useQuery({
    queryKey: ['desktop', 'instrument-identity', position.symbol, kind],
    enabled: !!kind && !position.instrumentId,
    queryFn: ({ signal }) => api.market.locateInstrument(position.symbol, kind!, signal),
    retry: false,
  });
  const id = position.instrumentId ?? lookup.data?.instrumentId;
  const reports = useQuery({
    queryKey: ['desktop', 'instrument-reports', owner, mode, id],
    enabled: !!id,
    placeholderData: () => undefined,
    queryFn: ({ signal }) =>
      api.research.list(
        { view: 'scoped', scope: 'instrument', mode, instrumentId: id!, limit: 5 },
        signal,
      ),
    retry: false,
  });
  if (!id || !kind) {
    if (lookup.error) return <p>{requestFailureMessage(lookup.error)}</p>;
    return lookup.isFetching ? <Spinner aria-label="正在读取目录身份" /> : <p>当前目录身份不可用。</p>;
  }
  const sep = position.symbol.lastIndexOf('.');
  const instrument = {
    id,
    symbol: position.symbol,
    canonicalCode: position.symbol.slice(0, sep),
    market: position.symbol.slice(sep + 1),
    instrumentType: kind,
    displayName: position.asset.name,
    confirmable: false,
  };
  return (
    <section className="grid gap-3">
      <Button
        size="sm" variant="outline" className="justify-self-start"
        onClick={() =>
          void navigate('/ai-chat', { state: { instrumentResearch: { owner, instrument } } })
        }
      >
        发起标的研究
      </Button>
      {reports.isLoading && <LoadingState label="正在读取报告" />}
      {reports.error && <p role="alert">{requestFailureMessage(reports.error)}</p>}
      <ListRefreshRegion refreshing={reports.isRefetching && !!reports.data} label="正在刷新研究报告">
        {reports.data?.items.length === 0 && <p>还没有这个标的的研究报告。</p>}
        {reports.data?.items.map((row) => (
          <article key={row.id} className="grid gap-1.5 border-b py-3">
            <Button
              variant="link" className="h-auto justify-start hover:no-underline whitespace-normal px-0 text-left leading-relaxed"
              onClick={() =>
                void navigate('/ai-chat?mode=reading&run=' + encodeURIComponent(row.id), {
                  state: { instrumentDetailOrigin: true },
                })
              }
            >
              {row.question ?? '查看报告'}
            </Button>
            <time className="text-xs tabular-nums text-muted-foreground">{formatDateTime(row.createdAt)}</time>
            <p>{row.summary ?? row.errorSummary ?? '暂无摘要'}</p>
          </article>
        ))}
      </ListRefreshRegion>
    </section>
  );
}
function News({ position }: { position: MarketDetailPosition }) {
  const [end] = useState(() => new Date());
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const { symbol, asset } = position;
  let market = 'CN';
  if (symbol.endsWith('.US')) market = 'US';
  else if (symbol.endsWith('.HK')) market = 'HK';
  const input = marketNewsReadInputSchema.safeParse({
    instrument: { symbol, market, assetType: asset.assetType && types[asset.assetType] },
    publishedStart: new Date(end.getTime() - marketNewsDefaultWindowMs).toISOString(),
    publishedEnd: end.toISOString(),
    limit: marketNewsDefaultPageSize,
    requestBudgetMs: 15000,
    cursor: cursors.at(-1),
  });
  const query = useQuery({
    queryKey: ['desktop', 'detail-news', input.data],
    enabled: input.success,
    queryFn: ({ signal }) => getDesktopApiClient().market.getNews(input.data!, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section>
      {!input.success && '当前资料身份不支持标的新闻。'}
      {query.isLoading && <LoadingState label="正在读取新闻" />}
      {query.error && <p role="alert">{requestFailureMessage(query.error)}</p>}
      {query.data && <NewsResult result={query.data} refreshing={query.isRefetching} heading={symbol} compact />}
      {query.data?.status === 'unavailable' && /^\d{6}\.OF$/.test(symbol) && (
        <SourceLink href={`https://fund.dayfund.com.cn/fundinfo/${symbol.slice(0, 6)}.html`}>基金速查网 · 历史相关报道</SourceLink>
      )}
      {cursors.length > 1 && (
        <Button onClick={() => setCursors((v) => v.slice(0, -1))}>上一页新闻</Button>
      )}
      {query.data?.nextCursor && (
        <Button onClick={() => setCursors((v) => [...v, query.data.nextCursor])}>下一页新闻</Button>
      )}
    </section>
  );
}
function Announcements({ symbol }: { symbol: string }) {
  const [page, setPage] = useState(1);
  const [window] = useState(() => {
    const end = new Date();
    return {
      end: end.toISOString().slice(0, 10),
      start: new Date(end.getTime() - 30 * 86400000).toISOString().slice(0, 10),
    };
  });
  const supported = marketAnnouncementSymbolSchema.safeParse(symbol).success;
  const query = useQuery({
    queryKey: ['desktop', 'detail-announcements', symbol, window, page],
    enabled: supported,
    queryFn: ({ signal }) =>
      getDesktopApiClient().market.getAnnouncements(
        { symbol, ...window, page, pageSize: 10 },
        signal,
      ),
    retry: false,
  });
  if (!supported) return <p>公告来源暂未覆盖该市场。</p>;
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <p className="text-xs leading-5 tabular-nums text-muted-foreground" aria-label="公告查询时间范围">
        查询范围 · {window.start} 至 {window.end}
      </p>
      {query.isLoading && <LoadingState label="正在读取公告" />}
      {query.error && <p role="alert">{requestFailureMessage(query.error)}</p>}
      <ListRefreshRegion refreshing={query.isRefetching && !!query.data} label="正在刷新公告">
        {query.data?.total === 0 && '该期间没有已收录公告。'}
        {query.data?.items.map((item) => (
          <article key={item.id} className="border-b border-border/70">
            <a className="grid gap-1.5 rounded-sm py-3.5 text-foreground hover:text-primary/80 focus-visible:outline-ring"
              href={item.url} target="_blank" rel="noreferrer">
              <time className="text-xs tabular-nums text-muted-foreground" dateTime={item.publishedDate}>{item.publishedDate}</time>
              <span className="text-sm font-medium leading-relaxed text-pretty">
                {item.title}
              </span>
            </a>
          </article>
        ))}
      </ListRefreshRegion>
      {symbol.endsWith('.OF') && (
        <SourceLink href={`https://fundf10.eastmoney.com/jjgg_${symbol.slice(0, 6)}.html`}>天天基金公告目录</SourceLink>
      )}
      {page > 1 && <Button onClick={() => setPage((v) => v - 1)}>上一页公告</Button>}
      {query.data && page * 10 < query.data.total && (
        <Button onClick={() => setPage((v) => v + 1)}>下一页公告</Button>
      )}
    </section>
  );
}
export function InstrumentReading({ position }: { position: MarketDetailPosition }) {
  return (
    <Tabs defaultValue="news" className="min-w-0">
      <TabsList aria-label="相关资讯" className="w-full">
        <TabsTrigger value="news">新闻</TabsTrigger>
        <TabsTrigger value="announcements">公告</TabsTrigger>
        <TabsTrigger value="research">研究</TabsTrigger>
      </TabsList>
      <TabsContent value="news"><News position={position} /></TabsContent>
      <TabsContent value="announcements"><Announcements symbol={position.symbol} /></TabsContent>
      <TabsContent value="research"><Research position={position} /></TabsContent>
    </Tabs>
  );
}
