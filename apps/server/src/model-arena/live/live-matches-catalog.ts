import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { arenaCatalogResultSchema, type ArenaCatalogQuery } from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';

const ordering = {
  created_desc: Prisma.sql`"createdAt" DESC, id, kind`,
  created_asc: Prisma.sql`"createdAt", id, kind`,
  title: Prisma.sql`title, "createdAt" DESC, id, kind`,
  season_desc: Prisma.sql`"startsOn" DESC NULLS LAST, "createdAt" DESC, id, kind`,
};

/** 两类比赛在同一读取快照内筛选和分页，账户归属先于任何条件。 */
@Injectable()
export class LiveMatchesCatalog {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async read(ownerId: string, query: ArenaCatalogQuery) {
    const [result] = await this.db.$queryRaw<unknown[]>(Prisma.sql`
      WITH owned AS (
        SELECT id, 'live' AS kind, protocol, state, "createdAt" FROM "ArenaLiveMatch" WHERE "ownerId"=${ownerId}::uuid
        UNION ALL
        SELECT id, 'history' AS kind, protocol, state, "createdAt" FROM "ModelArena" WHERE "ownerId"=${ownerId}::uuid
      ), projected AS (
        SELECT id, kind, protocol->>'title' AS title, protocol->>'market' AS market, state,
          protocol->>'startsOn' AS "startsOn", protocol->>'endsOn' AS "endsOn",
          to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
          (SELECT jsonb_agg(jsonb_build_object('providerId', e->>'providerId', 'model', e->>'model'))
            FROM jsonb_array_elements(protocol->'entrants') e) AS models
        FROM owned
      ), filtered AS (
        SELECT * FROM projected WHERE (${query.kind}='all' OR kind=${query.kind})
          AND (${query.market}='all' OR market=${query.market}) AND (${query.state}='all' OR state=${query.state})
          AND (${query.search}='' OR strpos(lower(title), lower(${query.search}))>0 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(models) e
            WHERE strpos(lower(e->>'model'), lower(${query.search}))>0
              OR strpos(lower(e->>'providerId'), lower(${query.search}))>0))
      ), totals AS (
        SELECT (SELECT count(*)::int FROM filtered) AS total, (SELECT count(*)::int FROM owned) AS "totalUnfiltered"
      ), bounds AS (
        SELECT *, least(${query.page}, greatest(1, ceil(total::numeric / ${query.pageSize})))::int AS page FROM totals
      ), selected AS (
        SELECT * FROM filtered ORDER BY ${ordering[query.sort]} LIMIT ${query.pageSize}
        OFFSET (SELECT (page - 1) * ${query.pageSize} FROM bounds)
      ) SELECT coalesce((SELECT jsonb_agg(selected) FROM selected), '[]'::jsonb) AS items,
        total, "totalUnfiltered", page, ${query.pageSize}::int AS "pageSize" FROM bounds
    `);
    return arenaCatalogResultSchema.parse(result);
  }
}
