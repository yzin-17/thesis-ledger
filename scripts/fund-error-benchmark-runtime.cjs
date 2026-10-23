/* 当前可得的冻结观察基准；纯计算，不启动应用、不访问网络或写数据库。 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const r = createRequire('/app/apps/server/package.json');
r('reflect-metadata');
const schemas = r('@thesis-ledger/schemas');
const load = (name) => r('/app/apps/server/dist/src/performance/' + name + '.js');

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  assert.equal(input.format, 'fund-error-benchmark-v1');
  const source = input.source;
  const holdings = schemas.fundHoldingsSchema.parse(source.source.holdings);
  const official = schemas.fundNavSchema.parse(source.source.nav);
  const history = schemas.fundNavHistorySchema.parse(input.history);
  assert.equal(history.length, 1);
  const anchor = history[0];
  assert(anchor.symbol === '161725.OF' && anchor.provider === 'efinance' && anchor.unitNav > 0);
  assert.equal(anchor.navDate.slice(0, 10), '2026-10-19');
  assert.equal(official.navDate.slice(0, 10), '2026-10-20');
  assert(anchor.servedFromCache === false && anchor.fallbackUsed === false);
  assert(['delayed', 'stale'].includes(anchor.freshness));
  const measuredAt = new Date();
  load('performance-fund-disclosure').fundDisclosureAvailableAt(holdings, measuredAt);
  const { readFundAdjustedHoldingReturn } = load('performance-fund-adjusted-return');
  const { estimateFundNavFromHoldings } = load('performance-valuation-series.service');
  const returns = new Map(),
    prices = [];
  for (const holding of holdings.holdings.filter((h) => h.weight > 0)) {
    const captured = source.prices.prices[holding.symbol];
    assert(captured);
    const quote = schemas.quoteSchema.parse(captured.quote);
    const series = schemas.barSeriesSchema.parse(captured.bars);
    assert.equal(series.identity.adjustment, 'qfq');
    const hash = createHash('sha256')
      .update(schemas.canonicalBarSeriesEncoding(series.identity, series.points))
      .digest('hex');
    assert.equal(hash, series.inputFingerprint);
    const priced = await readFundAdjustedHoldingReturn({
      symbol: holding.symbol,
      assetType: 'STOCK',
      navDate: anchor.navDate,
      at: measuredAt,
      market: {
        getQuote: async (symbol) => {
          assert.equal(symbol, holding.symbol);
          return quote;
        },
      },
      bars: {
        readChartV3: async (request) => {
          assert.equal(request.identity.symbol, holding.symbol);
          assert.equal(request.identity.adjustment, 'qfq');
          return series;
        },
      },
    });
    assert(priced.change !== undefined, `基准缺少精确复权日期：${holding.symbol}`);
    returns.set(holding.symbol, priced.change);
    prices.push({
      symbol: holding.symbol,
      weight: holding.weight,
      change: priced.change,
      ...priced.evidence,
    });
  }
  const estimate = estimateFundNavFromHoldings(anchor.unitNav, holdings.holdings, returns);
  assert(Math.abs(estimate.pricedCoverage - estimate.disclosureCoverage) < 1e-12);
  const signedError = estimate.estimatedNav - official.unitNav;
  assert(Number.isFinite(signedError) && estimate.estimatedNav > 0);
  console.log(
    'FUND_ERROR_RESULT=' +
      JSON.stringify({
        format: input.format,
        measuredAt: measuredAt.toISOString(),
        basis: 'current-known-retained-observations',
        anchorDate: '2026-10-19',
        comparisonDate: '2026-10-20',
        anchorNav: anchor.unitNav,
        officialNav: official.unitNav,
        estimatedNav: estimate.estimatedNav,
        signedError,
        absoluteError: Math.abs(signedError),
        relativeAbsoluteError: Math.abs(signedError) / official.unitNav,
        disclosureCoverage: estimate.disclosureCoverage,
        pricedCoverage: estimate.pricedCoverage,
        uncoveredWeight: 1 - estimate.disclosureCoverage,
        holdingCount: holdings.holdings.length,
        pricedCount: prices.length,
        holdingsDigest: holdings.evidenceVersion,
        referenceVersion: holdings.disclosureEvidence.referenceVersion,
        prices,
        historicalPointCreated: false,
        pitClaimed: false,
        projectModelRequests: 0,
        newPriceDataRequests: 0,
      }),
  );
}
main().catch((error) => {
  console.log(
    'FUND_ERROR_FAILURE=' + JSON.stringify({ message: error.message, projectModelRequests: 0 }),
  );
  process.exitCode = 1;
});
