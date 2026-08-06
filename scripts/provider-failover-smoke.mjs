import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const baseUrl = process.env.THESIS_LEDGER_BASE_URL ?? 'http://localhost:3000/api/v1';
const symbol = process.env.FAILOVER_SYMBOL ?? '600519.SH';
const allowStop = process.argv.includes('--allow-service-stop');

if (!allowStop) {
  throw new Error('故障注入会短暂停止 DSA；请显式传入 --allow-service-stop。');
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const compose = (args) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
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
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}`);
  return body;
};

const warm = await request(`/market/${encodeURIComponent(symbol)}/quote?t=failover-warmup`);
compose([
  'exec',
  '-T',
  'redis',
  'redis-cli',
  'DEL',
  `thesis-ledger:cache:v1:quote:${symbol}:fresh`,
]);

let stopped = false;
try {
  compose(['stop', 'dsa']);
  stopped = true;
  const failures = [];
  for (let index = 0; index < 3; index += 1) {
    const result = await request('/providers/health/check', { method: 'POST' });
    failures.push(result[0]);
  }
  const stale = await request(`/market/${encodeURIComponent(symbol)}/quote?t=failover-stale`);
  if (stale.stale !== true || stale.freshness !== 'stale')
    throw new Error('DSA 不可用时未返回带 stale 标记的 last-valid Quote');
  const issue = await request('/data-quality/issues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      capability: 'quote',
      provider: 'dsa',
      symbol,
      severity: 'warning',
      code: 'stale-cache-fallback',
      details: { source: 'last-valid-cache', providerState: failures.at(-1)?.state },
    }),
  });
  compose(['start', 'dsa']);
  stopped = false;
  let recovered = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await request('/providers/health/check', { method: 'POST' });
    recovered = result[0];
    if (recovered?.state === 'healthy') break;
    await sleep(1_000);
  }
  if (recovered?.state !== 'healthy') throw new Error('DSA 恢复后未回到 healthy');
  const health = await request('/health');
  if (health.status !== 'healthy') throw new Error('整体健康检查未回到 healthy');
  console.log(
    JSON.stringify(
      {
        symbol,
        warmProvider: warm.provider,
        staleFallback: { provider: stale.provider, stale: stale.stale, freshness: stale.freshness },
        failureStates: failures.map((item) => item.state),
        recoveredState: recovered.state,
        dataQualityIssueId: issue.id,
      },
      null,
      2,
    ),
  );
} finally {
  if (stopped) compose(['start', 'dsa']);
}
