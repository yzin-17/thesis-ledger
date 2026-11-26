import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 每个业务样本一次；分批复用本批私有资格，避免增加调用或扩大既有单进程等待上限。
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const infra = resolve(app, '../thesis-ledger-infra');
const root = resolve(process.argv[2] ?? '');
assert(root.startsWith(resolve(app, 'var/acceptance') + '/'), '输出必须位于私有验收目录');
assert.equal(process.env.STRATEGY_EXPRESSION_MODEL_LIVE, '1', '须显式启用已授权的真实调用');
mkdirSync(root, { recursive: true, mode: 0o700 });
const qualifications = resolve(
  process.env.STRATEGY_EXPRESSION_QUALIFICATION_DIR ?? resolve(root, 'qualifications'),
);
assert(
  qualifications.startsWith(resolve(app, 'var/acceptance') + '/'),
  '资格缓存必须位于私有验收目录',
);
const maximumCalls = Number(process.env.STRATEGY_EXPRESSION_MAX_CALLS ?? 17);
assert(
  Number.isInteger(maximumCalls) && maximumCalls > 0 && maximumCalls <= 17,
  '调用上限须在1至17之间',
);
const requested = process.env.BACKTEST_PLAN_CASES?.split(',');
mkdirSync(qualifications, { recursive: true, mode: 0o700 });
const batches = [
  ['01-relative', 'discovery', ['relative-breakout']],
  ['02-windows', 'discovery', ['count-confirmation', 'statistics-gap']],
  ['03-authoring-trend', 'authoring', ['trend']],
  ['04-authoring-directions', 'authoring', ['reversion', 'trend-synonym']],
  ['05-events-directional', 'discovery', ['captured-retest', 'directional']],
  ['06-pivot-timeframes', 'discovery', ['confirmed-divergence', 'timeframes-anchor']],
  ['07-capability-gap', 'discovery', ['unsupported-data-portfolio']],
  ['08-modification', 'authoring-modification', ['only-entry-period']],
  ['09-analysis', 'authoring-analysis', ['unspecified-average']],
];
function wireFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? wireFiles(path)
      : /^wire-\d+-\d+\.json$/.test(entry.name)
        ? [path]
        : [];
  });
}
const selectedBatches = batches
  .map(([name, entry, cases]) => [
    name,
    entry,
    cases.filter((id) => !requested || requested.includes(id)),
  ])
  .filter(([, , cases]) => cases.length);
if (requested)
  assert(
    new Set(selectedBatches.flatMap(([, , cases]) => cases)).size === new Set(requested).size,
    '请求包含未知样本',
  );
assert(selectedBatches.length > 0, '必须选择业务样本');
if (process.env.STRATEGY_EXPRESSION_REQUIRE_CACHED_QUALIFICATION === '1')
  for (const [, entry] of selectedBatches)
    assert(existsSync(resolve(qualifications, entry + '.json')), '私有资格缺失，禁止调用新探针');
const receipts = [];
for (const [name, entry, cases] of selectedBatches) {
  const output = resolve(root, name);
  const receiptPath = resolve(output, 'receipt.json');
  if (!existsSync(output)) {
    const expected = cases.length + Number(!existsSync(resolve(qualifications, entry + '.json')));
    assert(wireFiles(root).length + expected <= maximumCalls, '剩余授权不足，停止调用');
    const result = spawnSync(
      process.execPath,
      [
        'scripts/infra.mjs',
        'locked',
        '--idle',
        '--',
        process.execPath,
        resolve(app, 'scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs'),
        output,
      ],
      {
        cwd: infra,
        env: {
          ...process.env,
          npm_config_registry: 'https://registry.npmmirror.com',
          BACKTEST_PLAN_SCENARIO: 'strategy-expressions',
          BACKTEST_PLAN_CASES: cases.join(','),
          STRATEGY_EXPRESSION_QUALIFICATION_DIR: qualifications,
        },
        encoding: 'utf8',
        timeout: 970000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    writeFileSync(resolve(root, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), {
      flag: 'wx',
      mode: 0o600,
    });
    if (result.error || !existsSync(receiptPath))
      throw new Error(`本批结果尚不能确认：${name}；保留日志，停止增加调用`);
  }
  assert(existsSync(receiptPath), `已有目录缺少终态回执：${name}；不得自动重试`);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  receipts.push({ batch: name, ...receipt });
  writeFileSync(
    resolve(root, 'matrix-execution.json'),
    JSON.stringify(
      { maximumCalls, actualTransmissions: wireFiles(root).length, receipts },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      batch: name,
      transmissions: wireFiles(root).length,
      results: receipt.receipts,
    }),
  );
  const transportFailure = cases.some((id) => {
    const path = resolve(output, id + '.json');
    if (!existsSync(path)) return true;
    const result = JSON.parse(readFileSync(path, 'utf8'));
    return result.category === 'failed' && ['qualification', 'generation'].includes(result.phase);
  });
  if (transportFailure) throw new Error('资格或生成失败，已停止其余调用；未重试任何样本');
}
assert(wireFiles(root).length <= maximumCalls);
