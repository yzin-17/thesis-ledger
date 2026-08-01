import { performance } from 'node:perf_hooks';
import { PortfolioService } from '../apps/server/dist/src/portfolio/portfolio.service.js';
import { evaluateCompleteRule } from '../packages/domain/dist/risk.js';

const sizes = [10, 50, 200, 1000];
const thresholds = { valuationMs: 500, riskMs: 500, dashboardMs: 500 };

const run = async (size) => {
  const positions = Array.from({ length: size }, (_, index) => ({
    id: `position-${index}`,
    accountId: 'benchmark',
    symbol: `${String(600000 + (index % 999)).padStart(6, '0')}.SH`,
    quantity: 100,
    costPrice: 10 + (index % 20),
    asset: { assetType: index % 4 === 0 ? 'etf' : 'stock' },
  }));
  const prisma = { position: { findMany: async () => positions } };
  const market = {
    getQuote: async (symbol) => ({
      symbol,
      price: 12,
      stale: false,
      marketTime: '2025-01-02T00:00:00Z',
    }),
  };
  const portfolio = new PortfolioService(prisma, market);
  const startedValuation = performance.now();
  const value = await portfolio.value('benchmark');
  const valuationMs = performance.now() - startedValuation;

  const context = {
    symbol: '600519.SH',
    price: 12,
    marketTime: '2025-01-02T00:00:00Z',
    positions: value.positions.map((position) => ({
      symbol: position.symbol,
      weight: value.totalMarketValue === 0 ? 0 : position.marketValue / value.totalMarketValue,
      assetType: position.asset.assetType,
      volatility: 0.2,
    })),
  };
  const startedRisk = performance.now();
  evaluateCompleteRule(
    {
      id: 'benchmark-risk',
      version: 1,
      kind: 'asset-concentration',
      scope: 'portfolio',
      severity: 'warning',
      threshold: 0.9,
      enabled: true,
    },
    context,
  );
  const riskMs = performance.now() - startedRisk;

  const startedDashboard = performance.now();
  const dashboard = value.positions.reduce((result, position) => {
    const category = position.asset.assetType;
    const current = result[category] ?? { marketValue: 0, count: 0 };
    result[category] = {
      marketValue: current.marketValue + position.marketValue,
      count: current.count + 1,
    };
    return result;
  }, {});
  const dashboardMs = performance.now() - startedDashboard;
  return {
    size,
    valuationMs: Number(valuationMs.toFixed(3)),
    riskMs: Number(riskMs.toFixed(3)),
    dashboardMs: Number(dashboardMs.toFixed(3)),
    positionCount: value.positions.length,
    partial: value.partial,
    dashboardCategories: Object.keys(dashboard).length,
    withinLocalThresholds:
      valuationMs <= thresholds.valuationMs &&
      riskMs <= thresholds.riskMs &&
      dashboardMs <= thresholds.dashboardMs,
  };
};

const results = [];
for (const size of sizes) results.push(await run(size));
console.log(
  JSON.stringify({ generatedAt: new Date().toISOString(), thresholds, results }, null, 2),
);
