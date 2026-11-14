import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { snapshotFromInspection, normalizeMounts } from '../../../daily-stock-analysis/scripts/deployment/runtime-snapshot.mjs';
import { backup, verifyBundle } from './research-state-backup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const infra = resolve(root, '../thesis-ledger-infra'), dsa = resolve(root, '../daily-stock-analysis');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const imagePattern = /^sha256:[a-f\d]{64}$/u;
let stage = '参数与正式锁校验';

export function forwardArguments(args) {
  const [mode, candidate, output] = args;
  assert(args.length === 3 && ['prepare', 'apply', 'verify'].includes(mode), '用法：prepare|apply|verify <候选完整镜像摘要> <私有证据目录>');
  assert(imagePattern.test(candidate ?? ''), '必须指定已构建候选的完整镜像摘要');
  const directory = resolve(output ?? '');
  assert(directory.startsWith(join(root, '.recovery-artifacts') + '/'), '必须使用主仓私有恢复目录');
  return { mode, candidate, directory };
}

function imageMissing(runtime, image) {
  try { runtime.runtime.dockerSync(['image', 'inspect', image]); return false; }
  catch (error) {
    if (error.code === 1 && /No such image/u.test(error.stderr ?? '')) return true;
    throw new Error('未确认旧镜像缺失；停止前向恢复');
  }
}

function protectedActivity(runtime) {
  const sql = `SELECT json_build_object('active', (SELECT count(*) FROM "ArenaLiveCycle" WHERE state='running'),
    'backtests',(SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running')));`;
  return JSON.parse(runtime.runtime.dockerSync(['exec', 'thesis-ledger-dev-postgres-1', 'psql', '-X', '-Atq',
    '-U', 'thesis_ledger', '-d', 'thesis_ledger', '-c', sql]));
}

async function prepare(runtime, options) {
  const { directory, candidate } = options, id = runtime.containerId();
  assert(id, '当前 DSA 容器缺失');
  const source = runtime.inspect(id);
  assert(imageMissing(runtime, source.imageId), '旧镜像仍可恢复，应使用正常更新入口');
  const inspect = format => runtime.runtime.dockerSync(['image', 'inspect', candidate, '--format', format]).trim();
  assert.equal(inspect('{{.Id}}'), candidate);
  assert.equal(inspect('{{index .Config.Labels "org.openai.thesis-ledger.data-runtime"}}'), 'dsa-data-runtime-v1');
  const resumed = existsSync(directory);
  if (!resumed) mkdirSync(directory, { mode: 0o700 });
  stage = '私有数据备份';
  const bundle = resumed ? await verifyBundle(join(directory, 'backup')) : await backup(join(directory, 'backup'));
  const sourceSnapshot = snapshotFromInspection(source, { dockerContext: runtime.context,
    dockerEndpoint: runtime.endpoint, envSha256: hash(readFileSync(runtime.envFile)) });
  if (resumed) {
    const previous = JSON.parse(readFileSync(join(directory, 'source-observed.json')));
    assert.equal(previous.containerId, id, '原目标已变化，不能复用备份');
    assert.equal(previous.runtime.envSha256, sourceSnapshot.envSha256, '环境已变化，不能复用备份');
  } else save(join(directory, 'source-observed.json'), { containerId: id, imageAddressable: false, runtime: sourceSnapshot });
  const baseline = execFileSync(join(dsa, '.venv/bin/python'), [join(dsa, 'scripts/local-runtime/dsa-state-retention.py'),
    'baseline', join(directory, 'backup/dsa.sqlite'), join(directory, 'backup/dsa-data.tar')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (resumed) assert.equal(hash(readFileSync(join(directory, 'baseline.json'))), hash(baseline), '数据基线已变化');
  else writeFileSync(join(directory, 'baseline.json'), baseline, { mode: 0o600, flag: 'wx' });
  const probeName = 'dsa-forward-' + randomUUID(), mounts = [
    [join(directory, 'backup/dsa.sqlite'), '/probe/dsa.sqlite'],
    [join(directory, 'backup/dsa-data.tar'), '/probe/dsa-data.tar'],
    [join(directory, 'baseline.json'), '/probe/baseline.json'],
    [join(dsa, 'scripts/local-runtime/dsa-state-retention.py'), '/probe/retention.py'],
    [join(dsa, 'scripts/local-runtime/dsa-forward-recovery-probe.py'), '/probe/probe.py'],
  ];
  let probe, probeCreated = false;
  try {
    stage = '断网候选与原数据副本验证';
    runtime.runtime.dockerSync(['create', '--name', probeName, '--network', 'none', '--read-only', '--user', '0:0',
      '--tmpfs', '/app/data:mode=0700', '--tmpfs', '/tmp:mode=1777', '--tmpfs', '/root:mode=0700',
      '--tmpfs', '/home/dsa:mode=0700', '-e', 'DATABASE_PATH=/app/data/stock_analysis.db',
      '-e', 'PYTHONDONTWRITEBYTECODE=1', ...mounts.flatMap(([src, dst]) => ['--mount', `type=bind,src=${src},dst=${dst},readonly`]),
      '--entrypoint', 'python', candidate, '/probe/probe.py']);
    probeCreated = true;
    probe = runtime.runtime.dockerSync(['inspect', '--format', '{{.Id}}', probeName]).trim();
    const output = runtime.runtime.dockerSync(['start', '--attach', probe], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const state = JSON.parse(runtime.runtime.dockerSync(['inspect', '--format', '{{json .State}}', probe]));
    assert.equal(state.ExitCode, 0, '隔离副本 SDK 与存储验证失败');
    const lines = output.trim().split('\n').filter(line => line.startsWith('THESIS_FORWARD_PROBE='));
    assert.equal(lines.length, 1, '隔离验证未返回唯一回执');
    const sdk = JSON.parse(lines[0].slice('THESIS_FORWARD_PROBE='.length));
    assert.equal(sdk.passed, true); assert.equal(sdk.networkRequests, 0);
    const actualImage = runtime.inspect(probe).imageId;
    assert.equal(runtime.runtime.dockerSync(['image', 'inspect', actualImage, '--format', '{{.Id}}']).trim(), actualImage,
      '候选运行镜像摘要不可寻址');
    assert.equal(runtime.containerId(), id, '准备期间目标容器改变');
    save(join(directory, 'target-plan.json'), { ...sourceSnapshot, createdAt: new Date().toISOString(), imageId: actualImage });
    save(join(directory, 'prepared.json'), { version: 'dsa-forward-recovery-v1', sourceId: id,
      sourceImage: source.imageId, candidate, targetImage: actualImage, preparedAt: new Date().toISOString(),
      originalImageRollbackAvailable: false, backupFiles: bundle.files, sdk,
      probeSha256: hash(readFileSync(join(dsa, 'scripts/local-runtime/dsa-forward-recovery-probe.py'))) });
    return { status: 'prepared', candidate, sdk };
  } finally {
    if (probeCreated) runtime.runtime.dockerSync(['container', 'rm', '-f', probe ?? probeName]);
  }
}

async function apply(runtime, options) {
  stage = '准备回执、目标身份与空闲窗口核对';
  const { directory, candidate } = options;
  const prepared = JSON.parse(readFileSync(join(directory, 'prepared.json')));
  assert.equal(prepared.candidate, candidate); assert.equal(prepared.version, 'dsa-forward-recovery-v1');
  assert.equal(runtime.containerId(), prepared.sourceId, '目标容器已变化，停止');
  assert(imageMissing(runtime, prepared.sourceImage), '原镜像恢复条件已变化，停止');
  const activity = protectedActivity(runtime);
  assert.equal(activity.active, 0, '还有在途研究，尚未切换 DSA');
  assert.equal(activity.backtests, 0, '还有在途回测，尚未切换 DSA');
  await verifyBundle(join(directory, 'backup'));
  const source = JSON.parse(readFileSync(join(directory, 'source-observed.json'))).runtime;
  assert.deepEqual(normalizeMounts(runtime.inspect(prepared.sourceId).mounts), normalizeMounts(source.mounts));
  const verify = () => JSON.parse(runtime.runtime.dockerSync(['exec', '-i', runtime.containerId(), 'python', '-c',
    readFileSync(join(dsa, 'scripts/local-runtime/dsa-state-retention.py'), 'utf8'), 'verify'],
  { input: readFileSync(join(directory, 'baseline.json')), maxBuffer: 32 * 1024 * 1024 }));
  stage = '原数据保持核对；数据变化时须重新准备';
  assert.equal(verify().passed, true, '准备后 DSA 业务数据变化，必须重新准备');
  const target = join(directory, 'target-plan.json');
  stage = '目标前向切换与原数据核对';
  runtime.prepareRestore(target);  // 环境、候选镜像、全部原挂载及端口完整核验先于切换。
  await runtime.restore(target, 120);
  assert.equal(verify().passed, true, '切换后原 DSA 数据未保持');
  const result = { status: 'forward_recovered', completedAt: new Date().toISOString(), candidate,
    sourceImage: prepared.sourceImage, originalImageRollbackAvailable: false, target: runtime.inspect(runtime.containerId()) };
  save(join(directory, 'applied.json'), result);
  return { status: result.status, targetImage: result.target.imageId };
}

export async function forwardRecovery(options) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须通过 infra 正式持锁入口调用');
  const runtime = new DsaRuntimeRecovery(infra, join(infra, '.env'));
  if (options.mode === 'prepare') return prepare(runtime, options);
  if (options.mode === 'apply') return apply(runtime, options);
  stage = '已切换目标的独立只读留存核对';
  const { directory, candidate } = options;
  const prepared = JSON.parse(readFileSync(join(directory, 'prepared.json')));
  assert.equal(prepared.candidate, candidate);
  const target = JSON.parse(readFileSync(join(directory, 'target-plan.json')));
  runtime.contract('restored', runtime.inspect(runtime.containerId()), target);
  await verifyBundle(join(directory, 'backup'));
  const helper = join(dsa, 'scripts/local-runtime/dsa-forward-retention.py');
  const auxiliary = JSON.parse(execFileSync(join(dsa, '.venv/bin/python'), [helper, 'baseline', join(directory, 'backup/dsa-data.tar')], { encoding: 'utf8' }));
  const retention = JSON.parse(runtime.runtime.dockerSync(['exec', '-i', runtime.containerId(), 'python', '-c', readFileSync(helper, 'utf8'), 'verify'], {
    input: JSON.stringify({ auxiliary, baseline: JSON.parse(readFileSync(join(directory, 'baseline.json'))),
      inventoryCode: readFileSync(join(dsa, 'scripts/local-runtime/dsa-state-retention.py'), 'utf8') }), maxBuffer: 4 * 1024 * 1024,
  }));
  assert.equal(retention.passed, true);
  const receipt = { status: 'forward_recovered', completedAt: new Date().toISOString(), candidate,
    sourceImage: prepared.sourceImage, originalImageRollbackAvailable: false, target: runtime.inspect(runtime.containerId()),
    strictPhysicalCheckPassed: false, retention };
  save(join(directory, 'applied.json'), receipt);
  return { status: receipt.status, targetImage: receipt.target.imageId, dataRetained: true,
    auxiliaryPhysicalBytesChanged: retention.auxiliaryPhysicalBytesChanged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await forwardRecovery(forwardArguments(process.argv.slice(2))))); }
  catch (error) {
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    const exception = stderr.match(/^(\w+(?:\.\w+)*(?:Error|Exception)):/mu)?.[1];
    const frames = stderr.split('\n').filter(line => /^\s+File "/u.test(line)).slice(-3);
    console.error(JSON.stringify({ status: 'stopped', stage, exception, frames,
      reason: error.code ? '子进程失败' : error.message, note: '私有证据保留，未执行清库或卷删除' })); process.exitCode = 1;
  }
}
