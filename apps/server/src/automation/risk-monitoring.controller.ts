import { Body, ConflictException, Controller, Get, Inject, Post } from '@nestjs/common';
import { riskMonitoringEnableSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { PrismaService } from '../platform/prisma.service.js';
import { nextCronOccurrence } from './automation.service.js';

const scanOutput = z.object({
  contextCount: z.number().int().nonnegative(),
  results: z.array(z.object({ eventId: z.string().optional(), error: z.string().optional() })),
  missingSymbols: z.array(z.unknown()),
});
function scanSummary(output: unknown) {
  const parsed = scanOutput.safeParse(output);
  if (!parsed.success) return null;
  const { contextCount, results, missingSymbols } = parsed.data;
  return {
    contextCount,
    events: results.filter((r) => r.eventId).length,
    errors: results.filter((r) => r.error).length,
    missing: missingSymbols.length,
  };
}
const type = 'risk-evaluation';
@Controller('automations/risk-monitoring')
export class RiskMonitoringController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get()
  async status() {
    const rows = await this.db.automationJob.findMany({
      where: { type },
      orderBy: { id: 'asc' },
      include: {
        runs: {
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { status: true, startedAt: true, output: true },
        },
      },
    });
    return rows.map(({ id, name, enabled, cron, timezone, nextRunAt, runs }) => ({
      id,
      name,
      enabled,
      cron,
      timezone,
      nextRunAt,
      lastRun: runs[0]
        ? {
            status: runs[0].status,
            startedAt: runs[0].startedAt,
            actual: scanSummary(runs[0].output),
          }
        : null,
    }));
  }

  @Post('enable')
  async enable(@Body() raw: unknown) {
    const { jobId } = riskMonitoringEnableSchema.parse(raw);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72411, 2)`;
      const rows = await tx.automationJob.findMany({ where: { type }, orderBy: { id: 'asc' } });
      if (rows.some((row) => row.enabled)) return;
      if (jobId) {
        const row = rows.find((r) => r.id === jobId);
        if (!row) throw new ConflictException('扫描任务已变化，请重新读取');
        await tx.automationJob.update({
          where: { id: row.id },
          data: {
            enabled: true,
            nextRunAt: nextCronOccurrence(row.cron, row.timezone),
          },
        });
        return;
      }
      throw new ConflictException('规则启用后自动参与监控，无需创建收盘扫描任务；已有任务可在自动化设置管理');
    });
    return this.status();
  }
}
