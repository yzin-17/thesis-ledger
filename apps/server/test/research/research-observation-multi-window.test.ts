import { expect, it, vi } from 'vitest';
import { ResearchObservationMaterials } from '../../src/research/research-observation-materials.js';
import { parseMarketWindowEvidenceResponseV3 } from '../../src/market/market-window-response-v3.js';
import { selectObservationWindow } from '../../src/research/research-observation-method.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';
import { makeMultiWindowResponseV3 } from '../backtest/v3-multi-window-fixtures.js';

function fixture() {
  const sample = observationMarketFixture();
  const response = makeMultiWindowResponseV3(sample.data, { startedAt: '2026-10-26T07:00:00Z', completedAt: '2026-10-26T07:02:00Z' });
  const fingerprint = response.inputFingerprint;
  sample.selected.selection.response = response;
  sample.selected.evidence.inputFingerprint = fingerprint;
  sample.selected.evidence.sourcePriceBasis = response.sourcePriceBasis;
  const read = vi.fn(async () => sample.selected);
  const materials = new ResearchObservationMaterials({} as never, { readV3: read, readRetainedResearch: read } as never);
  const window = selectObservationWindow(sample.method.input).window;
  return { response, sample, read: (retained = false) => materials.prices(sample.instrument, window, sample.method.calendar, sample.method.input.asOf, retained) };
}
it.each([false, true])('合法多窗口证据保留复核材料，不因新增会话观测字段被拒（仅读已留存：%s）', async (retained) => {
  const sample = fixture();
  expect(() => parseMarketWindowEvidenceResponseV3(sample.response)).not.toThrow();
  const result = await sample.read(retained);
  expect(result.material.status).toBe('ready');
  expect(result.audit).toMatchObject({ response: { selection: { response: { windowObservations: sample.response.windowObservations } } } });
});
it.each(['extra', 'fingerprint', 'source', 'future'] as const)('多窗口的 %s 异常继续拒绝', async kind => {
  const sample = fixture();
  if (kind === 'extra') Object.assign(sample.response, { unexpected: 'metadata' });
  else if (kind === 'fingerprint') sample.response.inputFingerprint = '0'.repeat(64);
  else if (kind === 'source') sample.sample.selected.selection.target.providerId = 'other';
  else sample.response.sourcePriceBasis.observedAt = '2026-12-30T00:00:00Z';
  expect((await sample.read()).material.status).toBe('unavailable');
});
