import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildDualReadFixtures } from './research-dual-read-fixtures.mjs';
import * as schemas from '../packages/schemas/dist/index.js';

const require = createRequire(import.meta.url);
const integrity = require('../apps/server/dist/src/ai/ai-research-frozen-integrity-v2.js');
const identity = require('../apps/server/dist/src/ai/ai-research-submission-identity-v2.js');
const binding = require('../apps/server/dist/src/ai/ai-research-run-binding-v2.js');
const numeric = require('../apps/server/dist/src/ai/ai-research-numeric-evidence-v2.js');
const sample = JSON.parse(readFileSync(new URL('../packages/schemas/fixtures/research-v2.samples.json', import.meta.url)));
const fixtures = () => buildDualReadFixtures(sample, { ...schemas, ...integrity, ...identity, ...numeric });

test('保存样本使用实际封存、身份摘要及严格结果合同，实际与模拟范围独立', () => {
  const value = fixtures();
  for (const name of ['shadow', 'actual']) {
    const row = value.runs.find(row => row.id === value.cases[name].id);
    const frozen = integrity.verifyAiFrozenResearchV2(row.modelMetadata.frozenResearch);
    assert.doesNotThrow(() => binding.assertResearchRunBindingV2(row, frozen));
    assert.equal(row.result.scopeSnapshot.mode, name);
    assert.equal(row.result.inputFingerprint, frozen.inputFingerprint);
    assert.doesNotThrow(() => numeric.verifyResearchNumericEvidenceV2(frozen, row.result.inference));
    schemas.correlateResearchResultV2(frozen, row.result,
      value.calls.filter(call => call.aiRunId === row.id).map(call => call.id));
  }
  assert.deepEqual(sample, JSON.parse(readFileSync(new URL('../packages/schemas/fixtures/research-v2.samples.json', import.meta.url))));
});

test('损坏材料与借用其他任务 Tool 的反例仍会被实际合同拒绝', () => {
  const value = fixtures();
  const corrupt = value.runs.find(row => row.id === value.cases.corrupt.id);
  assert.throws(() => integrity.verifyAiFrozenResearchV2(corrupt.modelMetadata.frozenResearch));
  const foreign = value.runs.find(row => row.id === value.cases.foreignCall.id);
  assert.throws(() => schemas.correlateResearchResultV2(foreign.modelMetadata.frozenResearch,
    foreign.result, value.calls.filter(call => call.aiRunId === foreign.id).map(call => call.id)));
});

test('V1 有审计和缺审计样本保持版本 1，不从旧 context 推断可信范围', () => {
  const value = fixtures();
  for (const name of ['legacy', 'pending']) {
    const row = value.runs.find(row => row.id === value.cases[name].id);
    assert.equal(schemas.researchResultSchema.parse(row.result).version, 1);
    assert.equal(row.researchScopeSnapshot, undefined);
    assert.equal(row.researchOwnerId, undefined);
  }
  assert(value.calls.some(call => call.aiRunId === value.cases.legacy.id));
  assert(!value.calls.some(call => call.aiRunId === value.cases.pending.id));
});
