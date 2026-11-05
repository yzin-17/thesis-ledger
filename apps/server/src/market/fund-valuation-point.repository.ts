import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fundValuationSchema, type FundValuation } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

export const fundValuationDay = (at: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(at);

@Injectable()
export class FundValuationPointRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: FundValuation, observedAt: Date, evidence: unknown = null) {
    const point = fundValuationSchema.parse(input);
    if (point.marketState !== 'open') throw new Error('休市读取不能生成分钟事实');
    const minute = new Date(observedAt);
    minute.setUTCSeconds(0, 0);
    if (point.estimatedAt && Date.parse(point.estimatedAt) !== observedAt.getTime())
      throw new Error('估值事实与采样时间不一致');
    const lastValidAt = point.quality === 'unavailable' ? null : observedAt;
    const lastValidSnapshot = lastValidAt ? JSON.stringify(point) : null;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "FundValuationPoint" ("symbol", "minute", "method", "observedAt", "quality", "snapshot", "evidence", "lastValidAt", "lastValidSnapshot")
      VALUES (${point.symbol}, ${minute}, ${point.method}, ${observedAt}, ${point.quality},
        ${JSON.stringify(point)}::jsonb, ${JSON.stringify(evidence)}::jsonb, ${lastValidAt}, ${lastValidSnapshot}::jsonb)
      ON CONFLICT ("symbol", "minute", "method") DO UPDATE SET
        "observedAt" = GREATEST("FundValuationPoint"."observedAt", EXCLUDED."observedAt"),
        "quality" = CASE WHEN EXCLUDED."observedAt" > "FundValuationPoint"."observedAt" THEN EXCLUDED."quality" ELSE "FundValuationPoint"."quality" END,
        "snapshot" = CASE WHEN EXCLUDED."observedAt" > "FundValuationPoint"."observedAt" THEN EXCLUDED."snapshot" ELSE "FundValuationPoint"."snapshot" END,
        "evidence" = CASE WHEN EXCLUDED."observedAt" > "FundValuationPoint"."observedAt" THEN EXCLUDED."evidence" ELSE "FundValuationPoint"."evidence" END,
        "lastValidAt" = GREATEST("FundValuationPoint"."lastValidAt", EXCLUDED."lastValidAt"),
        "lastValidSnapshot" = CASE
          WHEN "FundValuationPoint"."lastValidAt" IS NULL OR EXCLUDED."lastValidAt" > "FundValuationPoint"."lastValidAt"
          THEN EXCLUDED."lastValidSnapshot" ELSE "FundValuationPoint"."lastValidSnapshot" END
      WHERE "FundValuationPoint"."observedAt" < EXCLUDED."observedAt"
        OR (EXCLUDED."lastValidAt" IS NOT NULL AND ("FundValuationPoint"."lastValidAt" IS NULL OR EXCLUDED."lastValidAt" > "FundValuationPoint"."lastValidAt"))
    `);
  }

  async today(symbol: string, at: Date): Promise<Array<{ at: string; valuation: FundValuation }>> {
    const start = new Date(`${fundValuationDay(at)}T00:00:00+08:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await this.prisma.fundValuationPoint.findMany({
      where: { symbol, method: 'disclosed-holdings-qfq-v1', minute: { gte: start, lt: end }, observedAt: { lte: at } },
      orderBy: { minute: 'asc' }, take: 1440,
    });
    return rows.map((row) => ({ at: row.minute.toISOString(), valuation: this.parse(row, symbol) }));
  }

  async latest(symbol: string, at: Date): Promise<FundValuation | null> {
    const row = await this.prisma.fundValuationPoint.findFirst({
      where: { symbol, method: 'disclosed-holdings-qfq-v1', lastValidAt: { lte: at } },
      orderBy: { lastValidAt: 'desc' },
    });
    if (!row?.lastValidAt) return null;
    return this.parse({ symbol: row.symbol, method: row.method, observedAt: row.lastValidAt, snapshot: row.lastValidSnapshot }, symbol);
  }

  private parse(row: { symbol: string; observedAt: Date; quality?: string; method: string; snapshot: unknown }, symbol: string) {
    const point = fundValuationSchema.parse(row.snapshot);
    if (row.symbol !== symbol || point.symbol !== symbol || row.quality !== undefined && point.quality !== row.quality || point.method !== row.method)
      throw new Error('基金分钟事实身份或质量不一致');
    if (point.estimatedAt && Date.parse(point.estimatedAt) !== row.observedAt.getTime())
      throw new Error('基金分钟事实计算时间不一致');
    return point;
  }
}
