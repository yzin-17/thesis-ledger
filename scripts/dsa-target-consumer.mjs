import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
require('reflect-metadata');
const { DsaClient } = require('./dist/src/integration/dsa/dsa.client.js');
const { DsaNavClient } = require('./dist/src/integration/dsa/dsa-nav-client.js');
const { readSecurityLotSize } = require('./dist/src/integration/dsa/dsa-security-lot-size.js');
const { marketEventExchangeV3Schema } = require('@thesis-ledger/schemas');

export function consumeEventExchange(exchange) {
  marketEventExchangeV3Schema.parse(exchange);
  return { parsed: true, facts: exchange.response.facts.length };
}

function consume(client, nav, item) {
  switch (item.client) {
    case 'marketBarsV3':
    case 'marketChartBarsV3':
    case 'marketEventsV3':
    case 'marketPublicFeesV3':
    case 'calculateIndicators':
      return client[item.client](item.body);
    case 'marketNavInputsV3':
      return nav.read(item.body);
    case 'marketCalendar':
    case 'backtestCalendar':
      return client[item.client](item.query);
    case 'fxRates':
      return client.fxRates({ baseCurrency: 'CNY', currencies: ['USD', 'CNY'], asOf: '2026-10-16' });
    case 'securityLotSize':
      if (item.status !== 200) return client.post(item.path, item.body, 1);
      return readSecurityLotSize(client, '00700.HK');
    default:
      throw new Error(`未登记的 DSA 消费接口：${item.client}`);
  }
}

export async function consumeDsaCases(origin, cases) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const config = { dsaBaseUrl: origin, dsaTimeoutMs: 15000,
    dsaToken: 'data-runtime-controlled-token', dsaControlToken: 'data-runtime-controlled-control' };
  const client = Object.assign(Object.create(DsaClient.prototype), { config });
  const nav = Object.assign(Object.create(DsaNavClient.prototype), { config });
  const results = [];
  for (const item of cases) {
    const pending = Promise.resolve().then(() => consume(client, nav, item));
    if (item.status === 200) assert(await pending, `${item.client} 正向消费失败`);
    else await assert.rejects(pending, undefined, `${item.client} 必须拒绝`);
    results.push({ client: item.client, expectedHttpStatus: item.status, passed: true });
  }
  return results;
}
