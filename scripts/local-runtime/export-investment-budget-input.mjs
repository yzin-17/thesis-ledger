import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// 只读业务库与已冻结 Artifact；所有输出只写私有验收目录。
const output = resolve(process.argv[2] ?? '');
const acceptanceRoot = resolve('var/acceptance');
assert(output.startsWith(acceptanceRoot + '/'), '输出必须位于私有验收目录');
async function exportInput() {
  const assert = require('node:assert/strict');
  const { createHash } = require('node:crypto');
  const { PrismaClient } = require('@prisma/client');
  const { LocalSnapshotStore } =
    await import('/app/apps/server/dist/src/backtest/backtest-snapshot.js');
  const p = new PrismaClient();
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  try {
    const job = await p.backtestJob.findUniqueOrThrow({
      where: { id: '9c7efea9-9242-494b-8bec-cef825ed4b1d' },
    });
    const version = await p.strategyVersion.findUniqueOrThrow({
      where: { id: job.strategyVersionId },
    });
    const strategy = await p.strategy.findUniqueOrThrow({ where: { id: version.strategyId } });
    const versions = await p.strategyVersion.findMany({
      where: { strategyId: strategy.id },
      orderBy: { id: 'asc' },
    });
    const jobs = await p.backtestJob.findMany({
      where: { strategyVersionId: { in: versions.map((v) => v.id) } },
      orderBy: { id: 'asc' },
    });
    const provider = await p.providerConfig.findUniqueOrThrow({ where: { name: 'lmstudio' } });
    assert.equal(provider.settings.authMode, 'none');
    assert.equal(provider.settings.models.length, 1);
    const rate = provider.settings.modelPricing[provider.settings.models[0]];
    assert.equal(rate.costPer1kInput, 0);
    assert.equal(rate.costPer1kOutput, 0);
    delete provider.encryptedCredentials;
    const snapshots = new LocalSnapshotStore(
      process.env.BACKTEST_SNAPSHOT_ROOT || '/app/var/backtest',
    );
    const manifest = await snapshots.v3.replay(job.id);
    const artifacts = [];
    for (const ref of manifest.artifacts) {
      const rows = [];
      for await (const row of await snapshots.artifacts.openRead(ref)) rows.push(row);
      artifacts.push({ ref, rows });
    }
    const execution = artifacts.find((a) => a.ref.key.endsWith('/execution/bars.parquet')).rows;
    assert.equal(execution.length, 282);
    console.log(
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        job,
        version,
        manifest,
        artifacts,
        provider,
        history: {
          strategy: { id: strategy.id, hash: hash(strategy) },
          versions: versions.map((v) => ({ id: v.id, hash: hash(v) })),
          jobs: jobs.map((j) => ({ id: j.id, hash: hash(j) })),
        },
        executionRowsHash: hash(execution),
      }),
    );
  } finally {
    await p.$disconnect();
  }
}
const raw = execFileSync(
  'rtk',
  [
    'proxy',
    'docker',
    'exec',
    'thesis-ledger-dev-thesis-ledger-1',
    'node',
    '-e',
    `(${exportInput.toString()})().catch(e=>{console.error(e.message);process.exitCode=1})`,
  ],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
);
const value = JSON.parse(raw);
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
await writeFile(output, raw, { mode: 0o600, flag: 'wx' });
console.log(
  JSON.stringify({
    output,
    baseRunId: value.job.id,
    bars: 282,
    executionRowsHash: value.executionRowsHash,
    provider: value.provider.name,
    model: value.provider.settings.models[0],
    preservedVersions: value.history.versions.length,
    preservedRuns: value.history.jobs.length,
  }),
);
