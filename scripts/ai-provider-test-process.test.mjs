import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { aiProviderTestTimeout, runAiProviderTestProcess } from './ai-provider-test-process.mjs';

test('普通等待上限不变，仅显式V6十次模型批次允许有界长等待', () => {
  const environment = {
    AI_PROVIDER_TEST_TIMEOUT_MS: '3300000',
    BACKTEST_PLAN_SCENARIO: 'backtest-practical-v6',
    PRACTICAL_V6_MODEL_LIVE: '1',
  };
  const files = ['test/backtest/practical-v6-model-acceptance.integration.test.ts'];
  assert.equal(aiProviderTestTimeout(environment, files), 3300000);
  assert.throws(() => aiProviderTestTimeout(environment, ['other.test.ts']));
  assert.throws(() =>
    aiProviderTestTimeout({ ...environment, PRACTICAL_V6_MODEL_LIVE: '0' }, files),
  );
  assert.throws(() =>
    aiProviderTestTimeout({ ...environment, AI_PROVIDER_TEST_TIMEOUT_MS: '3300001' }, files),
  );
  assert.equal(aiProviderTestTimeout({}, files), 120000);
});

test('测试父进程超时后，其孙进程不能在清理阶段继续写入', async () => {
  const root = mkdtempSync(join(tmpdir(), 'provider-test-process-'));
  const ready = join(root, 'ready'),
    late = join(root, 'late');
  const descendant = `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(late)}, 'late'), 2000);`;
  const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'inherit'}); setInterval(() => {}, 1000);`;
  try {
    await assert.rejects(
      runAiProviderTestProcess(process.execPath, ['-e', parent], {
        timeout: 1000,
        stdio: 'ignore',
      }),
      { code: 'ETIMEDOUT' },
    );
    assert(existsSync(ready));
    await delay(1500);
    assert.equal(existsSync(late), false);
    const completed = await runAiProviderTestProcess(process.execPath, ['-e', 'process.exit(0)'], {
      timeout: 1000,
      stdio: 'ignore',
    });
    assert.equal(completed.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
