import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { practicalBrowserSamples } from './backtest-practical-browser-samples.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(process.argv[2] ?? '');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
const targets = process.argv.slice(3);
assert.deepEqual(targets, ['thesis-ledger-dev-thesis-ledger-1', 'thesis-ledger-dev-backtest-worker-1']);
const hashes = [];
async function visit(directory, area, areaRoot) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path, area, areaRoot);
    else if (entry.isFile() && path.endsWith('.js')) hashes.push({ area, path: relative(areaRoot, path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
}
for (const [area, directory] of Object.entries({ server: 'apps/server/dist/src', domain: 'packages/domain/dist', schemas: 'packages/schemas/dist', shared: 'packages/shared/dist' })) {
  const areaRoot = resolve(root, directory);
  await visit(areaRoot, area, areaRoot);
}
const sample = await practicalBrowserSamples();
const outline = structuredClone(sample.strategyRecord.versions[0].schema);
outline.signalSources = outline.signalSources.map((source) => Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'series')));
const input = { hashes, outline, scope: sample.prepared.runConfig.priceResearch.dataScope,
  protection: { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.05' } } };
const program = `globalThis.__BACKTEST_PRACTICAL_READONLY = ${JSON.stringify(input)};\n` + await readFile(new URL('./backtest-practical-target-readonly.mjs', import.meta.url), 'utf8');
const results = [];
for (const target of targets) {
  const project = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', target], { encoding: 'utf8' }).trim();
  assert.equal(project, 'thesis-ledger-dev');
  const output = execFileSync('docker', ['exec', '-i', target, 'node', '--input-type=module'], { input: program, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 150_000 });
  const line = output.split('\n').find((line) => line.startsWith('BACKTEST_PRACTICAL_READONLY '));
  assert(line, output.slice(-2000));
  results.push({ target, ...JSON.parse(line.slice('BACKTEST_PRACTICAL_READONLY '.length)) });
}
await writeFile(output, JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ targets: results.length, hashesPerTarget: hashes.length, frozenReplaysPerTarget: 2, output }));
