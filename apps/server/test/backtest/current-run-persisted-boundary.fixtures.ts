import { Prisma, type PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestService } from '../../src/backtest/backtest.service.js';

/** 仅供已经验证隔离库身份的 Worker 集成测试；每项负例完成后恢复输入。 */
export async function verifyPersistedCurrentRunBoundary(
  prisma: PrismaClient,
  reads: BacktestService,
  baseUrl: string,
  id: string,
) {
  const original = await prisma.backtestJob.findUniqueOrThrow({ where: { id } });
  const result = original.result as Prisma.JsonObject;
  const manifest = original.snapshotManifest as Prisma.JsonObject;
  const asJson = (value: Prisma.JsonValue | null) => (value === null ? Prisma.DbNull : value);
  const restore = {
    mode: original.mode,
    runConfig: asJson(original.runConfig),
    snapshotManifest: asJson(original.snapshotManifest),
    result: asJson(original.result),
    resultChecksum: original.resultChecksum,
  };
  const resign = (value: Prisma.JsonObject) => {
    const payload = { ...value };
    delete payload.resultChecksum;
    const resultChecksum = deterministicResultChecksum(payload);
    return { result: { ...payload, resultChecksum }, resultChecksum };
  };
  const missingModel = { ...result };
  delete missingModel.executionModelDisclosure;
  const faults: Prisma.BacktestJobUpdateInput[] = [
    { mode: 'V2' },
    { runConfig: { version: 2 } },
    { snapshotManifest: { ...manifest, manifestVersion: 'snapshot-manifest-v2' } },
    { snapshotManifest: { ...manifest, calendarVersion: 'forged-calendar' } },
    { result: { ...result, schemaVersion: '2' } },
    { result: { ...result, warnings: ['forged-result'] } },
    { snapshotManifest: Prisma.DbNull },
    resign({ ...result, contentHash: 'f'.repeat(64) }),
    resign(missingModel),
  ];
  try {
    for (const fault of faults) {
      await prisma.backtestJob.update({ where: { id }, data: { ...restore, ...fault } });
      const before = await prisma.backtestJob.findUniqueOrThrow({ where: { id } });
      const response = await fetch(`${baseUrl}/api/v1/backtests/runs/${id}`);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'UNSUPPORTED_CONTRACT_VERSION' });
      expect((await reads.listCurrentRunSummaries()).some((row) => row.id === id)).toBe(false);
      for (const operation of ['retryCurrentRunForRead', 'cancelCurrentRunForRead'] as const) {
        await expect(reads[operation](id)).rejects.toMatchObject({
          response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
        });
      }
      expect(await prisma.backtestJob.findUniqueOrThrow({ where: { id } })).toEqual(before);
    }
  } finally {
    await prisma.backtestJob.update({ where: { id }, data: restore });
  }
  const response = await fetch(`${baseUrl}/api/v1/backtests/runs/${id}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id, result: original.result });
}
