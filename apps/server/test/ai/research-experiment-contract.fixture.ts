import { expect } from 'vitest';
import {
  frozenResearchInputFingerprint,
  sealAiFrozenResearchV2,
} from '../../src/ai/ai-research-frozen-integrity-v2.js';

type FrozenSample = Record<string, unknown> & {
  request: Record<string, unknown>;
  scopeSnapshot: Record<string, unknown>;
  evidence: unknown[];
};

/** 历史实验文件仍用原摘要核验。受控测试现场封存当前合同的副本。 */
export function currentExperimentFrozenFixture(sample: FrozenSample) {
  expect(frozenResearchInputFingerprint(sample)).toBe(sample.inputFingerprint);
  const frozen = sealAiFrozenResearchV2({
    ...sample,
    version: 'research-frozen-input-v1',
    resultVersion: 'research-report-result-v1',
    request: { ...sample.request, version: 'research-report-submission-v1' },
    scopeSnapshot: { ...sample.scopeSnapshot, version: 'research-scope-snapshot-v1' },
  });
  expect(frozen.evidence).toEqual(sample.evidence);
  return frozen;
}
