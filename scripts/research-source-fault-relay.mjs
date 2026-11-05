import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

export const sourceFaultModel = '@cf/qwen/qwen3.8-27b';
export const sourceFaultNewsPath = '/api/v3/thesis-ledger/market/news';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const dateInShanghai = (value) =>
  new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10);

export function assertSourceFaultRequest(body, scope) {
  assert.deepEqual(body.instrument, { market: 'CN', assetType: 'STOCK', symbol: '600519.SH' });
  assert.equal(body.limit, 10);
  assert.equal(body.cursor, null);
  assert(dateInShanghai(body.publishedStart) >= scope.start);
  assert(dateInShanghai(body.publishedEnd) <= scope.end);
}

export async function createSourceFaultRelay({
  dsaBase,
  aiBase,
  scope,
  live,
  validateNews = (value) => value,
  onEvent = () => {},
}) {
  if (live) assert.equal(new URL(aiBase).origin, 'https://api.cloudflare.com');
  let scenario = 'timeout';
  const counts = { news: 0, ai: 0 };
  const events = [];
  const event = (value) => {
    const row = { at: new Date().toISOString(), scenario, ...value };
    events.push(row);
    onEvent(row);
  };
  const send = (response, status, value) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  const server = createServer((request, response) => {
    const requestScenario = scenario;
    const log = (value) => event({ scenario: requestScenario, ...value });
    void (async () => {
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
        assert(chunks.reduce((sum, item) => sum + item.length, 0) <= 2 * 1024 * 1024);
      }
      const bytes = Buffer.concat(chunks);
      const body = bytes.length ? JSON.parse(bytes) : null;
      const ai = path === '/cloudflare/v1/chat/completions';
      const news = path === sourceFaultNewsPath;
      if (ai) {
        assert.equal(request.method, 'POST');
        assert.equal(body.model, sourceFaultModel);
        assert.equal(body.stream, true);
        assert.equal(requestScenario, 'partial');
        assert(counts.ai < 1, '模型请求超出单次预算');
        counts.ai += 1;
      } else if (news) {
        assert.equal(request.method, 'POST');
        assertSourceFaultRequest(body, scope);
        if (live) assert(Date.parse(scope.validUntil) > Date.now(), '单源准入已到期');
        assert(counts.news < 2, '新闻请求超出两次预算');
        assert(
          !events.some((row) => row.scenario === requestScenario && row.kind === 'news-dispatch'),
          '同一样本不得重发新闻',
        );
        counts.news += 1;
      } else {
        assert(
          [
            '/api/v3/thesis-ledger/market/cache-context',
            '/api/v3/thesis-ledger/market/quote',
          ].includes(path),
          '中继路径不在只读白名单',
        );
        assert(['GET', 'POST'].includes(request.method));
        if (body?.symbol) assert.equal(body.symbol, '600519.SH');
        const symbol = new URL(request.url, 'http://127.0.0.1').searchParams.get('symbol');
        if (symbol) assert.equal(symbol, '600519.SH');
      }
      const kind = ai ? 'ai' : news ? 'news' : 'price';
      log({ kind: `${kind}-dispatch`, method: request.method, path, requestSha256: digest(bytes) });
      const destination = ai
        ? `${aiBase.replace(/\/$/, '')}/chat/completions`
        : `${dsaBase.replace(/\/$/, '')}${request.url}`;
      const headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([key]) =>
            ![
              'host',
              'connection',
              'content-length',
              'transfer-encoding',
              'accept-encoding',
            ].includes(key),
        ),
      );
      const cancelled = new AbortController();
      response.once('close', () => cancelled.abort('所属验收调用已结束'));
      const upstream = await fetch(destination, {
        method: request.method,
        headers,
        ...(bytes.length ? { body: bytes } : {}),
        redirect: 'error',
        signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(ai ? 600000 : 120000)]),
      });
      if (news) {
        const parts = [];
        let length = 0;
        for await (const part of upstream.body ?? []) {
          length += part.length;
          assert(length <= 2 * 1024 * 1024);
          parts.push(part);
        }
        const raw = Buffer.concat(parts);
        assert.equal(upstream.status, 200, '真实新闻未成功，不注入交付故障');
        const value = validateNews(JSON.parse(raw), body);
        if (live) {
          assert.equal(value.route?.providerId, 'hithink');
          assert.equal(value.route?.upstreamSource, 'hithink-news-stock-timeline');
        }
        assert(value.items.length > 0 && value.items.length <= 10);
        log({
          kind: 'news-upstream-complete',
          status: upstream.status,
          items: value.items.length,
          responseSha256: digest(raw),
          providerId: value.route.providerId,
          upstreamSource: value.route.upstreamSource,
        });
        if (requestScenario === 'partial') {
          log({ kind: 'news-delivery-disconnected' });
          response.destroy();
        } else {
          response.once('close', () =>
            log({ kind: 'news-delivery-closed', completed: response.writableEnded }),
          );
        }
        return;
      }
      if (ai) log({ kind: 'ai-upstream-headers', status: upstream.status });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      });
      const hash = createHash('sha256');
      let length = 0;
      for await (const chunk of upstream.body ?? []) {
        length += chunk.length;
        assert(length <= 16 * 1024 * 1024);
        hash.update(chunk);
        response.write(chunk);
      }
      response.end();
      log({
        kind: `${kind}-complete`,
        status: upstream.status,
        bytes: length,
        responseSha256: hash.digest('hex'),
      });
    })().catch((error) => {
      log({
        kind: 'relay-rejected',
        error: error instanceof assert.AssertionError ? error.message : error.name,
      });
      if (!response.destroyed && !response.headersSent)
        send(response, 502, { error: '所属验收中继拒绝请求' });
      else response.destroy();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    events,
    counts,
    setScenario(value) {
      assert(['timeout', 'partial'].includes(value));
      scenario = value;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
