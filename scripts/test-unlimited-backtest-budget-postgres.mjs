import { spawnSync } from 'node:child_process';

// 复用现有隔离 PostgreSQL harness，只创建并清理带唯一身份的测试资源。
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@thesis-ledger/server',
    'exec',
    'vitest',
    'run',
    'test/strategy-optimization/unlimited-backtest-budget-postgres.integration.test.ts',
  ],
  {
    cwd: new URL('../', import.meta.url),
    stdio: 'inherit',
    timeout: 180000,
    env: { ...process.env, UNLIMITED_BACKTEST_BUDGET_POSTGRES: '1' },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
