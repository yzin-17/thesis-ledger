const baseUrl = (process.env.CONTRACT_API_BASE ?? 'http://localhost:3000/api/v1').replace(
  /\/$/u,
  '',
);
const token = process.env.THESIS_LEDGER_DSA_TOKEN?.trim();
const controlToken = process.env.THESIS_LEDGER_CONTROL_TOKEN?.trim();
const checkCapabilities = process.env.CONTRACT_CHECK_CAPABILITIES === 'true';
const checkControl = process.env.CONTRACT_CHECK_CONTROL === 'true';

const request = async (path, expectedStatus = 200, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path} -> ${response.status}, expected ${expectedStatus}: ${text.slice(0, 500)}`,
    );
  }
  return body;
};

const controlRequest = (path, expectedStatus = 200, init = {}) =>
  request(path, expectedStatus, {
    ...init,
    headers: { authorization: `Bearer ${controlToken ?? ''}`, ...init.headers },
  });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

if (checkCapabilities) {
  if (token) {
    await request('/capabilities', 401, {
      headers: { authorization: 'Bearer invalid-contract-token' },
    });
  }
  const capabilities = await request('/capabilities');
  assert(capabilities.contractVersion === 1, 'Contract version must be 1');
  assert(
    JSON.stringify(capabilities.capabilities?.bars?.timeframes) === JSON.stringify(['1d']),
    'DSA V1 must declare only 1d bars',
  );
  assert(
    capabilities.capabilities?.['fund-nav']?.assetSuffix === '.OF',
    'DSA V1 must declare fund NAV',
  );
  assert(
    capabilities.capabilities?.['fund-nav-history']?.assetSuffix === '.OF',
    'DSA V1 must declare fund NAV history',
  );
}

if (checkControl) {
  assert(Boolean(controlToken), 'Control Contract check requires THESIS_LEDGER_CONTROL_TOKEN');
  const handshake = await controlRequest('/control/handshake', 200, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: `contract-smoke-${Date.now()}`,
      supportedVersions: [1],
    }),
  });
  assert(
    handshake.accepted === true && handshake.contractVersion === 1,
    'Control handshake failed',
  );
  const providers = await controlRequest('/control/providers');
  assert(
    providers.providers?.some((provider) => provider.providerId === 'akshare') &&
      providers.providers?.some((provider) => provider.providerId === 'efinance'),
    'Control provider registry is incomplete',
  );
  const effective = await controlRequest('/control/policies/effective');
  assert(effective.projection || effective.effective, 'Effective Policy projection is missing');
  const catalogJob = await controlRequest('/control/catalog/jobs', 200, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: `catalog-job-${Date.now()}`,
    }),
  });
  assert(['running', 'succeeded'].includes(catalogJob.status), 'Catalog job status is invalid');
  const catalog = await request('/catalog/snapshot');
  assert(
    catalog.complete === true && catalog.checksum && catalog.cursor,
    'Catalog snapshot is invalid',
  );
  if (catalogJob.status === 'succeeded') {
    const acknowledged = await controlRequest('/control/catalog/ack', 200, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId: `catalog-ack-${Date.now()}`,
        generation: catalog.generation,
        checksum: catalog.checksum,
      }),
    });
    assert(
      acknowledged.acknowledged === true || acknowledged.accepted === true,
      'Catalog ACK failed',
    );
  }
}

const fundNavPath = checkCapabilities
  ? '/market/fund-nav?symbol=000001.OF'
  : '/market/000001.OF/fund-nav';
const fundNav = await request(fundNavPath);
assert(fundNav.version === 1 && fundNav.symbol === '000001.OF', 'Fund NAV identity is invalid');
assert(typeof fundNav.unitNav === 'number' && fundNav.freshness, 'Fund NAV provenance is missing');

const fundNavHistoryPath = checkCapabilities
  ? '/market/fund-nav/history?symbol=000001.OF&limit=5'
  : '/market/000001.OF/fund-nav/history?limit=5';
const fundNavHistory = await request(fundNavHistoryPath);
assert(Array.isArray(fundNavHistory) && fundNavHistory.length > 0, 'Fund NAV history is empty');
assert(
  fundNavHistory.every((point) => point.symbol === '000001.OF' && point.version === 1),
  'Fund NAV history identity is invalid',
);
assert(
  fundNavHistory.every(
    (point, index) => index === 0 || fundNavHistory[index - 1].navDate < point.navDate,
  ),
  'Fund NAV history must be strictly ordered',
);

const quotePath = checkCapabilities ? '/market/quote?symbol=600519.SH' : '/market/600519.SH/quote';
const quote = await request(quotePath);
assert(quote.version === 1 && quote.symbol === '600519.SH', 'Quote identity is invalid');
assert(
  typeof quote.marketTime === 'string' && typeof quote.fetchedAt === 'string',
  'Quote provenance is missing',
);

const barsPath = checkCapabilities
  ? '/market/bars?symbol=600519.SH&timeframe=1d'
  : '/market/600519.SH/bars?timeframe=1d';
const bars = await request(barsPath);
assert(Array.isArray(bars) && bars.length > 0, 'Bars must be non-empty');
for (let index = 1; index < bars.length; index += 1) {
  assert(bars[index - 1].timestamp < bars[index].timestamp, 'Bars must be ascending');
  assert(bars[index].timeframe === '1d', 'Bars timeframe must be 1d');
}

for (const name of ['MA', 'MACD', 'RSI']) {
  const indicatorPath = checkCapabilities
    ? `/market/indicators/${name}?symbol=600519.SH&timeframe=1d`
    : `/market/600519.SH/indicators/${name}`;
  const indicator = await request(indicatorPath);
  assert(
    indicator.version === 1 && indicator.name === name,
    `${name} indicator identity is invalid`,
  );
  assert(indicator.engineVersion, `${name} engineVersion is missing`);
}

const chipPath = checkCapabilities ? '/market/chip?symbol=600519.SH' : '/market/600519.SH/chip';
const chip = await request(chipPath);
for (const field of ['averageCost', 'profitRatio', 'range70', 'range90', 'concentration']) {
  assert(chip[field] !== undefined, `Chip summary field is missing: ${field}`);
}
if (chip.buckets !== undefined)
  assert(Array.isArray(chip.buckets), 'Chip buckets must be an array when present');
if (chip.mainPeak !== undefined)
  assert(Number.isFinite(Number(chip.mainPeak)), 'Chip mainPeak must be numeric when present');

if (checkCapabilities) {
  const unsupported = await request('/market/bars?symbol=600519.SH&timeframe=1m', 422);
  assert(
    unsupported.detail?.code === 'unsupported_capability',
    'Unsupported capability error is unstable',
  );
} else {
  const unsupported = await request('/market/600519.SH/bars?timeframe=1m', 422);
  assert(
    unsupported.code === 'unsupported_capability' ||
      unsupported.error === 'unsupported_capability' ||
      unsupported.message?.includes('1d'),
    'Facade unsupported capability error is unstable',
  );
}

console.log(
  JSON.stringify(
    {
      baseUrl,
      contractVersion: 1,
      quoteProvider: quote.provider,
      fundNavProvider: fundNav.provider,
      bars: bars.length,
      chipDistribution: chip.buckets !== undefined,
      status: 'passed',
    },
    null,
    2,
  ),
);
