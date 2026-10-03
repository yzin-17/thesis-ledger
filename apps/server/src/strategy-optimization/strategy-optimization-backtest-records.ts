import type { PrismaService } from '../platform/prisma.service.js';
import { backtestJobSummarySelect } from '../backtest/backtest-summary.js';
import { isCurrentRunForRead } from '../backtest/backtest-current-run-read.js';

/** 优化分组只消费当前完整读取合同；旧或损坏事实不投影成策略指标。 */
export async function currentBacktestGroupRecords(
  prisma: PrismaService,
  input: {
    jobId?: string | undefined;
    status?: string | undefined;
    strategyVersionId?: string | undefined;
  },
) {
  const records = await prisma.backtestJob.findMany({
    where: {
      mode: 'V3',
      ...(input.jobId ? { id: input.jobId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.strategyVersionId ? { strategyVersionId: input.strategyVersionId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: backtestJobSummarySelect,
  });
  return records.filter(isCurrentRunForRead);
}
