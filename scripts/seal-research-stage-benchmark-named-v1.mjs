import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  frozenResearchInputFingerprint,
  sealAiFrozenResearchV2,
} from '../apps/server/dist/src/ai/ai-research-frozen-integrity-v2.js';
import { experimentFingerprint } from '../apps/server/dist/src/ai/research-experiment-protocol.js';
import {
  liveBenchmarkSchema,
  liveEvaluationSchema,
  verifyLiveExperimentDataset,
} from '../apps/server/dist/src/ai/research-live-experiment-protocol.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtures = new URL('../apps/server/test/fixtures/', import.meta.url);
const benchmarkSource = readFileSync(new URL('research-stage-benchmark-v1.json', fixtures));
const evaluationSource = readFileSync(new URL('research-stage-evaluation-v1.json', fixtures));
const originalBenchmarkSha256 = '28756fd2813be775ed4edafa2b226eeef12eee443aab747901e762a0eaf56c22';
const evaluationSha256 = '714dab9eb6af79ac6bdd9b10abdf5d79fc03b09cac89d6748f0b81933a79ed00';
assert.equal(sha256(benchmarkSource), originalBenchmarkSha256, '原封存基准摘要不一致');
assert.equal(sha256(evaluationSource), evaluationSha256, '原封存评价摘要不一致');

const original = JSON.parse(benchmarkSource);
const cases = original.cases.map(({ frozen, ...entry }) => {
  const { version, resultVersion, request, scopeSnapshot, inputFingerprint, ...material } = frozen;
  assert.equal(frozenResearchInputFingerprint(frozen), inputFingerprint, entry.id);
  assert.equal(version, 'frozen-research-v2', entry.id);
  assert.equal(resultVersion, 2, entry.id);
  assert.equal(request.version, 2, entry.id);
  assert.equal(scopeSnapshot.version, 'research-scope-v2', entry.id);
  const mapped = {
    ...material,
    version: 'research-frozen-input-v1',
    resultVersion: 'research-report-result-v1',
    request: { ...request, version: 'research-report-submission-v1' },
    scopeSnapshot: { ...scopeSnapshot, version: 'research-scope-snapshot-v1' },
  };
  const current = sealAiFrozenResearchV2({ ...mapped, inputFingerprint });
  assert.deepEqual(current, { ...mapped, inputFingerprint: current.inputFingerprint }, entry.id);
  assert.notEqual(current.inputFingerprint, inputFingerprint, entry.id);
  return { ...entry, frozen: current };
});
const benchmark = liveBenchmarkSchema.parse({ ...original, cases });
assert.deepEqual(benchmark, { ...original, cases });
const evaluation = liveEvaluationSchema.parse(JSON.parse(evaluationSource));
verifyLiveExperimentDataset(benchmark, evaluation);

const benchmarkFile = 'benchmark.json';
const evaluationFile = 'evaluation.json';
const benchmarkBytes = JSON.stringify(benchmark, null, 2) + '\n';
const seal = {
  version: 'research-stage-benchmark-seal-v1',
  originalBenchmarkSha256,
  cases: benchmark.cases.length,
  benchmark: {
    file: benchmarkFile,
    sha256: sha256(benchmarkBytes),
    fingerprint: experimentFingerprint(benchmark),
  },
  evaluation: {
    file: evaluationFile,
    sha256: evaluationSha256,
    fingerprint: experimentFingerprint(evaluation),
  },
};
const outputRoot = fileURLToPath(new URL('../.recovery-artifacts/', import.meta.url));
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const output = mkdtempSync(join(outputRoot, 'research-stage-benchmark-named-v1-'));
const options = { flag: 'wx', mode: 0o600 };
writeFileSync(join(output, benchmarkFile), benchmarkBytes, options);
writeFileSync(join(output, evaluationFile), evaluationSource, options);
writeFileSync(join(output, 'seal.json'), JSON.stringify(seal, null, 2) + '\n', options);
console.log(JSON.stringify({ output, ...seal }));
