import { spawnSync } from 'node:child_process';

// 使用既有带资源身份及清理保护的隔离测试；不连接业务库、不调用模型或外部行情。
const tests = [
  'test/backtest/backtest-nav-postgres.integration.test.ts',
  'test/backtest/backtest-nav-worker-postgres.integration.test.ts',
  'test/strategy-optimization/completed-adoption.postgres.integration.test.ts',
  'test/strategy-optimization/adoption-consistency.postgres.integration.test.ts',
];
const result = spawnSync(
  'pnpm',
  ['--filter', '@thesis-ledger/server', 'exec', 'vitest', 'run', '--no-file-parallelism', ...tests],
  {
    cwd: new URL('../', import.meta.url),
    stdio: 'inherit',
    timeout: 180000,
    env: {
      ...process.env,
      E01_N2_6_POSTGRES: '1',
      E01_N3_POSTGRES: '1',
      COMPLETED_ADOPTION_POSTGRES: '1',
      ADOPTION_CONSISTENCY_POSTGRES: '1',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
