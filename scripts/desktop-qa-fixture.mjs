import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT ?? 3000);
const now = '2026-08-01T08:00:00.000Z';
const fixtureAccount = {
  id: 'fixture-account',
  name: '测试账户',
  source: 'manual',
  type: 'securities',
  currency: 'CNY',
};

const fixturePosition = (stale = false) => ({
  id: 'fixture-position',
  accountId: fixtureAccount.id,
  symbol: '600519.SH',
  quantity: 100,
  costPrice: 1600,
  marketValue: 178000,
  pnl: 18000,
  stale,
  asset: { name: '贵州茅台' },
});

let mode = 'ready';
let accounts = [fixtureAccount];
let positions = [fixturePosition()];
let providers = [
  {
    name: 'mock',
    type: 'mock',
    enabled: true,
    priority: 1,
    capabilities: ['quote', 'risk'],
    health: 'healthy',
    credentialConfigured: false,
  },
];

const rule = {
  id: 'fixture-rule',
  version: 2,
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: 1500,
  enabled: true,
  symbol: '600519.SH',
  accountId: null,
  effectiveAt: now,
};

const event = {
  id: 'fixture-event',
  ruleId: rule.id,
  ruleVersion: rule.version,
  severity: 'warning',
  message: '测试风险事件',
  symbol: '600519.SH',
  marketTime: now,
  evaluatedAt: now,
  context: { price: 1480, threshold: 1500 },
};

const draft = {
  id: 'fixture-draft',
  accountId: fixtureAccount.id,
  source: 'ths',
  sourceConfidence: 1,
  status: 'pending',
  rows: [
    {
      rawSymbol: '600519.SH',
      rawName: '贵州茅台',
      symbol: '600519.SH',
      matchStatus: 'matched',
      matchCandidates: ['600519.SH'],
      quantity: 100,
      costPrice: 1600,
      marketPrice: 1780,
      marketValue: 178000,
      profit: 18000,
      profitRate: 0.1125,
      confidence: 1,
      rawText: {},
      issues: [],
    },
  ],
  createdAt: now,
};

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const ok = (response, value = {}) => json(response, 200, value);

const resetFixture = (nextMode) => {
  mode = nextMode;
  if (nextMode === 'empty') {
    accounts = [];
    positions = [];
    providers = [];
  } else if (
    nextMode === 'ready' ||
    nextMode === 'stale' ||
    nextMode === 'empty-market' ||
    nextMode === 'error-market' ||
    nextMode === 'loading-market' ||
    nextMode === 'stale-market'
  ) {
    accounts = [fixtureAccount];
    positions = [fixturePosition(nextMode === 'stale')];
    providers = [
      {
        name: 'mock',
        type: 'mock',
        enabled: true,
        priority: 1,
        capabilities: ['quote', 'risk'],
        health: 'healthy',
        credentialConfigured: false,
      },
    ];
  }
};

const portfolio = () => {
  const stale = mode === 'stale';
  const nextPositions = positions.map((position) => ({ ...position, stale }));
  const totalMarketValue = nextPositions.reduce(
    (sum, position) => sum + (position.marketValue ?? 0),
    0,
  );
  const totalCost = nextPositions.reduce(
    (sum, position) => sum + position.quantity * position.costPrice,
    0,
  );
  return {
    totalMarketValue,
    totalCost,
    totalPnl: totalMarketValue - totalCost,
    partial: stale,
    valuedAt: now,
    positions: nextPositions,
  };
};

const responseFor = (pathname, method) => {
  const marketMode = mode.endsWith('-market') ? mode.slice(0, -'-market'.length) : null;
  const isMarketPath = pathname.includes('/market/');
  if (isMarketPath && marketMode === 'empty') {
    if (pathname.endsWith('/quote')) return { empty: true, symbol: '600519.SH' };
    if (pathname.endsWith('/bars')) return [];
    if (pathname.includes('/indicators/')) return { empty: true, values: {} };
    if (pathname.endsWith('/chip')) return { empty: true };
  }
  if (pathname === '/api/v1/accounts') return accounts;
  if (pathname === '/api/v1/portfolio/valuation') return portfolio();
  if (pathname === '/api/v1/portfolio/positions') return positions;
  if (pathname === '/api/v1/risk/rules') return mode === 'empty' ? [] : [rule];
  if (pathname === '/api/v1/risk/events') return mode === 'empty' ? [] : [event];
  if (pathname === '/api/v1/notifications') return [];
  if (pathname === '/api/v1/imports') return mode === 'empty' ? [] : [draft];
  if (pathname === '/api/v1/performance/history') {
    return mode === 'empty'
      ? []
      : [
          {
            id: 'fixture-snapshot',
            capturedAt: now,
            marketValue: 178000,
            costValue: 160000,
            cashValue: 0,
          },
        ];
  }
  if (pathname === '/api/v1/performance/summary') return { ttwror: 0.1125, xirr: 0.1125 };
  if (pathname === '/api/v1/performance/layers') {
    return {
      security: positions.map((position) => ({
        accountId: position.accountId,
        symbol: position.symbol,
        assetType: '股票',
        costValue: 160000,
        marketValue: 178000,
        unrealizedPnl: 18000,
      })),
    };
  }
  if (pathname === '/api/v1/performance/targets') return { targets: { 股票: 1 } };
  if (pathname === '/api/v1/backtests/strategies')
    return mode === 'empty'
      ? []
      : [
          {
            id: 'fixture-strategy',
            name: 'Fixture Strategy',
            versions: [{ id: 'fixture-version', version: 1 }],
          },
        ];
  if (pathname === '/api/v1/backtests/jobs')
    return mode === 'empty'
      ? []
      : [
          {
            id: 'fixture-job',
            strategyVersionId: 'fixture-version',
            status: 'succeeded',
            progress: 1,
            result: null,
            warnings: [],
          },
        ];
  if (pathname === '/api/v1/ai/runs')
    return mode === 'empty'
      ? []
      : [
          {
            id: 'fixture-ai-run',
            provider: 'mock',
            model: 'research-default',
            promptVersion: 'research-v1',
            status: 'completed',
            context: { scope: 'portfolio' },
            createdAt: now,
          },
        ];
  if (pathname === '/api/v1/providers/config') return providers;
  if (pathname === '/api/v1/data-quality/issues') return [];
  if (pathname === '/api/v1/automations')
    return mode === 'empty'
      ? []
      : [
          {
            id: 'fixture-automation',
            name: 'Fixture daily scan',
            type: 'daily-report',
            enabled: true,
            nextRunAt: now,
          },
        ];
  if (pathname === '/api/v1/providers/health/history')
    return mode === 'empty'
      ? []
      : [{ provider: 'mock', state: 'healthy', latencyMs: 12, checkedAt: now }];
  if (pathname === '/api/v1/automations/history') return [];
  if (pathname.includes('/market/') && pathname.endsWith('/quote'))
    return {
      symbol: '600519.SH',
      price: 1780,
      provider: 'mock',
      marketTime: now,
      stale: mode === 'stale' || marketMode === 'stale',
    };
  if (pathname.includes('/market/') && pathname.endsWith('/bars'))
    return [{ timestamp: now, open: 1770, high: 1790, low: 1760, close: 1780, volume: 1000 }];
  if (pathname.includes('/market/') && pathname.includes('/indicators/'))
    return {
      name: pathname.split('/').at(-1),
      values: { value: 1780 },
      provider: 'mock',
      marketTime: now,
    };
  if (pathname.includes('/market/') && pathname.endsWith('/chip'))
    return { mainPeak: 1780, provider: 'mock', engineVersion: 'fixture-v1' };
  if (pathname.startsWith('/api/v1/journal/analysis/'))
    return { status: 'ok', source: 'fixture', metrics: { sampleSize: 1 } };
  if (pathname.startsWith('/api/v1/journal/')) return [];
  if (pathname.startsWith('/api/v1/')) return method === 'GET' ? [] : {};
  return null;
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (url.pathname === '/__mode') {
    resetFixture(url.searchParams.get('mode') ?? 'ready');
    return ok(response, { mode });
  }
  if (!url.pathname.startsWith('/api/v1/')) return ok(response, { mode });
  if (mode === 'error') return json(response, 503, { error: 'fixture unavailable' });
  if (mode === 'error-market' && url.pathname.includes('/market/'))
    return json(response, 503, { error: 'market fixture unavailable' });
  if (mode === 'loading' || (mode === 'loading-market' && url.pathname.includes('/market/')))
    await new Promise((resolve) => setTimeout(resolve, 30000));
  if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE') {
    if (request.method === 'POST' && url.pathname === '/api/v1/accounts') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}');
      const account = { id: `account-${randomUUID().slice(0, 8)}`, ...input };
      accounts = [...accounts, account];
      return ok(response, account);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/providers/config') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}');
      const nextProvider = {
        name: String(input.name ?? 'fixture-provider'),
        type: String(input.type ?? 'mock'),
        enabled: input.enabled !== false,
        priority: Number(input.priority ?? 1),
        capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
        health: 'unknown',
        credentialConfigured: Boolean(input.credentialsRef),
      };
      providers = [
        ...providers.filter((provider) => provider.name !== nextProvider.name),
        nextProvider,
      ];
      return ok(response, nextProvider);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/portfolio/positions') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}');
      const position = {
        ...fixturePosition(false),
        id: `position-${randomUUID().slice(0, 8)}`,
        ...input,
        asset: { name: input.symbol ?? '测试标的' },
        marketValue: Number(input.quantity) * Number(input.costPrice) * 1.1125,
        pnl: Number(input.quantity) * Number(input.costPrice) * 0.1125,
        stale: false,
      };
      positions = [...positions, position];
      return ok(response, position);
    }
    if (url.pathname === '/api/v1/imports/screenshot') return ok(response, draft);
    if (url.pathname.endsWith('/commit')) return ok(response, { ...draft, status: 'committed' });
    if (url.pathname.endsWith('/rollback')) return ok(response, { ...draft, status: 'cancelled' });
    if (url.pathname === '/api/v1/ai/runs')
      return ok(response, {
        id: `ai-${randomUUID().slice(0, 8)}`,
        provider: 'mock',
        model: 'research-default',
        promptVersion: 'research-v1',
      });
    if (url.pathname === '/api/v1/backtests/strategies')
      return ok(response, {
        id: `strategy-${randomUUID().slice(0, 8)}`,
        name: 'Fixture Strategy',
        versions: [{ id: 'fixture-version', version: 1 }],
      });
    if (url.pathname === '/api/v1/performance/allocation')
      return ok(response, {
        allocation: [{ category: '股票', value: 178000, weight: 1 }],
        rebalance: [],
      });
    if (url.pathname.includes('/journal/analysis/'))
      return ok(response, { status: 'ok', source: 'fixture', metrics: { sampleSize: 1 } });
    return ok(response, {});
  }
  const value = responseFor(url.pathname, request.method ?? 'GET');
  return value === null ? json(response, 404, { error: 'not found' }) : ok(response, value);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`desktop QA fixture listening on http://127.0.0.1:${port}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
