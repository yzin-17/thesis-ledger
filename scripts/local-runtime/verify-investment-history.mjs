import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
assert(root.startsWith(resolve('var/acceptance') + '/'));
const input = JSON.parse(await readFile(resolve(root, 'input.json'), 'utf8'));
const reportName = process.argv[3] ?? 'history-verification.json';
assert(/^history-verification(?:-[a-z0-9-]+)?\.json$/.test(reportName));
async function verify() {
  const { PrismaClient } = require('@prisma/client');
  const { createHash } = require('node:crypto');
  const { readFileSync } = require('node:fs');
  const history = JSON.parse(readFileSync(0, 'utf8'));
  const p = new PrismaClient();
  const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const checks = [];
  try {
    for (const [kind, table, expected] of [
      ['strategy', p.strategy, [history.strategy]],
      ['version', p.strategyVersion, history.versions],
      ['run', p.backtestJob, history.jobs],
    ]) {
      for (const record of expected) {
        const actual = await table.findUnique({ where: { id: record.id } });
        checks.push({
          kind,
          id: record.id,
          exists: actual !== null,
          unchanged: actual !== null && hash(actual) === record.hash,
          expectedHash: record.hash,
          actualHash: actual ? hash(actual) : null,
        });
      }
    }
    console.log(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        readOnly: true,
        checks,
        passed: checks.every((c) => c.unchanged),
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
    '-i',
    'thesis-ledger-dev-thesis-ledger-1',
    'node',
    '-e',
    `(${verify.toString()})().catch(e=>{console.error(e.message);process.exitCode=1})`,
  ],
  {
    input: JSON.stringify(input.history),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  },
);
const report = JSON.parse(raw);
await writeFile(resolve(root, reportName), raw, { mode: 0o600, flag: 'wx' });
console.log(
  JSON.stringify({
    passed: report.passed,
    strategy: report.checks.filter((c) => c.kind === 'strategy').length,
    versions: report.checks.filter((c) => c.kind === 'version').length,
    runs: report.checks.filter((c) => c.kind === 'run').length,
    differences: report.checks.filter((c) => !c.unchanged),
  }),
);
assert(report.passed, '原业务记录发生变化，核对具体记录');
