import { arenaLiveTimelineSchema, type ArenaLiveTimeline } from '@thesis-ledger/schemas';
import type { LiveDatabase } from './live-storage.js';

export async function liveTimeline(db: LiveDatabase, id: string) {
  const [row] = await db.$queryRaw<{ clock: unknown }[]>`SELECT clock FROM "ArenaLiveTimeline" WHERE "matchId"=${id}::uuid`;
  return row ? arenaLiveTimelineSchema.parse(row.clock) : null;
}

// 调用方先持有比赛行锁；所有执行面沿用同一锁顺序。
export async function saveLiveTimeline(db: LiveDatabase, id: string, value: ArenaLiveTimeline) {
  const clock = arenaLiveTimelineSchema.parse(value);
  await db.$executeRaw`INSERT INTO "ArenaLiveTimeline" ("matchId",clock) VALUES (${id}::uuid,${JSON.stringify(clock)}::jsonb)
    ON CONFLICT ("matchId") DO UPDATE SET clock=EXCLUDED.clock,revision="ArenaLiveTimeline".revision+1,"updatedAt"=CURRENT_TIMESTAMP`;
}
