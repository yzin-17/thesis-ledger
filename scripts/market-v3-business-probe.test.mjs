import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { probeMarketV3Business } from './market-v3-business-probe.mjs';

const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const at = '2026-05-20T07:00:00.000Z';

async function environment({ barStatus = 200 } = {}) {
  const calls = [];
  const barRequest = await fixture('market-data-v3.request.etf-qfq-target-pinned.json');
  const barResponse = await fixture('market-data-v3.response.etf-qfq.json');
  const nav = {
    version: 3,
    symbol: '000001.OF',
    unitNav: 1.2,
    navDate: at,
    provider: 'fixture',
    fetchedAt: at,
    freshness: 'delayed',
  };
  return {
    calls,
    options: {
      origin: 'http://localhost:8765',
      dataToken: 'local-fixture-data',
      barRequest,
      fetchImpl: async (url, init) => {
        calls.push({ path: url.pathname, search: url.search, ...init });
        if (url.pathname.endsWith('/market/quote'))
          return Response.json({
            version: 3,
            symbol: url.searchParams.get('symbol'),
            open: 10,
            high: 11,
            low: 9,
            price: 10,
            previousClose: 10,
            volume: 100,
            amount: 1000,
            stale: false,
            provider: 'fixture',
            fetchedAt: at,
            marketTime: at,
            freshness: 'delayed',
          });
        if (url.pathname.endsWith('/market/fund-nav')) return Response.json(nav);
        if (url.pathname.endsWith('/market/fund-nav/history')) return Response.json([nav]);
        if (url.pathname.endsWith('/market/fund-holdings'))
          return Response.json({
            version: 3,
            fundSymbol: '000001.OF',
            reportPeriod: '2026-Q1',
            disclosureDate: null,
            provider: 'fixture',
            fetchedAt: at,
            evidenceVersion: 'fixture',
            holdings: [],
          });
        if (url.pathname.endsWith('/market/fx-rates'))
          return Response.json({
            version: 3,
            baseCurrency: 'CNY',
            asOf: '2026-05-20',
            fetchedAt: at,
            maxAgeDays: 3,
            rates: [
              {
                fromCurrency: 'CNY',
                toCurrency: 'CNY',
                rate: 1,
                freshness: 'live',
                stale: false,
                ageDays: 0,
                available: true,
              },
            ],
          });
        if (url.pathname.endsWith('/market/chip'))
          return Response.json({
            version: 3,
            symbol: '600519.SH',
            averageCost: 10,
            profitRatio: 0.5,
            range70: [9, 11],
            range90: [8, 12],
            concentration: 0.5,
            provider: 'fixture',
            engineVersion: 'fixture',
            calculatedAt: at,
          });
        if (barStatus !== 200)
          return Response.json({ private: 'SECRET_BODY' }, { status: barStatus });
        return Response.json({ ...barResponse, requestId: JSON.parse(init.body).requestId });
      },
    },
  };
}

test('V3 业务探针验证真实读取所需的当前 Data 路径与完整 Bar 合同', async () => {
  const f = await environment();
  const result = await probeMarketV3Business(f.options);
  assert.equal(result.scope, 'market-v3-business-read');
  assert.equal(result.barCount, 3);
  assert.equal(f.calls.length, 8);
  assert.ok(f.calls.every((call) => call.headers.authorization === 'Bearer local-fixture-data'));
  assert.ok(f.calls.every((call) => call.path.startsWith('/api/v3/thesis-ledger/')));
  assert.ok(
    f.calls.every((call) => call.redirect === 'error' && call.signal instanceof AbortSignal),
  );
  const barCall = f.calls.at(-1);
  assert.equal(barCall.path, '/api/v3/thesis-ledger/market/bars');
  assert.equal(JSON.parse(barCall.body).routeTarget.providerId, 'hithink');
});

test('Bar 来源未准入时业务探针失败且不输出上游响应体或凭据', async () => {
  const f = await environment({ barStatus: 422 });
  await assert.rejects(probeMarketV3Business(f.options), (error) => {
    assert.match(error.message, /market\/bars.*422/);
    assert.ok(!error.message.includes('SECRET_BODY'));
    assert.ok(!error.message.includes(f.options.dataToken));
    return true;
  });
});
