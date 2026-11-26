import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ResearchObservationService } from '../../src/research/research-observation.service.js';
import { comparisonOwner, comparisonReport } from './research-comparison.fixture.js';

afterEach(() => vi.useRealTimers());

it.each([
  { name: '报告生成前一毫秒', offset: -1, error: BadRequestException },
  { name: '报告生成时点', offset: 0, error: NotFoundException },
  { name: '当前时点', offset: 7 * 86_400_000, error: NotFoundException },
  { name: '当前时点后一毫秒', offset: 7 * 86_400_000 + 1, error: BadRequestException },
])('复核截止 $name 保留包含边界及写入前校验', async ({ offset, error }) => {
  const report = comparisonReport().source.detail;
  if (report.availability !== 'available' || report.result?.version !== 'research-report-result-v1')
    throw new Error('受控报告必须具有完整 V2 结果');
  const createdAt = Date.parse(report.result.createdAt);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(createdAt + 7 * 86_400_000);
  const missingClaimId = 'clock-boundary-missing-claim';
  expect(report.result.inference.claims.every((claim) => claim.id !== missingClaimId)).toBe(true);
  const access = { report: vi.fn(async () => report), lineage: vi.fn() };
  const begin = vi.fn(() => {
    throw new Error('此样本不得进入写入阶段');
  });
  const service = new ResearchObservationService(access as never, { begin } as never, {} as never);

  await expect(
    service.submit(
      comparisonOwner,
      report.id,
      { view: 'scoped', mode: 'shadow' },
      {
        submissionId: randomUUID(),
        claimId: missingClaimId,
        asOf: new Date(createdAt + offset).toISOString(),
      },
    ),
  ).rejects.toBeInstanceOf(error);

  expect(access.report).toHaveBeenCalledOnce();
  expect(access.lineage).not.toHaveBeenCalled();
  expect(begin).not.toHaveBeenCalled();
});
