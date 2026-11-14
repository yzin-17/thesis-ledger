import { spawnSync } from 'node:child_process';

// 隔离 PostgreSQL、Redis、HTTP 与真实 Worker；使用确定性行情，不调用外部 AI。
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@thesis-ledger/server',
    'exec',
    'vitest',
    'run',
    'test/backtest/price-research-worker.integration.test.ts',
  ],
  {
    cwd: new URL('../', import.meta.url),
    stdio: 'inherit',
    timeout: 180000,
    env: { ...process.env, PRICE_RESEARCH_WORKER_ISOLATED: '1' },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
