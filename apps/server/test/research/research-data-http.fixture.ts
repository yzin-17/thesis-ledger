import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  marketCacheContextRequestV3Schema,
  marketNewsRequestV3Schema,
  type MarketNewsResponseV3,
} from '@thesis-ledger/schemas';
import { quoteControlFixture } from '../market/quote-control-fixture.js';
import { deferred } from '../ai/ai-provider-postgres.fixture.js';

export const researchFixtureNow = '2026-10-19T12:00:00.000Z';
type DataMode =
  | 'available'
  | 'not_admitted'
  | 'untrusted_source_text'
  | 'hold-quote'
  | 'quote-failed'
  | 'hold-nav'
  | 'nav-stale'
  | 'nav-future';
const samples = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/news-search-v1.samples.json', import.meta.url),
    'utf8',
  ),
) as { samples: Array<{ name: string; response: MarketNewsResponseV3 | null }> };
const currentQuote = () => ({
  version: 3,
  symbol: '600519.SH',
  open: 100,
  high: 100,
  low: 100,
  price: 100,
  previousClose: 100,
  volume: 10,
  amount: 1_000,
  provider: 'controlled-data',
  upstreamSource: 'controlled-prices',
  marketTime: '2026-10-19T11:59:00Z',
  fetchedAt: '2026-10-19T11:59:01Z',
  freshness: 'live',
  stale: false,
  units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' },
});

export async function createResearchDataHttpFixture() {
  let mode: DataMode = 'available';
  let quoteStarted = deferred();
  let held: ServerResponse | undefined;
  let heldValue: unknown;
  let aborted = 0;
  const calls: Array<{ path: string; body: unknown; dataAuthorized: boolean }> = [];
  const send = (response: ServerResponse, value: unknown, status = 200) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    const body: unknown = text ? JSON.parse(text) : null;
    calls.push({
      path: request.url ?? '/',
      body,
      dataAuthorized: request.headers.authorization === 'Bearer controlled-data-token',
    });
    if (url.pathname.endsWith('/cache-context')) {
      send(response, await quoteControlFixture(marketCacheContextRequestV3Schema.parse(body)));
      return;
    }
    if (url.pathname.endsWith('/quote')) {
      if (mode === 'hold-quote') {
        held = response;
        heldValue = currentQuote();
        response.once('close', () => {
          if (!response.writableEnded) aborted += 1;
        });
        quoteStarted.resolve();
        return;
      }
      if (mode === 'quote-failed') {
        send(response, { detail: { code: 'unavailable', message: '受控报价不可用' } }, 503);
        return;
      }
      send(response, currentQuote());
      return;
    }
    if (url.pathname.endsWith('/fund-nav')) {
      const nav = {
        version: 3,
        symbol: url.searchParams.get('symbol'),
        unitNav: 1.2345,
        navDate: '2026-10-18T00:00:00Z',
        provider: 'controlled-nav',
        fetchedAt: mode === 'nav-future' ? '2026-10-20T00:00:00Z' : '2026-10-19T11:59:00Z',
        freshness: mode === 'nav-stale' ? 'stale' : 'delayed',
      };
      if (mode === 'hold-nav') {
        held = response;
        heldValue = nav;
        response.once('close', () => {
          if (!response.writableEnded) aborted += 1;
        });
        quoteStarted.resolve();
        return;
      }
      send(response, nav);
      return;
    }
    if (url.pathname.endsWith('/news')) {
      const input = marketNewsRequestV3Schema.parse(body);
      let name = 'available';
      if (mode === 'not_admitted' || input.instrument.assetType === 'MUTUAL_FUND')
        name = 'not_admitted';
      else if (mode === 'untrusted_source_text') name = mode;
      const sample = samples.samples.find((value) => value.name === name)?.response;
      if (!sample) throw new Error('新闻共享样例缺失');
      const value = structuredClone(sample);
      value.requestId = input.requestId;
      value.instrument = input.instrument;
      value.coverage.publishedStart = input.publishedStart;
      value.coverage.publishedEnd = input.publishedEnd;
      send(response, value);
      return;
    }
    send(response, {}, 404);
  };
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => send(response, {}, 500));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('受控数据服务启动失败');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
    setMode(value: DataMode) {
      mode = value;
      calls.length = 0;
      quoteStarted = deferred();
      held = undefined;
      aborted = 0;
    },
    quoteStarted: () => quoteStarted.promise,
    navStarted: () => quoteStarted.promise,
    aborted: () => aborted,
    release() {
      if (held && !held.destroyed) send(held, heldValue);
      held = undefined;
    },
    async close() {
      held?.destroy();
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
