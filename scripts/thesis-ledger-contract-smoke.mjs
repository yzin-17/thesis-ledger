const baseUrl = (process.env.CONTRACT_API_BASE ?? 'http://localhost:3000/api/v1').replace(
  /\/$/u,
  '',
);
const token = process.env.THESIS_LEDGER_DSA_TOKEN?.trim();
const checkCapabilities = process.env.CONTRACT_CHECK_CAPABILITIES === 'true';

const request = async (path, expectedStatus = 200) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

if (checkCapabilities) {
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
}

const fundNavPath = checkCapabilities
  ? '/market/fund-nav?symbol=000001.OF'
  : '/market/000001.OF/fund-nav';
const fundNav = await request(fundNavPath);
assert(fundNav.version === 1 && fundNav.symbol === '000001.OF', 'Fund NAV identity is invalid');
assert(typeof fundNav.unitNav === 'number' && fundNav.freshness, 'Fund NAV provenance is missing');

const quote = await request('/market/quote?symbol=600519.SH');
assert(quote.version === 1 && quote.symbol === '600519.SH', 'Quote identity is invalid');
assert(
  typeof quote.marketTime === 'string' && typeof quote.fetchedAt === 'string',
  'Quote provenance is missing',
);

const bars = await request('/market/bars?symbol=600519.SH&timeframe=1d');
assert(Array.isArray(bars) && bars.length > 0, 'Bars must be non-empty');
for (let index = 1; index < bars.length; index += 1) {
  assert(bars[index - 1].timestamp < bars[index].timestamp, 'Bars must be ascending');
  assert(bars[index].timeframe === '1d', 'Bars timeframe must be 1d');
}

for (const name of ['MA', 'MACD', 'RSI']) {
  const indicator = await request(`/market/indicators/${name}?symbol=600519.SH&timeframe=1d`);
  assert(
    indicator.version === 1 && indicator.name === name,
    `${name} indicator identity is invalid`,
  );
  assert(indicator.engineVersion, `${name} engineVersion is missing`);
}

const chip = await request('/market/chip?symbol=600519.SH');
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
