BEGIN;
CREATE TABLE "ArenaOccurrence" (
  id UUID PRIMARY KEY, "arenaId" UUID NOT NULL REFERENCES "ModelArena"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "tradingDate" VARCHAR(10) NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL, "deadlineAt" TIMESTAMP(3) NOT NULL,
  "nextOpenAt" TIMESTAMP(3) NOT NULL, "calendarRevision" TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'scheduled',
  attempt INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL, "leaseUntil" TIMESTAMP(3),
  reason TEXT, UNIQUE ("arenaId","tradingDate"),
  CHECK ("dueAt" < "deadlineAt" AND "deadlineAt" <= "nextOpenAt"), CHECK (attempt >= 0 AND "maxAttempts" > 0),
  CHECK (state IN ('scheduled','running','complete','skipped','failed','expired'))
);
CREATE INDEX "ArenaOccurrence_state_dueAt_idx" ON "ArenaOccurrence"(state,"dueAt");
INSERT INTO "SchemaVersion" (id,version,"updatedAt") VALUES (1,'20261105030000_arena_occurrences',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
