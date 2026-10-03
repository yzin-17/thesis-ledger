import { ConflictException } from '@nestjs/common';
import type { BacktestNavResultV3 } from '@thesis-ledger/schemas';
import { verifyNavResultV3 } from './backtest-nav-result-v3.js';

type NavResultReadJob = {
  status: string;
  engineVersion: string | null;
  resultChecksum: string | null;
  result: unknown;
};

type FrozenNavInput = Parameters<typeof verifyNavResultV3>[1];

const invalid = (): never => {
  throw new ConflictException({
    code: 'NAV_RUN_INTEGRITY_INVALID',
    message: 'NAV Run 持久化结果与冻结输入不一致',
  });
};

/** 公开 NAV 结果必须与物理回放和数据库身份一致。 */
export function verifyNavResultForRead(
  job: NavResultReadJob,
  frozen: FrozenNavInput | null,
): BacktestNavResultV3 | null {
  if (job.result === null || job.result === undefined) {
    if (job.status === 'succeeded') return invalid();
    return null;
  }
  if (job.status !== 'succeeded' || !frozen) return invalid();

  try {
    const result = verifyNavResultV3(job.result, frozen);
    if (
      result.engineVersion !== job.engineVersion ||
      result.resultChecksum !== job.resultChecksum
    ) {
      return invalid();
    }
    return result;
  } catch {
    return invalid();
  }
}
