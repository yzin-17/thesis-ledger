import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';

const root = new URL('..', import.meta.url).pathname;
const apiPort = Number(process.env.V1_E2E_PORT ?? 3110);
const databaseName = `thesis_ledger_e2e_${Date.now()}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const symbol = process.env.V1_E2E_SYMBOL ?? '600519.SH';

const compose = (args) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForFreePort = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(port));
    });
  });

const request = async (path, init = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers ?? {}) },
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
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  return body;
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const health = await request(`/health?t=${Date.now()}`);
      if (health.status === 'healthy') return health;
    } catch {
      // Migration and Nest bootstrap can take a few seconds in a clean database.
    }
    await sleep(1_000);
  }
  throw new Error('临时 E2E Server 未在 60 秒内健康');
};

const serverPort = await waitForFreePort(apiPort);
const webhookMessages = [];
let webhookFailuresRemaining = 1;
const webhookServer = createServer((requestMessage, response) => {
  const chunks = [];
  requestMessage.on('data', (chunk) => chunks.push(chunk));
  requestMessage.on('end', () => {
    webhookMessages.push(Buffer.concat(chunks).toString('utf8'));
    response.statusCode = webhookFailuresRemaining > 0 ? 503 : 200;
    webhookFailuresRemaining -= 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ code: 0 }));
  });
});
await new Promise((resolve, reject) => {
  webhookServer.once('error', reject);
  webhookServer.listen(0, '0.0.0.0', resolve);
});
const webhookAddress = webhookServer.address();
if (!webhookAddress || typeof webhookAddress === 'string') throw new Error('Webhook 端口分配失败');
const webhookUrl = `http://host.docker.internal:${webhookAddress.port}`;

let databaseCreated = false;
let serverContainerId = '';
try {
  compose(['exec', '-T', 'postgres', 'createdb', '-U', 'thesis_ledger', databaseName]);
  databaseCreated = true;

  serverContainerId = compose([
    'run',
    '-d',
    '--no-deps',
    '-p',
    `${serverPort}:3000`,
    '-e',
    `DATABASE_URL=postgresql://thesis_ledger:thesis_ledger@postgres:5432/${databaseName}`,
    '-e',
    'REDIS_URL=redis://redis:6379',
    '-e',
    'DSA_BASE_URL=http://dsa:8000',
    '-e',
    `FEISHU_WEBHOOK_URL=${webhookUrl}`,
    'server',
  ]);
  await waitForHealth();

  const account = await request('/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `V1 E2E ${databaseName.slice(-8)}`,
      source: 'manual',
      type: 'securities',
      currency: 'CNY',
    }),
  });

  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const upload = new FormData();
  upload.set('accountId', account.id);
  upload.set('file', new Blob([png], { type: 'image/png' }), 'fixture.png');
  upload.set('source', 'broker');
  upload.set('sourceConfidence', '1');
  upload.set(
    'extracted',
    JSON.stringify([
      {
        symbol,
        quantity: 10,
        costPrice: 100,
        marketValue: 1000,
        marketPrice: 100,
        profit: 0,
        profitRate: 0,
        confidence: 1,
      },
    ]),
  );
  const draft = await request('/imports/screenshot', { method: 'POST', body: upload });
  const draftRow = draft.rows[0];
  if (!draftRow) throw new Error('截图导入未生成候选行');
  const committed = await request(`/imports/${draft.id}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source: 'broker',
      rows: [
        {
          ...draftRow,
          rawSymbol: symbol,
          symbol,
          matchStatus: 'matched',
          matchCandidates: [symbol],
          quantity: 10,
          costPrice: 100,
          confidence: 1,
          issues: [],
        },
      ],
    }),
  });
  if (committed.status !== 'committed') throw new Error('截图导入未提交');

  const valuation = await request(`/portfolio/valuation?accountId=${account.id}`);
  if (valuation.positions.length !== 1 || valuation.positions[0].symbol !== symbol)
    throw new Error('Portfolio 未从截图导入重建');
  const position = valuation.positions[0];
  const quote = await request(`/market/${encodeURIComponent(symbol)}/quote`);
  const bars = await request(`/market/${encodeURIComponent(symbol)}/bars?timeframe=1d`);
  const snapshotTime = new Date().toISOString();
  const firstSnapshot = await request('/performance/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: account.id, capturedAt: snapshotTime }),
  });
  const secondSnapshot = await request('/performance/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: account.id, capturedAt: snapshotTime }),
  });
  if (firstSnapshot.id !== secondSnapshot.id) throw new Error('Snapshot 幂等性失败');

  const riskRule = await request('/risk/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'price-above',
      scope: 'security',
      symbol,
      severity: 'warning',
      threshold: 0,
      enabled: true,
    }),
  });
  const riskScan = await request('/risk/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      {
        symbol,
        accountId: account.id,
        price: Number(quote.price),
        costPrice: Number(position.costPrice),
        weight: 1,
        marketTime: quote.marketTime,
        dataQuality: { portfolio: 'fresh' },
      },
    ]),
  });
  const riskResult = riskScan.results.find((item) => item.ruleId === riskRule.id && item.eventId);
  if (!riskResult?.eventId) throw new Error('Risk scan 未产生事件');
  const pendingNotifications = await request('/notifications?status=pending');
  const pending = pendingNotifications.find((item) => item.eventId === riskResult.eventId);
  if (!pending) throw new Error('Risk event 未生成待投递通知');
  const retrying = await request(`/notifications/${pending.id}/deliver/feishu`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'V1 E2E 风险提醒',
      body: `事件 ${riskResult.eventId}`,
      severity: 'warning',
      traceId: riskScan.traceId,
    }),
  });
  if (retrying.status !== 'retrying' || retrying.attemptCount !== 1)
    throw new Error('通知失败未记录为 retrying');
  const delivered = await request(`/notifications/${pending.id}/deliver/feishu`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'V1 E2E 风险提醒重试',
      body: `事件 ${riskResult.eventId}`,
      severity: 'warning',
      traceId: riskScan.traceId,
    }),
  });
  if (delivered.status !== 'delivered') throw new Error('Feishu 测试 Webhook 未成功投递');
  if (webhookMessages.length !== 2) throw new Error('测试 Webhook 未收到失败与重试两次消息');

  const aiRun = await request('/ai/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'mock',
      model: 'v1-e2e',
      promptVersion: 'v1-e2e',
      context: { scope: 'position', accountId: account.id, symbol },
    }),
  });
  await request(`/ai/runs/${aiRun.id}/tool-calls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tool: 'getQuote',
      permission: 'market:read',
      status: 'ok',
      inputSummary: symbol,
      outputSummary: `price=${quote.price}`,
      provider: quote.provider,
      marketTime: quote.marketTime,
      fetchedAt: quote.fetchedAt,
    }),
  });
  await request(`/ai/runs/${aiRun.id}/finish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      result: {
        conclusion: '仅记录事实，不生成交易指令。',
        evidence: [{ claim: `当前价格 ${quote.price}`, citations: [] }],
        risks: [],
        unknowns: [],
        disclaimer: '仅供研究参考',
      },
      usage: { inputTokens: 10, outputTokens: 20, cost: 0 },
    }),
  });

  const plan = await request('/journal/plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: account.id,
      symbol,
      side: 'buy',
      plannedEntry: 100,
      plannedExit: 110,
      stopLoss: 90,
      targetWeight: 0.1,
      reason: 'V1 E2E',
      status: 'active',
    }),
  });
  await request('/journal/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entryType: 'trade',
      accountId: account.id,
      symbol,
      side: 'buy',
      reason: 'V1 E2E',
      content: '只读验收记录',
      tradePlanId: plan.id,
    }),
  });
  const completedTrade = {
    symbol,
    entryAt: '2025-01-02T09:30:00.000Z',
    exitAt: '2025-01-06T09:30:00.000Z',
    pnl: 10,
    plannedStop: 90,
    actualExit: 101,
    plannedHoldingDays: 3,
    entryPrice: 100,
    exitPrice: 101,
    plannedEntry: 100,
    plannedExit: 110,
    turnover: 1000,
    peakWeight: 0.1,
    targetWeight: 0.1,
  };
  await request('/journal/analysis/planned-vs-actual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(completedTrade),
  });
  await request('/journal/analysis/behavior', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trades: [completedTrade] }),
  });

  const strategySchema = {
    version: 1,
    name: 'V1 E2E Strategy',
    universe: { symbols: [symbol], asOf: new Date().toISOString() },
    entrySignals: [{ indicator: 'close', operator: 'gt', value: 90 }],
    exitSignals: [{ indicator: 'close', operator: 'lt', value: 80 }],
    stopLoss: { type: 'fixed', value: 0.1 },
    sizing: { type: 'weight', value: 0.5 },
    execution: { price: 'close', tPlusOne: true, lotSize: 100 },
    cost: {
      commissionRate: 0.0003,
      minimumCommission: 5,
      stampDutyRate: 0.0005,
      slippageRate: 0.001,
    },
    riskConstraints: [],
    benchmark: '000300.SH',
  };
  const strategy = await request('/backtests/strategies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: strategySchema.name, schema: strategySchema }),
  });
  const strategyVersion = strategy.versions.at(-1);
  if (!strategyVersion) throw new Error('策略未生成版本');
  const backtestJob = await request('/backtests/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: randomUUID(),
      strategyVersionId: strategyVersion.id,
      status: 'queued',
      period: { start: '2025-01-02', end: '2025-01-06' },
      dataAsOf: new Date().toISOString(),
      warnings: [],
      strategy: strategySchema,
      bars: [
        { date: '2025-01-02', symbol, open: 100, high: 100, low: 100, close: 100 },
        { date: '2025-01-03', symbol, open: 105, high: 105, low: 105, close: 105 },
        { date: '2025-01-06', symbol, open: 95, high: 95, low: 95, close: 95 },
      ],
      initialCash: 100_000,
    }),
  });
  const backtestResult = await request(`/backtests/jobs/${backtestJob.id}/run`, { method: 'POST' });
  if (backtestResult.status !== 'succeeded')
    throw new Error(`回测未成功: ${backtestResult.status}`);

  const automation = await request('/automations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: randomUUID(),
      name: 'V1 E2E daily digest',
      type: 'daily-digest',
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
      enabled: false,
      retry: { maxAttempts: 2, backoffMs: 10 },
      lockTtlMs: 30_000,
    }),
  });
  const dailyReport = await request('/automations/workflows/daily-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      date: '2026-08-01',
      portfolio: { totalValue: Number(valuation.totalMarketValue) },
      risk: { triggered: 1, active: 1, recovered: 0, bySeverity: { warning: 1 } },
      events: [{ symbol, kind: 'risk', publishedAt: new Date().toISOString() }],
      aiSummary: { conclusion: '仅供研究', citations: [{ source: 'v1-e2e' }] },
    }),
  });
  const integrity = await request('/integrity');
  if (integrity.healthy !== true) throw new Error('E2E 末尾完整性检查失败');

  console.log(
    JSON.stringify(
      {
        database: databaseName,
        accountId: account.id,
        importDraftId: draft.id,
        ledgerPosition: { symbol, quantity: position.quantity },
        quoteProvider: quote.provider,
        snapshotId: firstSnapshot.id,
        riskEventId: riskResult.eventId,
        notificationStatus: delivered.status,
        aiRunId: aiRun.id,
        planId: plan.id,
        strategyId: strategy.id,
        backtestStatus: backtestResult.status,
        automationId: automation.id,
        dailyReportExcessReturn: dailyReport.excessReturn,
        integrity: integrity.healthy,
      },
      null,
      2,
    ),
  );
} finally {
  webhookServer.close();
  if (serverContainerId) {
    try {
      execFileSync('docker', ['rm', '-f', serverContainerId], { cwd: root, stdio: 'ignore' });
    } catch {
      // Keep cleanup best-effort so the original E2E failure is not masked.
    }
  }
  if (databaseCreated) {
    try {
      compose(['exec', '-T', 'postgres', 'dropdb', '-U', 'thesis_ledger', databaseName]);
    } catch {
      // Keep cleanup best-effort so the original E2E failure is not masked.
    }
  }
}
