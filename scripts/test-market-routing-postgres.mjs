import { spawnSync } from 'node:child_process';

// 资源创建、身份核对、完整迁移和失败清理由仓库隔离数据库 harness 负责。
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@thesis-ledger/server',
    'exec',
    'vitest',
    'run',
    'test/market/market-routing-postgres.integration.test.ts',
  ],
  {
    cwd: new URL('../', import.meta.url),
    stdio: 'inherit',
    timeout: 180000,
    env: { ...process.env, MARKET_ROUTING_POSTGRES: '1' },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
