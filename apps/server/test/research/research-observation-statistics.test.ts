import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RESEARCH_OBSERVATION_METHOD } from '@thesis-ledger/schemas';
import {
  observationStatistics,
  selectObservationSamples,
  type ObservationSample,
} from '../../src/research/research-observation-statistics.js';
import { observationFixture } from './research-observation.fixture.js';

function sample(overrides: Partial<ObservationSample> = {}): ObservationSample {
  return {
    observationId: randomUUID(),
    lineageId: randomUUID(),
    runId: randomUUID(),
    claimId: 'direction',
    instrumentId: '00000000-0000-4000-8000-000000000001',
    direction: 'up',
    tradingDays: 5,
    methodVersion: RESEARCH_OBSERVATION_METHOD,
    artifactCreatedAt: '2026-10-16T08:00:00Z',
    versionId: randomUUID(),
    visibleAt: '2026-10-27T08:00:00Z',
    recordedAt: '2026-10-27T08:00:01Z',
    evaluation: observationFixture().completed,
    ...overrides,
  };
}
const asOf = '2026-11-30T08:00:00Z';
describe('观察与重试谱系统计', () => {
  it('同逻辑观察的输入版本和重复提交不会增加样本', () => {
    const first = sample();
    const old = {
      ...first,
      versionId: randomUUID(),
      visibleAt: '2026-10-19T08:00:00Z',
      evaluation: observationFixture().evaluation,
    };
    const selected = selectObservationSamples([first, old, first], asOf);
    expect(selected).toEqual([first]);
    expect(observationStatistics([first, old, first], asOf)).toMatchObject({
      samples: 1,
      dueSamples: 1,
      calculatedSamples: 1,
    });
  });
  it('重试谱系选择最新报告，同标的/窗口/方法只计一次', () => {
    const first = sample();
    const retry = sample({ lineageId: first.lineageId, artifactCreatedAt: '2026-10-20T08:00:00Z' });
    expect(selectObservationSamples([first, retry], asOf)).toEqual([retry]);
    expect(selectObservationSamples([first, { ...retry, tradingDays: 20 }], asOf)).toHaveLength(2);
  });
  it('排除未来截止和其他方法，晚到旧截止不能改变投影', () => {
    const first = sample();
    const old = {
      ...first,
      versionId: randomUUID(),
      visibleAt: '2026-10-19T08:00:00Z',
      recordedAt: '2026-12-10T00:00:00Z',
    };
    const future = sample({ visibleAt: '2026-12-01T00:00:00Z' });
    expect(
      selectObservationSamples([old, first, future, sample({ methodVersion: 'other' })], asOf),
    ).toEqual([first]);
  });
  it('十九个合格样本保持样本不足，二十个仅输出描述性比例', () => {
    const rows = Array.from({ length: 20 }, () => sample());
    expect(observationStatistics(rows.slice(0, 19), asOf)).toMatchObject({
      calculatedSamples: 19,
      sampleStatus: 'insufficient',
      directionMatchRate: null,
    });
    expect(observationStatistics(rows, asOf)).toMatchObject({
      calculatedSamples: 20,
      sampleStatus: 'descriptive_only',
      directionMatchRate: '1',
    });
    expect(observationStatistics(rows, asOf, true)).toMatchObject({
      sampleStatus: 'incomplete',
      directionMatchRate: null,
    });
  });
  it('到期、未到期、不适用和日期未知分别列分母及排除原因', () => {
    const { evaluation, completed } = observationFixture();
    const pending = structuredClone(completed);
    pending.status = 'not_due';
    pending.reasons = ['not_due'];
    pending.window.endSession = '2026-12-01';
    pending.window.endCloseAt = '2026-12-01T07:00:00Z';
    pending.economic.returnRate = null;
    pending.economic.directionMatched = null;
    const unsupported = structuredClone(evaluation);
    unsupported.status = 'not_applicable';
    unsupported.reasons = ['unsupported_claim'];
    const results = observationStatistics(
      [
        sample(),
        sample({ evaluation }),
        sample({ evaluation: pending }),
        sample({ evaluation: unsupported }),
      ],
      asOf,
    );
    expect(results).toMatchObject({
      samples: 4,
      dueSamples: 1,
      dueUnknownSamples: 1,
      notDueSamples: 1,
      notApplicableSamples: 1,
      calculatedSamples: 1,
    });
    expect(results.exclusions).toEqual(
      expect.arrayContaining([
        { reason: 'calendar_unqualified', count: 1 },
        { reason: 'unsupported_claim', count: 1 },
      ]),
    );
  });
  it('同一报告同窗口的矛盾方向不任意择优计命中，不改写原观察', () => {
    const first = sample();
    const other = sample({ runId: first.runId, lineageId: first.lineageId, direction: 'down' });
    const result = observationStatistics([first, other], asOf);
    expect(result).toMatchObject({
      samples: 1,
      dueSamples: 1,
      calculatedSamples: 0,
      directionMatchRate: null,
    });
    expect(result.exclusions).toContainEqual({ reason: 'ambiguous_claims', count: 1 });
    expect(first.evaluation.status).toBe('completed');
  });
});
