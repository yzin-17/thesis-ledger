import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须通过 infra 正式持锁入口调用');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), infra = resolve(root, '../thesis-ledger-infra');
const [mode, day, output] = process.argv.slice(2);
assert(['preview', 'capture'].includes(mode) && /^\d{4}-\d{2}-\d{2}$/u.test(day ?? ''), '必须明确模式与日期');
assert(output && resolve(output).startsWith(resolve(root, 'var/acceptance') + '/'), '输出必须位于私有验收目录');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
const code = readFileSync(resolve(root, '../daily-stock-analysis/scripts/local-runtime/arena-us-history-capture.py'), 'utf8');
const args = ['exec', '-i', '-w', '/app', runtime.containerId(), 'python', '-', '--symbol', 'AAPL.US', '--date', day];
if (mode === 'capture') args.push('--apply');
let stdout;
try { stdout = runtime.runtime.dockerSync(args, { input: code, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
catch (error) { assert.equal(error.code, 2, '历史资料检查进程失败'); stdout = error.stdout; }
const lines = stdout.split('\n').filter(line => line.startsWith('THESIS_ARENA_US_HISTORY='));
assert.equal(lines.length, 1);
const value = JSON.parse(lines[0].slice('THESIS_ARENA_US_HISTORY='.length));
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: value.status, code: value.code, rows: value.value?.rows?.length ?? 0,
  sha256: createHash('sha256').update(readFileSync(output)).digest('hex'), output }));
if (value.status === 'stopped') process.exitCode = 2;
