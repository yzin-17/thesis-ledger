// 只读真实本地 Provider；模型配置和策略写入均位于独立隔离库。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? '');
const capture = process.argv[3] ? resolve(process.argv[3]) : null;
const entry = process.env.BACKTEST_PLAN_ENTRY ?? 'discovery';
assert(['discovery', 'authoring', 'authoring-modification', 'authoring-analysis'].includes(entry), '未知生成入口');
if (capture)
  assert(capture.startsWith(resolve(root, 'var/acceptance') + '/'), '捕获须在私有验收目录');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'), '输出必须位于私有验收目录');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
mkdirSync(output, { mode: 0o700 });
const infra = resolve(root, '../thesis-ledger-infra');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
const row = JSON.parse(
  runtime.runtime
    .dockerSync([
      'exec',
      'thesis-ledger-dev-postgres-1',
      'psql',
      '-XAtq',
      '-U',
      'thesis_ledger',
      '-d',
      'thesis_ledger',
      '-c',
      `SELECT to_jsonb(p)-'encryptedCredentials' FROM "ProviderConfig" p WHERE name='lmstudio'`,
    ])
    .trim(),
);
assert.equal(row.settings.authMode, 'none');
assert.equal(new URL(row.settings.baseUrl).hostname, '192.168.5.20');
assert.equal(row.settings.models.length, 1);
const model = row.settings.models[0];
assert.equal(row.settings.modelPricing[model].costPer1kInput, 0);
assert.equal(row.settings.modelPricing[model].costPer1kOutput, 0);
writeFileSync(resolve(output, 'provider.json'), JSON.stringify(row, null, 2), {
  mode: 0o600,
  flag: 'wx',
});
let testFile = 'test/backtest/trade-plan-model-postgres.integration.test.ts';
if (entry !== 'discovery')
  testFile = 'test/backtest/trade-plan-authoring-model-postgres.integration.test.ts';
if (entry === 'authoring-analysis') testFile = 'test/backtest/volatility-analysis-model.integration.test.ts';
if (process.env.BACKTEST_PLAN_SCENARIO === 'daily-orders')
  testFile = 'test/backtest/daily-order-model-postgres.integration.test.ts';
if (process.env.BACKTEST_PLAN_SCENARIO === 'order-validity-pilot') {
  assert.equal(entry, 'authoring-modification');
  testFile = 'test/strategy-authoring/order-validity-pilot-live.integration.test.ts';
}
if (process.env.BACKTEST_PLAN_SCENARIO === 'strategy-expressions') {
  assert.equal(process.env.STRATEGY_EXPRESSION_MODEL_LIVE, '1', '需要本轮明确模型调用授权后设置执行标志');
  testFile = 'test/backtest/strategy-expression-model-acceptance.integration.test.ts';
}
if (process.env.BACKTEST_PLAN_SCENARIO === 'strategy-expressions') {
  assert.equal(process.env.STRATEGY_EXPRESSION_MODEL_LIVE, '1', '本批真实调用必须显式启用');
  testFile = 'test/backtest/strategy-expression-model-acceptance.integration.test.ts';
}
if (process.env.BACKTEST_PLAN_SCENARIO === 'backtest-practical-v6') {
  assert(process.env.PRACTICAL_V6_MODEL_LIVE === '1' || process.env.PRACTICAL_V6_REPLAY_DIR, '需要明确模型授权或零调用回放目录');
  assert.equal(model, 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m');
  assert.equal(process.env.BACKTEST_PLAN_GENERATION_MODE, undefined, '沿用原路由，不覆盖生成模式');
  testFile = 'test/backtest/practical-v6-model-acceptance.integration.test.ts';
}
const result = spawnSync(process.execPath, ['scripts/test-ai-provider-postgres.mjs', testFile], {
  cwd: root,
  env: {
    ...process.env,
    BACKTEST_PLAN_ACCEPTANCE_DIR: output,
    ...(capture ? { BACKTEST_PLAN_CAPTURE_DIR: capture } : {}),
    AI_PROVIDER_TEST_TIMEOUT_MS: process.env.BACKTEST_PLAN_SCENARIO === 'backtest-practical-v6' && process.env.PRACTICAL_V6_MODEL_LIVE === '1' ? '3300000' : '900000',
  },
  stdio: 'inherit',
  timeout: process.env.BACKTEST_PLAN_SCENARIO === 'backtest-practical-v6' ? 3360000 : 960000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
