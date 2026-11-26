import 'reflect-metadata';
import type { Job } from 'bullmq';
import { advanceBacktestComputation, evaluateIndicatorSteps, runDeterministicSimulationCooperatively } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';
import { classifyBacktestRunFailure } from '../../src/backtest/backtest-run-failure.js';

/** 专属队列注入真实Domain长计算，复用生产领取、持久取消轮询和提交CAS。 */
const prisma = new PrismaService();
export default async function processCpuFixture(job: Job<{ jobId?: string; probe?: boolean }>) {
  if (job.data.probe) return { slotReleased: true };
  if (!job.data.jobId) throw Error('CPU样本缺少Run身份');
  const current = await prisma.backtestJob.findUniqueOrThrow({ where: { id: job.data.jobId } });
  return runBacktestAttempt({ prisma, job: current, activeControllers: new Map(),
    runnerId: 'thesis-ledger-v3-local-runner-v5', execution: { attempt: current.executionAttempt + 1, maxAttempts: 3 },
    classifyFailure: (error) => classifyBacktestRunFailure(error),
    execute: async (owned, signal) => {
      const points = Array.from({ length: 50_000 }, (_, index) => {
        const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
        return { occurredAt: at, availableAt: at, status: 'available' as const, value: String(100 + index % 20) };
      });
      const stage = process.env.BACKTEST_RECOVERY_CPU_STAGE;
      console.log(JSON.stringify({ event: 'cpu-started', jobId: owned.id, stage, points: points.length }));
      try {
        if (stage === 'indicator') await advanceBacktestComputation(evaluateIndicatorSteps('RSI', points, { period: 100 }), { signal });
        else if (stage === 'simulation') await runDeterministicSimulationCooperatively({
          runId: owned.id, strategy: { executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' }, primaryTimeframe: '1d',
            exit: { type: 'compare', operator: 'lt', left: { type: 'series', sourceId: 'close', field: 'close' }, right: { type: 'constant', value: '0' } },
            entry: { type: 'compare', operator: 'lt', left: { type: 'series', sourceId: 'close', field: 'close' }, right: { type: 'constant', value: '0' } } },
          ticks: points.map((point) => ({ occurredAt: point.occurredAt })),
          sourceSeries: new Map([['close', { sourceId: 'close', symbol: '600519.SH', market: 'CN', assetType: 'stock',
            field: 'close', timeframe: '1d', adjusted: false, points }]]),
        }, { signal });
        else throw Error('未登记的CPU场景');
        throw Error('CPU样本在登记取消前结束，不能证明取消');
      } finally {
        console.log(JSON.stringify({ event: 'cpu-stopped', jobId: owned.id, stage, aborted: signal.aborted }));
      }
    } });
}
