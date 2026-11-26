import { z } from 'zod';
import { ConflictException } from '@nestjs/common';

export const backtestJobMaterializationSchema = z.discriminatedUnion('kind', [
  z.object({ version: z.literal('backtest-job-input-v1'), kind: z.literal('configured'),
    strategyVersionHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ version: z.literal('backtest-job-input-v1'), kind: z.literal('frozen-replay'),
    strategyVersionHash: z.string().regex(/^[a-f0-9]{64}$/), sourceRunId: z.string().uuid(),
    sourceSnapshotId: z.string().regex(/^[a-f0-9]{64}$/), targetRunnerId: z.string().min(1) }).strict(),
]);

export function readBacktestMaterialization(input: unknown) {
  if (!input || typeof input !== 'object' || !('materialization' in input)) return undefined;
  const parsed = backtestJobMaterializationSchema.safeParse(input.materialization);
  if (!parsed.success) throw new ConflictException({ code: 'BACKTEST_MATERIALIZATION_INVALID', message: '回测物化输入版本或身份无效，请重新准备。' });
  return parsed.data;
}

export function snapshotStorageAttempt(input: unknown, executionAttempt: unknown): number | undefined {
  if (!input || typeof input !== 'object' || !('snapshotStorageAttempt' in input)) return undefined;
  const value = input.snapshotStorageAttempt;
  if (typeof executionAttempt !== 'number' || !Number.isSafeInteger(executionAttempt) ||
    typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > executionAttempt)
    throw new ConflictException({ code: 'BACKTEST_MATERIALIZATION_INVALID', message: '回测快照存储归属无效。' });
  return value;
}
