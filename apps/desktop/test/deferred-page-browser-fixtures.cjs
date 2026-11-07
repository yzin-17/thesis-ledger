const accountIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const accounts = accountIds.map((id, index) => ({
  id,
  name: ['受控实际一', '受控实际二', '受控模拟一'][index],
  institution: null,
  type: 'securities',
  mode: index === 2 ? 'shadow' : 'actual',
  currency: 'CNY',
  active: true,
}));
const valuedAt = '2026-11-06T07:00:00.000Z';
const fx = { enabled: false, status: 'disabled', missingCurrencies: [], rates: [] };
const quality = { partial: false, missingSymbols: [] };
const total = { marketValue: 11000, costValue: 900, cashValue: 10000, ...quality, currency: 'CNY' };

function createBrowserFixtures(schemas) {
  schemas.accountsResponseSchema.parse(accounts);
  const checked = (name, value) => schemas[name].parse(value);
  return function resolveFixture(url, method) {
    const endpoint = url.pathname.replace(/^\/api\/v1/u, '');
    const accountId = url.searchParams.get('accountId') || null;
    const mode = url.searchParams.get('mode') || 'actual';
    const selectedId = accountId || accountIds[mode === 'shadow' ? 2 : 0];
    if (method === 'POST' && endpoint === '/performance/allocation') {
      return checked('performanceAllocationResponseSchema', {
        allocation: [
          { category: 'stock', value: 1000, weight: 1 / 11 },
          { category: 'cash', value: 10000, weight: 10 / 11 },
        ],
        rebalance: [],
        ...quality,
      });
    }
    if (method !== 'GET') return undefined;
    if (endpoint === '/accounts') return accounts;
    if (endpoint === '/watchlist') {
      return checked('watchlistPageSchema', {
        revision: 1,
        items: [],
        groups: [],
        nextOffset: null,
      });
    }
    const ledgerEvents = endpoint.match(/^\/ledger\/([^/]+)\/events$/u);
    if (ledgerEvents) {
      return checked('ledgerEventsResponseSchema', {
        accountId: ledgerEvents[1],
        ledgerRevision: '0',
        projectionGeneration: '0',
        events: [],
        instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
        effective: true,
      });
    }
    if (endpoint === '/portfolio/valuation') {
      return checked('portfolioValuationResponseSchema', {
        positions: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            accountId: selectedId,
            symbol: '600000.SH',
            quantity: 100,
            costPrice: 9,
            marketPrice: 10,
            marketValue: 1000,
            costValue: 900,
            pnl: 100,
            pnlRatio: 1 / 9,
            stale: false,
            currency: 'CNY',
            asset: { name: '受控标的', symbol: '600000.SH', assetType: 'stock' },
          },
        ],
        cashValue: 10000,
        cashByAccount: [{ accountId: selectedId, amount: 10000, currency: 'CNY' }],
        totalCost: 900,
        totalMarketValue: 11000,
        totalPnl: 100,
        unrealizedPnl: 100,
        unrealizedPnlRatio: 1 / 9,
        realizedPnl: 0,
        realizedPnlRatio: 0,
        cumulativePnl: 100,
        cumulativePnlRatio: 1 / 9,
        partial: false,
        mode,
        valuedAt,
        baseCurrency: 'CNY',
        fx,
        dataQuality: quality,
      });
    }
    if (endpoint === '/performance/summary') {
      return checked('performanceSummaryManagementSchema', {
        accountId,
        snapshots: [],
        ttwror: 0.05,
        xirr: 0.06,
        currency: 'CNY',
        fx,
      });
    }
    if (endpoint === '/performance/history') {
      return checked('performanceHistoryResponseSchema', [
        {
          id: 'controlled-snapshot',
          capturedAt: valuedAt,
          ...total,
          payload: quality,
        },
      ]);
    }
    if (endpoint === '/performance/layers') {
      return checked('performanceLayersResponseSchema', {
        security: [
          {
            accountId: selectedId,
            symbol: '600000.SH',
            assetType: 'stock',
            costValue: 900,
            marketValue: 1000,
            unrealizedPnl: 100,
            currency: 'CNY',
          },
        ],
        account: [{ accountId: selectedId, ...total }],
        portfolio: total,
        byCurrency: [total],
        valuedAt,
        dataQuality: quality,
        fx,
      });
    }
    if (endpoint === '/performance/targets') {
      return checked('performanceTargetsResponseSchema', {
        scope: accountId ? 'account' : 'portfolio',
        accountId,
        targets: { stock: 0.6, etf: 0, fund: 0, index: 0, cash: 0.4 },
        version: 1,
        source: 'explicit',
        createdAt: valuedAt,
      });
    }
    if (endpoint === '/performance/series') {
      return checked('performanceSeriesResponseSchema', {
        range: url.searchParams.get('range'),
        interval: url.searchParams.get('interval'),
        currency: url.searchParams.get('baseCurrency') || 'CNY',
        availableIntervals: ['1d'],
        defaultInterval: '1d',
        dataQuality: 'COMPLETE',
        historyStart: '2026-11-05',
        points: ['2026-11-05T07:00:00.000Z', valuedAt].map((at, index) => ({
          at,
          value: 10900 + index * 100,
          currency: 'CNY',
          valuationBasis: 'OFFICIAL',
          disclosureCoverage: 1,
          pricedCoverage: 1,
          dataQuality: 'COMPLETE',
          sourceSnapshotId: null,
        })),
      });
    }
    if (
      [
        '/providers/config',
        '/risk/rules',
        '/ai/providers',
        '/data-quality/issues',
        '/automations',
        '/automations/history',
        '/providers/health/history',
        '/notifications',
      ].includes(endpoint)
    )
      return [];
    if (endpoint === '/ai/settings') {
      return checked('aiRoutingSettingsViewSchema', {
        researchDefault: { providerId: 'controlled-provider', model: 'controlled-model' },
        revision: '1',
        candidates: [],
      });
    }
    if (endpoint === '/api/market-data/providers') return { providers: [] };
    if (endpoint === '/api/market-data/policy') {
      return checked('marketPolicyClientResponseSchema', {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'controlled-policy',
        revision: 1,
        enabled: false,
        routes: [],
        syncState: 'applied',
        effectiveStale: false,
        effectiveProjection: {
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: 'controlled-policy',
          revision: 1,
          sourceDesiredRevision: 1,
          enabled: false,
          routes: [],
          appliedAt: valuedAt,
        },
      });
    }
    return undefined;
  };
}

module.exports = { createBrowserFixtures, accountIds };
