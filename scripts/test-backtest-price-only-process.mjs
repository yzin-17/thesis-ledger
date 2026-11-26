import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync('pnpm', ['--filter', '@thesis-ledger/server', 'exec', 'vitest', 'run',
  'test/backtest/daily-price-only-process.integration.test.ts', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit',
  env: { ...process.env, BACKTEST_DSA_PROCESS_ISOLATED: '1' } });
process.exitCode = result.status ?? 1;
