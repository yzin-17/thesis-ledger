import { arenaLiveFrameSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../platform/prisma.service.js';

/** 在数据库内抽取各序列极值及断线边界，避免把赛季全量 JSON 载入应用内存。 */
export class LiveValuationQuery {
  constructor(private readonly db: Pick<PrismaService, '$queryRaw'>) {}
  async latest(id: string, completeOnly = false) {
    const [row] = await this.db.$queryRaw<{ frame: unknown }[]>`SELECT frame FROM "ArenaLiveValuation"
      WHERE "matchId"=${id}::uuid AND (NOT ${completeOnly} OR frame->>'complete'='true') ORDER BY "at" DESC LIMIT 1`;
    return row ? arenaLiveFrameSchema.parse(row.frame) : null;
  }
  async before(id: string, date: string, timeZone: string) {
    const [row] = await this.db.$queryRaw<{ frame: unknown }[]>`SELECT frame FROM "ArenaLiveValuation"
      WHERE "matchId"=${id}::uuid AND ("at" AT TIME ZONE ${timeZone})::date<${date}::date ORDER BY "at" DESC LIMIT 1`;
    return row ? arenaLiveFrameSchema.parse(row.frame) : null;
  }
  async chart(id: string, seriesCount: number, softLimit = 2000) {
    const buckets = Math.max(1, Math.floor(softLimit / (2 * seriesCount + 2)));
    const rows = await this.db.$queryRaw<{ frame: Record<string, unknown>; gaps: string[] | null }[]>`
      WITH bucketed AS (
        SELECT "at",frame,ntile(${buckets}::int) OVER (ORDER BY "at") AS bucket
        FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid
      ), points AS (
        SELECT b."at",b.bucket,'agent:'||(m->>'agentId') AS series,(m->>'nav')::numeric AS value
        FROM bucketed b CROSS JOIN LATERAL jsonb_array_elements(b.frame->'marks') m
        UNION ALL
        SELECT b."at",b.bucket,'baseline:'||(m->>'id'),(m->>'nav')::numeric
        FROM bucketed b CROSS JOIN LATERAL jsonb_array_elements(b.frame->'benchmarks') m
      ), ranked AS (
        SELECT *,row_number() OVER (PARTITION BY bucket,series ORDER BY value ASC NULLS LAST,"at") AS minimum,
          row_number() OVER (PARTITION BY bucket,series ORDER BY value DESC NULLS LAST,"at") AS maximum,
          count(*) FILTER (WHERE value IS NULL) OVER (PARTITION BY series ORDER BY "at") AS missing_count,
          row_number() OVER (PARTITION BY bucket,series ORDER BY "at") AS first,
          row_number() OVER (PARTITION BY bucket,series ORDER BY "at" DESC) AS last
        FROM points
      ), selected AS (
        SELECT DISTINCT "at" FROM ranked WHERE minimum=1 OR maximum=1 OR first=1 OR last=1
      ), sampled AS (
        SELECT r.*,lag(missing_count) OVER (PARTITION BY series ORDER BY r."at") AS previous_count
        FROM ranked r WHERE EXISTS(SELECT 1 FROM selected s WHERE s."at"=r."at")
      ), gaps AS (
        SELECT "at",array_agg(series) FILTER (WHERE value IS NOT NULL AND missing_count>previous_count) AS ids
        FROM sampled GROUP BY "at"
      ) SELECT b.frame,g.ids AS gaps FROM bucketed b JOIN gaps g ON g."at"=b."at" ORDER BY b."at"`;
    return rows.map((r) => arenaLiveFrameSchema.parse({ ...r.frame, gapBefore: r.gaps ?? [] }));
  }
}
