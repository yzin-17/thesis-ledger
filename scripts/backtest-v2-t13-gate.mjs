import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = async (name) =>
  JSON.parse(await readFile(resolve(root, 'packages/schemas/fixtures', name), 'utf8'));

const expectedMarkets = ['CN', 'HK', 'US'];
const expectedInstrumentTypes = ['STOCK', 'ETF'];
const expectedBaseTimeframes = ['1m', '1d'];
const expectedDerivedTimeframes = ['5m', '15m', '30m', '60m'];
const failure = (message) => {
  throw new Error(message);
};

const capabilityKey = ({ market, instrumentType, timeframe, kind }) =>
  `${market}:${instrumentType}:${timeframe}:${kind}`;

const assertCapabilityMatrix = (capabilities) => {
  const keys = new Set(capabilities.map(capabilityKey));
  for (const market of expectedMarkets) {
    for (const instrumentType of expectedInstrumentTypes) {
      for (const timeframe of expectedBaseTimeframes) {
        if (!keys.has(`${market}:${instrumentType}:${timeframe}:base`)) {
          failure(`缺少基础 capability: ${market}/${instrumentType}/${timeframe}`);
        }
      }
      for (const timeframe of expectedDerivedTimeframes) {
        if (!keys.has(`${market}:${instrumentType}:${timeframe}:derived`)) {
          failure(`缺少派生 capability: ${market}/${instrumentType}/${timeframe}`);
        }
      }
    }
    if (!keys.has(`${market}:NAV_FUND:1d:base`)) {
      failure(`缺少 NAV capability: ${market}`);
    }
  }
};

const assertFixtureContract = async () => {
  const capabilities = await fixture('backtest-v2.capabilities.json');
  const exchange = await fixture('backtest-v2.exchange.json');
  const nav = await fixture('backtest-v2.cn-nav.json');

  if (capabilities.version !== 2) failure('capability fixture version 不是 2');
  const baseCapabilities = capabilities.capabilities;
  // This repository fixture intentionally contains one Golden scenario per
  // market, not a complete provider registry dump. The DSA endpoint gate
  // below checks the full matrix when a live URL is supplied.
  const fixtureKeys = new Set(baseCapabilities.map(capabilityKey));
  const expectedFixtureScenarios = [
    'CN:STOCK:1d:base',
    'HK:STOCK:1d:base',
    'US:ETF:1d:base',
    'CN:NAV_FUND:1d:base',
  ];
  for (const key of expectedFixtureScenarios) {
    if (!fixtureKeys.has(key)) failure(`fixture 缺少 Golden scenario: ${key}`);
    const capability = baseCapabilities.find((item) => capabilityKey(item) === key);
    if (capability.status !== 'supported') failure(`fixture 未支持 Golden scenario: ${key}`);
  }
  const navByMarket = new Map(
    baseCapabilities
      .filter((capability) => capability.instrumentType === 'NAV_FUND')
      .map((capability) => [capability.market, capability]),
  );
  if (navByMarket.get('CN')?.status !== 'supported') failure('CN NAV fixture 必须 supported');
  if (navByMarket.has('HK') || navByMarket.has('US')) {
    if (navByMarket.get('HK')?.status !== 'unsupported') failure('HK NAV fixture 必须 unsupported');
    if (navByMarket.get('US')?.status !== 'unsupported') failure('US NAV fixture 必须 unsupported');
  }

  const exchangeAsset = exchange.executionInstrument;
  if (!['CN', 'HK', 'US'].includes(exchangeAsset.market))
    failure('Exchange fixture 市场不在支持矩阵');
  if (!['stock', 'etf'].includes(exchangeAsset.assetType)) failure('Exchange fixture 资产类型越界');
  if (exchange.execution.mode !== 'exchange') failure('Exchange fixture execution mode 错误');
  if (nav.execution.mode !== 'nav' || nav.executionInstrument.market !== 'CN') {
    failure('CN NAV fixture execution 边界错误');
  }
  if (nav.executionInstrument.assetType !== 'fund') failure('NAV fixture assetType 必须为 fund');
  for (const fixtureRow of [exchange, nav]) {
    if (typeof fixtureRow.sizing?.amount === 'number') failure('RunConfig 金额不能使用 number');
    if (typeof fixtureRow.cost?.commissionRate === 'number') failure('Cost 不能使用 number');
  }
  return {
    exchange: exchange.executionInstrument,
    nav: nav.executionInstrument,
    baseCapabilities: baseCapabilities.length,
    markets: expectedMarkets,
  };
};

const assertDsaContract = async (url) => {
  const token = process.env.DSA_V2_CAPABILITIES_TOKEN;
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) failure(`DSA capability HTTP ${response.status}`);
  const body = await response.json();
  if (body.version !== 2 || !Array.isArray(body.capabilities))
    failure('DSA capability 不是 V2 contract');
  assertCapabilityMatrix(body.capabilities);
  const byKey = new Map(
    body.capabilities.map((capability) => [capabilityKey(capability), capability]),
  );
  for (const market of expectedMarkets) {
    for (const instrumentType of expectedInstrumentTypes) {
      for (const timeframe of expectedBaseTimeframes) {
        const capability = byKey.get(`${market}:${instrumentType}:${timeframe}:base`);
        if (!capability || !['supported', 'unavailable'].includes(capability.status)) {
          failure(`DSA 基础 capability 状态越界: ${market}/${instrumentType}/${timeframe}`);
        }
      }
    }
  }
  if (byKey.get('HK:NAV_FUND:1d:base')?.status !== 'unsupported') failure('DSA HK NAV 未拒绝');
  if (byKey.get('US:NAV_FUND:1d:base')?.status !== 'unsupported') failure('DSA US NAV 未拒绝');
  return { provider: body.provider, capabilityCount: body.capabilities.length };
};

const fixtureSummary = await assertFixtureContract();
const dsaUrl = process.env.DSA_V2_CAPABILITIES_URL;
let dsaSummary = { status: 'not-requested' };
if (dsaUrl) {
  try {
    dsaSummary = { status: 'passed', ...(await assertDsaContract(dsaUrl)) };
  } catch (error) {
    dsaSummary = {
      status: 'blocked',
      reason: error instanceof Error ? error.message : String(error),
    };
    if (process.env.REQUIRE_DSA_V2_GATE === '1') throw error;
  }
}

console.log(
  JSON.stringify({
    gate: 'backtest-v2-t13',
    status: 'passed',
    fixture: fixtureSummary,
    dsa: dsaSummary,
  }),
);
