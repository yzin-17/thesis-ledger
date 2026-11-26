import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const dsa = resolve(root, '../daily-stock-analysis');
const target = process.argv[2], output = resolve(process.argv[3] ?? '');
assert.equal(target, 'thesis-ledger-dev-dsa-1');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
const baseline = JSON.parse(await readFile(resolve(root, 'var/acceptance/backtest-practical-20261120/daily-stock-analysis-baseline.json'), 'utf8'));
const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: dsa, encoding: 'utf8',
}).split('\0'));
const hashes = [];
for (const file of files) {
  if (!/^(api|src|data_provider)\/.+\.py$/.test(file)) continue;
  const source = await readFile(resolve(dsa, file)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const sha256 = source === null ? null : createHash('sha256').update(source).digest('hex');
  if ((baseline.files[file] ?? null) !== sha256) hashes.push({ path: file, sha256 });
}
assert(hashes.length > 0);
const program = `
import hashlib, json, urllib.request
from pathlib import Path

expected = json.loads(${JSON.stringify(JSON.stringify(hashes))})
for item in expected:
    path = Path(item['path'])
    digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    assert digest == item['sha256'], item['path']
with urllib.request.urlopen('http://127.0.0.1:8000/api/v1/thesis-ledger/capabilities', timeout=10) as response:
    capabilities = json.load(response)
assert capabilities['dataContract'] == 'dsa-data-v1'
assert capabilities['dailyObservationContract'] == 'market-daily-tradability-window-v1'
print(json.dumps({'hashesVerified': len(expected), 'capabilities': capabilities, 'providerRequests': 0, 'businessWrites': 0}))
`;
const result = JSON.parse(execFileSync('docker', ['exec', '-i', target, 'python', '-B', '-'], {
  input: program, encoding: 'utf8', timeout: 30_000,
}));
await writeFile(output, JSON.stringify({ target, ...result }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ target, hashesVerified: result.hashesVerified, output }));
