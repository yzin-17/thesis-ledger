import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const baseUrl = process.env.INVESTMENT_OS_BASE_URL ?? 'http://localhost:3000/api/v1';

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

const health = await request(`/health?t=${Date.now()}`);
if (health.status !== 'healthy') throw new Error(`依赖未就绪: ${JSON.stringify(health)}`);

const lockKey = `investment-os:lock:v1:integration:${Date.now()}`;
const compose = (args) =>
  execFileSync('docker', ['compose', ...args], { cwd: root, encoding: 'utf8' }).trim();
const firstLock = compose([
  'exec',
  '-T',
  'redis',
  'redis-cli',
  'SET',
  lockKey,
  'one',
  'NX',
  'PX',
  '5000',
]);
const secondLock = compose([
  'exec',
  '-T',
  'redis',
  'redis-cli',
  'SET',
  lockKey,
  'two',
  'NX',
  'PX',
  '5000',
]);
if (firstLock !== 'OK' || secondLock !== '') throw new Error('Redis NX 锁互斥检查失败');
compose(['exec', '-T', 'redis', 'redis-cli', 'DEL', lockKey]);

const portfolio = await request(`/portfolio/valuation?t=${Date.now()}`);
const accountId = portfolio.positions?.[0]?.accountId;
let idempotentSnapshot = null;
if (accountId) {
  const capturedAt = new Date().toISOString();
  const payload = { accountId, capturedAt };
  const first = await request('/performance/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const second = await request('/performance/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (first.id !== second.id) throw new Error('Snapshot 幂等约束未生效');
  idempotentSnapshot = { id: first.id, accountId, capturedAt };
}

const integrity = await request(`/integrity?t=${Date.now()}`);
if (integrity.healthy !== true) throw new Error(`完整性检查失败: ${JSON.stringify(integrity)}`);
const qualityIssues = await request(`/data-quality/issues?status=open&t=${Date.now()}`);
const automationHistory = await request(`/automations/history?t=${Date.now()}`);

console.log(
  JSON.stringify(
    {
      database: health.dependencies.database,
      redis: health.dependencies.redis,
      migrationAndRuntime: 'Compose 已部署当前迁移链',
      integrity: integrity.healthy,
      redisLock: 'NX 互斥通过',
      idempotentSnapshot,
      openDataQualityIssues: qualityIssues.length,
      automationRunRows: automationHistory.length,
    },
    null,
    2,
  ),
);
