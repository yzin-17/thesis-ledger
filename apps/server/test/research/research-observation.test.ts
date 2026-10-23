import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  researchObservationAttemptSchema,
  researchObservationEvaluationSchema,
} from '@thesis-ledger/schemas';
import {
  observationIdentity,
  researchObservationDigest,
} from '../../src/research/research-observation-identity.js';
import { observationFixture } from './research-observation.fixture.js';

describe('观察身份与结果合同', () => {
  it('提交身份不改变逻辑观察，截止时点只改变提交输入', () => {
    const { start } = observationFixture();
    const first = observationIdentity(start);
    const next = observationIdentity({
      ...start,
      submissionId: randomUUID(),
      visibleAt: '2026-10-26T08:00:00Z',
    });
    expect(first.logicalKey).toBe(next.logicalKey);
    expect(first.requestDigest).not.toBe(next.requestDigest);
    expect(
      observationIdentity({ ...start, visibleAt: '2026-10-19T16:00:00+08:00' }).requestDigest,
    ).toBe(first.requestDigest);
  });
  it.each(['artifactFingerprint', 'runId', 'claimId', 'ownerId', 'windowTradingDays', 'lineageId'])(
    '%s 改变必须产生另一逻辑观察',
    (key) => {
      const { start } = observationFixture();
      const value: Record<string, unknown> = { ...start };
      if (key === 'artifactFingerprint') value[key] = 'b'.repeat(64);
      else if (key === 'claimId') value[key] = 'other-claim';
      else if (key === 'windowTradingDays') value[key] = 20;
      else value[key] = randomUUID();
      expect(observationIdentity(value).logicalKey).not.toBe(observationIdentity(start).logicalKey);
    },
  );
  it('输入对象键序不影响摘要，缺失原因和来源修订参与摘要', () => {
    expect(researchObservationDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      researchObservationDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(researchObservationDigest({ revision: 'a', reasons: ['price_missing'] })).not.toBe(
      researchObservationDigest({ revision: 'b', reasons: ['price_missing'] }),
    );
  });
  it('完成必须具备完整固定窗口；未知不得获得收益判断', () => {
    const { evaluation, completed } = observationFixture();
    expect(researchObservationEvaluationSchema.safeParse(completed).success).toBe(true);
    expect(
      researchObservationEvaluationSchema.safeParse({ ...completed, window: evaluation.window })
        .success,
    ).toBe(false);
    expect(
      researchObservationEvaluationSchema.safeParse({
        ...completed,
        economic: { ...completed.economic, startPrice: '0' },
      }).success,
    ).toBe(false);
    expect(
      researchObservationEvaluationSchema.safeParse({ ...evaluation, economic: completed.economic })
        .success,
    ).toBe(false);
  });
  it('提交失败、完成和业务观察未知保持不同状态', () => {
    const raw = {
      submissionId: randomUUID(),
      observationId: randomUUID(),
      state: 'pending',
      expiresAt: '2026-10-19T08:00:30Z',
      errorCode: null,
      version: null,
    };
    expect(researchObservationAttemptSchema.safeParse(raw).success).toBe(true);
    expect(researchObservationAttemptSchema.safeParse({ ...raw, state: 'succeeded' }).success).toBe(
      false,
    );
    expect(
      researchObservationAttemptSchema.safeParse({
        ...raw,
        state: 'failed',
        errorCode: 'attempt_expired',
      }).success,
    ).toBe(true);
  });
});
