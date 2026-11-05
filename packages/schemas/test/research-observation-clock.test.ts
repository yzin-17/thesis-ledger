import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  researchObservationVersionSchema,
  researchObservationSubmissionSchema,
  researchObservationReadQuerySchema,
  researchReportObservationsSchema,
} from '../src/index.js';

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/research-observation.samples.json', import.meta.url), 'utf8'),
);
const observations = researchReportObservationsSchema.parse(raw.observations);
const original = observations.items[0]!.current!;

describe('复核合同的精确证据时钟', () => {
  it('完成状态不能领先收盘时刻一纳秒', () => {
    const version = structuredClone(original);
    version.inputs.visibleAt = version.evaluation.window.endCloseAt!;
    version.evaluation.window.endCloseAt = '2026-10-26T07:00:00.000000001Z';
    expect(researchObservationVersionSchema.safeParse(version).success).toBe(false);
    version.evaluation.status = 'not_due';
    version.evaluation.reasons = ['not_due'];
    version.evaluation.economic.returnRate = null;
    version.evaluation.economic.directionMatched = null;
    expect(researchObservationVersionSchema.safeParse(version).success).toBe(true);
  });
  it('当前投影不能领先请求截止时点一纳秒', () => {
    const result = structuredClone(observations);
    result.items[0]!.current!.inputs.visibleAt = '2026-11-30T08:00:00.000000001Z';
    expect(researchReportObservationsSchema.safeParse(result).success).toBe(false);
  });
  it('命令与查询先规范化截止时点，来源证据保留原始精度', () => {
    const input = researchObservationSubmissionSchema.parse({
      submissionId: raw.submission.attempt.submissionId,
      claimId: raw.submission.claimId,
      asOf: '2026-11-30T16:00:00.000999999+08:00',
    });
    expect(input.asOf).toBe('2026-11-30T08:00:00.000Z');
    expect(
      researchObservationReadQuerySchema.parse({
        view: 'scoped',
        mode: 'shadow',
        asOf: '2026-11-30T16:00:00.000999999+08:00',
      }).asOf,
    ).toBe(input.asOf);
    const version = structuredClone(original);
    version.inputs.visibleAt = '2026-11-30T08:00:00.000999999Z';
    expect(researchObservationVersionSchema.parse(version).inputs.visibleAt).toBe(
      version.inputs.visibleAt,
    );
  });
  it('未知时区偏移不能成为可用的复核时刻', () => {
    const version = structuredClone(original);
    version.inputs.visibleAt = '2026-11-30T08:00:00-00:00';
    expect(researchObservationVersionSchema.safeParse(version).success).toBe(false);
  });
});
