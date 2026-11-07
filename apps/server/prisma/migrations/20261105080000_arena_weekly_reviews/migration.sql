BEGIN;
ALTER TABLE "ModelArena" ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "endedAt" TIMESTAMP(3);
CREATE TABLE "ArenaWeek" (
  id UUID PRIMARY KEY, "arenaId" UUID NOT NULL REFERENCES "ModelArena"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  week VARCHAR(10) NOT NULL, method TEXT NOT NULL, "periodStart" VARCHAR(10) NOT NULL, "periodEnd" VARCHAR(10) NOT NULL,
  cutoff TIMESTAMP(3) NOT NULL, state TEXT NOT NULL DEFAULT 'scheduled', attempt INTEGER NOT NULL DEFAULT 0, "attemptBase" INTEGER NOT NULL DEFAULT 0, "leaseUntil" TIMESTAMP(3),reason TEXT,
  UNIQUE ("arenaId",week,method)
);
CREATE INDEX "ArenaWeek_state_cutoff_idx" ON "ArenaWeek"(state,cutoff);
CREATE TABLE "ArenaWeekRevision" (
  id UUID PRIMARY KEY,"weekId" UUID NOT NULL REFERENCES "ArenaWeek"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revision INTEGER NOT NULL, digest CHAR(64) NOT NULL,report JSONB NOT NULL,"publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("weekId",revision),UNIQUE ("weekId",digest)
);
INSERT INTO "SchemaVersion"(id,version,"updatedAt") VALUES(1,'20261105080000_arena_weekly_reviews',CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
