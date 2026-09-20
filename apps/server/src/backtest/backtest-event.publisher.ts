import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { ResultReadPolicyService } from '../platform/result-read-policy.service.js';
import type { BacktestJobEvents } from './backtest-queue.service.js';
import { backtestJobSummarySelect, toBacktestJobSummary } from './backtest-summary.js';

export const BACKTEST_EVENT_CHANNEL = redisKey('pubsub', 'backtest-jobs');

@Injectable()
export class BacktestEventPublisher implements BacktestJobEvents {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly resultReadPolicy: ResultReadPolicyService,
  ) {
    if (!resultReadPolicy) throw new Error('ResultReadPolicyService is required');
  }

  async publishJob(jobId: string) {
    const record = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
      select: backtestJobSummarySelect,
    });
    if (!record) return;
    const summary = toBacktestJobSummary(record);
    const protectedSummary = this.resultReadPolicy.protectBacktestJob(
      summary,
      await this.resultReadPolicy.run(jobId),
    );
    await this.redis.client.publish(BACKTEST_EVENT_CHANNEL, JSON.stringify(protectedSummary));
  }
}
