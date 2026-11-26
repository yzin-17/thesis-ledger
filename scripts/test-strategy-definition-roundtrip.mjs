import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 浏览器输出只作为受控测试输入；实际数据库、Redis 和 Worker 由现有隔离宿主拥有及清理。
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(process.argv[2] ?? '/tmp/strategy-definition-editor-20261116');
for (const prefix of ['', 'stock-'])
  for (const platform of ['desktop', 'mobile'])
    assert(
      existsSync(resolve(directory, `${prefix}${platform}-1440-saved.json`)),
      '请先运行受控浏览器检查并保留实际提交定义',
    );
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@thesis-ledger/server',
    'exec',
    'vitest',
    'run',
    'test/backtest/strategy-definition-roundtrip.integration.test.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    timeout: 180000,
    env: {
      ...process.env,
      STRATEGY_DEFINITION_ROUNDTRIP_ISOLATED: '1',
      STRATEGY_DEFINITION_CAPTURE_DIR: directory,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
