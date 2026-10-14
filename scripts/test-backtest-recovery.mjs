import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args) => {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      BACKTEST_RECOVERY_ISOLATED: '1',
      BACKTEST_RECOVERY_BUILD_ROOT: resolve(root, 'apps/server/dist/backtest-recovery'),
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['db:generate']);
run([
  '--filter',
  '@thesis-ledger/shared',
  '--filter',
  '@thesis-ledger/domain',
  '--filter',
  '@thesis-ledger/schemas',
  'build',
]);
run([
  '--filter',
  '@thesis-ledger/server',
  'exec',
  'tsc',
  '-p',
  'tsconfig.json',
  '--outDir',
  'dist/backtest-recovery',
]);
run([
  '--filter',
  '@thesis-ledger/server',
  'exec',
  'vitest',
  'run',
  'test/backtest/backtest-process-recovery.integration.test.ts',
  ...process.argv.slice(2),
]);
