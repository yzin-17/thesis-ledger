import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = resolve(root, 'apps/server/test/fixtures');
const manifest = JSON.parse(
  await readFile(resolve(fixturesRoot, 'benchmark-manifest.json'), 'utf8'),
);
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures))
  throw new Error('benchmark-manifest schemaVersion/fixtures 无效');
for (const fixture of manifest.fixtures) {
  if (!fixture.kind || !fixture.path || !Number.isInteger(fixture.minimumCases))
    throw new Error(`基准项字段无效: ${JSON.stringify(fixture)}`);
  const parsed = JSON.parse(await readFile(resolve(fixturesRoot, fixture.path), 'utf8'));
  const cases = Array.isArray(parsed) ? parsed : [parsed];
  if (cases.length < fixture.minimumCases)
    throw new Error(`${fixture.kind} 基准样本不足: ${cases.length} < ${fixture.minimumCases}`);
}
console.log(`Benchmark manifest passed (${manifest.fixtures.length} fixture kinds)`);
