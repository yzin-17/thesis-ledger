import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  watch,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import {
  saveExperimentCheckpoint,
  readExperimentHistory,
} from './research-live-experiment-checkpoint.mjs';

const moduleURL = pathToFileURL(resolve('scripts/research-live-experiment-checkpoint.mjs')).href;
test('跨Provider递归核对上层预算，累计20次和3笔原价预留，不按新免费费率清零', () => {
  mkdirSync(resolve('.recovery-artifacts'), { recursive: true });
  const root = mkdtempSync(resolve('.recovery-artifacts/history-chain-test-'));
  const old = join(root, 'old');
  const current = join(root, 'current');
  mkdirSync(old);
  mkdirSync(current);
  const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const protocol = {
    version: 'old-single',
    model: { providerId: 'cloudflare', id: 'fixed', revision: 'r1' },
    pricing: { costPer1kInput: 0.00045, costPer1kOutput: 0.0032, costCurrency: 'USD' },
    budget: { maxInputTokensPerArm: 100000, maxOutputTokensPerArm: 6000 },
    benchmarkFingerprint: 'b'.repeat(64),
    evaluationFingerprint: 'c'.repeat(64),
  };
  const next = { ...protocol, version: 'research-live-experiment-v2' };
  const target = {
    ...protocol,
    version: 'research-live-experiment-v3',
    model: { providerId: 'openrouter' },
    pricing: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
  };
  const requests = (prefix, count, amount) =>
    Array.from({ length: count }, (_, index) => ({
      requestId: prefix + index,
      facts: [
        {
          cost: {
            status: amount === null ? 'unknown' : 'estimated',
            amount,
            currency: amount === null ? null : 'USD',
          },
        },
      ],
    }));
  const result = (value, known, unknown, spent, total, parent) => ({
    protocol: value,
    protectedUnchanged: true,
    completedAt: '2026-11-01T12:00:00Z',
    realRequestsTotal: total,
    historicalBudgetFrom: parent?.sourceProof,
    report: {
      cases: [{ single: { requests: known }, staged: { requests: unknown } }],
      budget: { spent },
      historicalBudget: parent?.history,
    },
  });
  try {
    writeFileSync(
      join(old, 'result.json'),
      JSON.stringify(
        result(protocol, requests('old-k', 5, '0.001'), requests('old-u', 2, null), '0.005', 7),
      ),
    );
    const parent = readExperimentHistory(old, next, fingerprint);
    const currentResult = result(
      next,
      requests('new-k', 12, '0.002'),
      requests('new-u', 1, null),
      '0.029',
      20,
      parent,
    );
    writeFileSync(join(current, 'result.json'), JSON.stringify(currentResult));
    const data = readExperimentHistory(current, target, fingerprint).history;
    assert.equal(data.requests, 20);
    assert.equal(data.unknownRequests, 3);
    assert.equal(data.reservedUnknown, '0.1926');
    assert.equal(data.amount, '0.2216');
    currentResult.report.historicalBudget.sourceReportSha256 = '0'.repeat(64);
    writeFileSync(join(current, 'result.json'), JSON.stringify(currentResult));
    assert.throws(() => readExperimentHistory(current, target, fingerprint));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('派发检查点在自有进程强制结束后仍为完整JSON，不将未知补零', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tl-p3-checkpoint-'));
  const worker = join(directory, 'worker.mjs');
  writeFileSync(
    worker,
    `import {saveExperimentCheckpoint} from ${JSON.stringify(moduleURL)};
    saveExperimentCheckpoint(${JSON.stringify(directory)},'request.json',{phase:'dispatching',actualCost:null});
    process.stdout.write('ready');setInterval(()=>{},1000);`,
  );
  const child = spawn(process.execPath, [worker], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolveReady, reject) => {
      child.stdout.once('data', resolveReady);
      child.once('error', reject);
    });
    const closed = new Promise((done) => child.once('close', done));
    child.kill('SIGKILL');
    await closed;
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')), {
      phase: 'dispatching',
      actualCost: null,
    });
  } finally {
    child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('父进程正常结束后独立实验进程仍完成自己的原子回执', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tl-p3-detach-'));
  const worker = join(directory, 'child.mjs');
  const parent = join(directory, 'parent.mjs');
  writeFileSync(
    worker,
    `import {saveExperimentCheckpoint} from ${JSON.stringify(moduleURL)};
    setTimeout(()=>saveExperimentCheckpoint(${JSON.stringify(directory)},'alive.json',{alive:true}),300);`,
  );
  writeFileSync(
    parent,
    `import {detachExperimentWorker} from ${JSON.stringify(moduleURL)};
    detachExperimentWorker(${JSON.stringify(worker)},[],${JSON.stringify(directory)});`,
  );
  try {
    execFileSync(process.execPath, [parent], { stdio: 'pipe' });
    if (!existsSync(join(directory, 'alive.json')))
      await new Promise((done, reject) => {
        const timeout = setTimeout(() => {
          watcher.close();
          reject(new Error('独立进程未写回'));
        }, 3000);
        const watcher = watch(directory, () => {
          if (existsSync(join(directory, 'alive.json'))) {
            clearTimeout(timeout);
            watcher.close();
            done();
          }
        });
      });
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'alive.json'), 'utf8')), {
      alive: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('检查点只写固定名称，不允许越出自己的证据目录', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tl-p3-name-'));
  try {
    assert.throws(() => saveExperimentCheckpoint(directory, '../outside.json', {}));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('跨协议保留已记录费用和两笔未知预留，派发数或费用不符时拒绝', () => {
  const directory = mkdtempSync(join(resolve('.recovery-artifacts'), 'p3-history-test-'));
  const fingerprint = (value) => JSON.stringify(value);
  const protocol = {
    version: 'research-live-experiment-v2',
    transport: 'stream',
    model: { providerId: 'cloudflare', id: 'qwen', revision: 'r1' },
    pricing: { costPer1kInput: 0.00045, costPer1kOutput: 0.0032, costCurrency: 'USD' },
    budget: { maxInputTokensPerArm: 100000, maxOutputTokensPerArm: 6000 },
    benchmarkFingerprint: 'input',
    evaluationFingerprint: 'sealed',
  };
  const prior = { ...protocol, version: 'research-live-experiment-v1' };
  delete prior.transport;
  const result = {
    protectedUnchanged: true,
    completedAt: '2026-11-01T00:00:00Z',
    realRequestsTotal: 3,
    protocol: prior,
    report: {
      budget: { spent: '0.02' },
      priorUnknownRequests: [{}],
      cases: [
        {
          single: {
            requests: [
              {
                requestId: 'known',
                facts: [{ cost: { status: 'estimated', amount: '0.02', currency: 'USD' } }],
              },
            ],
          },
          staged: {
            requests: [
              {
                requestId: 'unknown',
                facts: [{ cost: { status: 'unknown', amount: null, currency: null } }],
              },
            ],
          },
        },
      ],
    },
  };
  try {
    saveExperimentCheckpoint(directory, 'result.json', result);
    const { history } = readExperimentHistory(directory, protocol, fingerprint);
    assert.equal(history.amount, '0.1484');
    assert.equal(history.reservedUnknown, '0.1284');
    assert.equal(history.requests, 3);
    assert.equal(history.unknownRequests, 2);
    result.report.budget.spent = '0.01';
    saveExperimentCheckpoint(directory, 'result.json', result);
    assert.throws(() => readExperimentHistory(directory, protocol, fingerprint));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
