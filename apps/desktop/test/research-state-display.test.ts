import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  researchReportDetailSchema,
  researchReportObservationsSchema,
  researchReportComparisonSchema,
} from '@thesis-ledger/schemas';
import {
  researchReportState,
  researchObservationState,
  researchComparisonState,
} from '../src/features/ai/research-state-display.js';
import {
  observationRateLabel,
  observationSampleLabel,
} from '../src/features/ai/research-observation-display.js';

const raw = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-observation.samples.json', 'utf8'),
) as { report: unknown; observations: unknown };
it('研究状态来自实际字段，完整旧报告不会仅因时间久远被推断为过期', () => {
  const report = researchReportDetailSchema.parse(raw.report);
  expect(researchReportState(null)).toBe('empty');
  expect(researchReportState(null, true)).toBe('preparing');
  expect(researchReportState({ ...report, status: 'running' })).toBe('running');
  expect(researchReportState({ ...report, quality: { status: 'complete', reasons: [] } })).toBe(
    'completed',
  );
  expect(
    researchReportState({
      ...report,
      quality: { status: 'partial', reasons: ['private_cash_projection_stale'] },
    }),
  ).toBe('data_stale');
  expect(
    researchReportState({ ...report, quality: { status: 'partial', reasons: ['unrecorded'] } }),
  ).toBe('data_unknown');
});
it('历史未到期观察到达窗口终点后提示显式复核，保持旧版本不变', () => {
  const value = researchReportObservationsSchema.parse(raw.observations),
    item = value.items[0]!;
  const old = structuredClone(item);
  old.current!.evaluation.status = 'not_due';
  old.current!.evaluation.reasons = ['not_due'];
  old.current!.inputs.visibleAt = '2026-10-20T08:00:00Z';
  old.current!.evaluation.economic.returnRate = null;
  old.current!.evaluation.economic.directionMatched = null;
  expect(researchObservationState(old, '2026-10-20T08:00:00Z')).toBe('review_not_due');
  expect(researchObservationState(old, value.asOf)).toBe('review_due');
  expect(old.current!.evaluation.status).toBe('not_due');
  expect(researchObservationState(item, value.asOf)).toBe('review_completed');
});
it('观点与输入变化分别取确定性比较维度，不能由更新时间推断', () => {
  const comparison = researchReportComparisonSchema.parse(
    JSON.parse(
      readFileSync('../../packages/schemas/fixtures/research-comparison.samples.json', 'utf8'),
    ),
  );
  expect(researchComparisonState(comparison)).toBe('opinion_changed');
  comparison.groups.find((group) => group.key === 'opinion')!.status = 'unchanged';
  expect(researchComparisonState(comparison)).toBe('input_changed');
});
it('零收益显示零，未知及样本不足保留明确标签', () => {
  expect(observationRateLabel('0')).toBe('0%');
  expect(observationRateLabel(null)).toBe('未知');
  const value = researchReportObservationsSchema.parse(raw.observations);
  expect(observationSampleLabel(value.statistics)).toBe('样本不足');
});
