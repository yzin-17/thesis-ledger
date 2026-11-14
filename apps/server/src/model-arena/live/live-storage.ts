import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { arenaLiveRemainingBudgetSchema, arenaLiveAccountSchema, arenaLiveProtocolSchema, arenaLiveSummarySchema } from '@thesis-ledger/schemas';

export type LiveDatabase = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;
export interface LiveMatchRow {
  id: string; ownerId: string; state: 'draft' | 'running' | 'paused' | 'ended';
  protocol: unknown; remaining: unknown; createdAt: Date; startedAt: Date | null; endedAt: Date | null;
}
export interface LiveAgentRow {
  id: string; matchId: string; providerId: string; model: string;
  state: 'waiting' | 'researching' | 'needs_attention' | 'budget_exhausted';
  reason: string | null; account: unknown; remaining: unknown;
}
export interface LiveCycleRow {
  id: string; matchId: string; agentId: string; state: string; trigger: string;
  attempt: number; bookRevision: number; leaseUntil: Date | null; deadlineAt: Date | null;
  reservation: unknown; input: unknown; decision: unknown; requestId: string | null;
  requestAudit: unknown; reason: string | null; createdAt: Date; completedAt: Date | null;
}
export async function liveMatch(db: LiveDatabase, id: string, ownerId?: string, lock = false) {
  const owner = ownerId ? Prisma.sql`AND "ownerId"=${ownerId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<LiveMatchRow[]>(Prisma.sql`
    SELECT * FROM "ArenaLiveMatch" WHERE id=${id}::uuid ${owner} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  if (!rows[0]) throw new NotFoundException('比赛不存在');
  return rows[0];
}
export function liveAgents(db: LiveDatabase, matchId: string, lock = false) {
  return db.$queryRaw<LiveAgentRow[]>(Prisma.sql`SELECT * FROM "ArenaLiveAgent"
    WHERE "matchId"=${matchId}::uuid ORDER BY id ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
}
export async function* liveActiveMatches(db: LiveDatabase, includePaused = true) {
  let createdAt = new Date(0), id = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const page = await db.$queryRaw<LiveMatchRow[]>`SELECT * FROM "ArenaLiveMatch"
      WHERE (state='running' OR (${includePaused} AND state='paused'))
        AND ("createdAt",id)>(${createdAt},${id}::uuid)
      ORDER BY "createdAt",id LIMIT 100`;
    for (const match of page) yield match;
    const last = page.at(-1);
    if (!last || page.length < 100) return;
    createdAt = last.createdAt; id = last.id;
  }
}
export function liveSummary(row: LiveMatchRow) {
  return arenaLiveSummarySchema.parse({
    id: row.id, state: row.state, protocol: arenaLiveProtocolSchema.parse(row.protocol),
    createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  });
}
export async function saveLiveAccount(db: LiveDatabase, agentId: string, raw: unknown) {
  const account = arenaLiveAccountSchema.parse(raw);
  await db.$executeRaw`UPDATE "ArenaLiveAgent" SET account=${JSON.stringify(account)}::jsonb WHERE id=${agentId}::uuid`;
}
export function liveRemaining(raw: unknown) { return arenaLiveRemainingBudgetSchema.parse(raw); }
