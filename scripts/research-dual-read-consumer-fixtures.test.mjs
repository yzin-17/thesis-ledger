import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as schemas from '../packages/schemas/dist/index.js';
import * as domain from '../packages/domain/dist/index.js';
import { reviewEvidenceFixture } from '../apps/server/test/journal/review-evidence.fixture.ts';
import { buildConsumerFixtures } from './research-dual-read-consumer-fixtures.mjs';
const require = createRequire(import.meta.url);
const runtime = { ...schemas, ...domain,
  ...require('../apps/server/dist/src/ai/ai-frozen-research.js'),
  ...require('../apps/server/dist/src/journal/journal-review-candidate.js'),
  ...require('../apps/server/dist/src/journal/journal-review-evidence.js'),
  ...require('../apps/server/dist/src/journal/journal-review-analysis.js'),
  ...require('../apps/server/dist/src/journal/journal-review-prompt.js') };
const sample = JSON.parse(readFileSync(new URL('../packages/schemas/fixtures/research-v2.samples.json', import.meta.url)));
const v1 = { version: 1, provider: 'controlled-provider', createdAt: '2026-10-18T09:00:00Z',
  conclusion: '受控复盘', evidence: [{ claim: '合成材料', citations: [] }], risks: [], unknowns: [], disclaimer: '受控样本' };
test('单对象与周期复盘样本遵循实际冻结 V1 合同，V2 结果不通过复盘严格解析', () => {
  v1.evidence[0].citations = [{}];
  const fixtures = buildConsumerFixtures(reviewEvidenceFixture(), runtime,
    '75000000-0000-4000-8000-000000000001', v1, sample.result);
  assert.equal(fixtures.runs.length, 4);
  for (const row of fixtures.runs) {
    const frozen = runtime.aiFrozenResearchSchema.parse(row.modelMetadata.frozenResearch);
    const data = frozen.source.evidence.data;
    assert.equal(frozen.prompt.version, row.promptVersion);
    if (data.version === 'journal-review-ai-v1') schemas.journalAiFrozenEvidenceSchema.parse(data);
    else schemas.journalPeriodAiFrozenEvidenceSchema.parse(data);
    assert.equal(schemas.researchResultSchema.safeParse(row.result).success, row.result.version === 1);
  }
});
