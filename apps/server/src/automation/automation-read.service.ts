import { Injectable } from '@nestjs/common';
import type { AutomationHistoryRecord, RuleMonitorHistory } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketRuleMonitorReader } from '../market/market-rule-monitor-reader.js';
import { AutomationService } from './automation.service.js';
import { automationHistoryPage, type HistorySource } from './automation-history-page.js';
import {
  ruleMonitorAutomationId,
  ruleMonitorAutomationJob,
  ruleMonitorAutomationRun,
} from './rule-monitor-automation-projection.js';

const unavailable = {
  sourceWarnings: [{ source: 'rule-monitor' as const, code: 'rule_monitor_unavailable' as const }],
};

@Injectable()
export class AutomationReadService {
  constructor(
    private readonly automations: AutomationService,
    private readonly prisma: PrismaService,
    private readonly monitor: MarketRuleMonitorReader,
  ) {}

  async list() {
    const [jobs, status] = await Promise.all([
      this.automations.list(),
      this.monitor.status().catch(() => null),
    ]);
    const projected = ruleMonitorAutomationJob(status);
    return projected ? [...jobs, projected] : jobs;
  }

  private async localRows(
    jobId: string | undefined,
    issuesOnly: boolean,
    offset: number,
    limit: number,
  ): Promise<AutomationHistoryRecord[]> {
    const rows = await this.prisma.automationRun.findMany({
      where: this.localWhere(jobId, issuesOnly),
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
      include: { job: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      jobName: row.job.name,
      status: row.status,
      source: 'server',
      createdAt: row.startedAt.toISOString(),
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
      output: row.output,
    }));
  }

  private localWhere(jobId: string | undefined, issuesOnly: boolean) {
    return {
      ...(jobId ? { jobId } : {}),
      ...(issuesOnly ? { status: { in: ['failed', 'unknown_outcome'] } } : {}),
    };
  }

  private remoteSource(first: RuleMonitorHistory, issuesOnly: boolean): HistorySource {
    return {
      total: first.total,
      read: async (offset, limit) => {
        if (offset >= first.total) return [];
        const page =
          offset === 0 && limit === 1
            ? first
            : await this.monitor.history(offset, limit, issuesOnly);
        if (page.total !== first.total) throw new Error('监测历史读取期间发生变化');
        return page.items.map(ruleMonitorAutomationRun);
      },
    };
  }

  async history(jobId?: string, page?: number, pageSize?: number, issuesOnly = false) {
    if (jobId && jobId !== ruleMonitorAutomationId)
      return this.automations.history(jobId, page, pageSize, issuesOnly);
    const size = Number.isInteger(pageSize) && pageSize! > 0 ? Math.min(pageSize!, 100) : 20;
    const requested = Number.isInteger(page) && page! > 0 ? page! : 1;
    const [localTotal, first] = await Promise.all([
      jobId
        ? Promise.resolve(0)
        : this.prisma.automationRun.count({ where: this.localWhere(undefined, issuesOnly) }),
      this.monitor.history(0, 1, issuesOnly).catch(() => null),
    ]);
    if (!first) return this.localFallback(jobId, requested, size, issuesOnly);
    const total = localTotal + first.total;
    const totalPages = Math.ceil(total / size);
    const current = totalPages ? Math.min(requested, totalPages) : 1;
    const skip = (current - 1) * size;
    const local: HistorySource = {
      total: localTotal,
      read: (offset, limit) =>
        offset >= localTotal
          ? Promise.resolve([])
          : this.localRows(undefined, issuesOnly, offset, limit),
    };
    try {
      const items = await automationHistoryPage(
        local,
        this.remoteSource(first, issuesOnly),
        skip,
        size,
      );
      return { items, page: current, pageSize: size, total, totalPages };
    } catch {
      return this.localFallback(jobId, requested, size, issuesOnly);
    }
  }

  private async localFallback(
    jobId: string | undefined,
    page: number,
    pageSize: number,
    issuesOnly: boolean,
  ) {
    if (jobId) return { items: [], page: 1, pageSize, total: 0, totalPages: 0, ...unavailable };
    return {
      ...(await this.automations.history(undefined, page, pageSize, issuesOnly)),
      ...unavailable,
    };
  }
}
