BEGIN;
CREATE TABLE "ArenaLiveMatch" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'draft' CHECK ("state" IN ('draft','running','paused','ended')),
  "protocol" JSONB NOT NULL CHECK ("protocol"->>'version' = '2'),
  "remaining" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ(3), "endedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "ArenaLiveMatch_owner_created" ON "ArenaLiveMatch" ("ownerId", "createdAt");
CREATE TABLE "ArenaLiveAgent" (
  "id" UUID PRIMARY KEY,
  "matchId" UUID NOT NULL REFERENCES "ArenaLiveMatch"("id") ON DELETE RESTRICT,
  "providerId" TEXT NOT NULL, "model" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'waiting' CHECK ("state" IN ('waiting','researching','needs_attention','budget_exhausted')),
  "reason" TEXT, "account" JSONB NOT NULL, "remaining" JSONB NOT NULL,
  UNIQUE ("matchId", "providerId", "model"), UNIQUE ("matchId", "id")
);
CREATE TABLE "ArenaLiveCycle" (
  "id" UUID PRIMARY KEY, "matchId" UUID NOT NULL, "agentId" UUID NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending','running','succeeded','failed','unknown_usage','cancelled')),
  "trigger" TEXT NOT NULL, "attempt" INTEGER NOT NULL DEFAULT 0 CHECK ("attempt" >= 0),
  "leaseUntil" TIMESTAMPTZ(3), "deadlineAt" TIMESTAMPTZ(3), "bookRevision" INTEGER NOT NULL CHECK ("bookRevision" >= 0),
  "reservation" JSONB, "input" JSONB, "decision" JSONB, "requestId" UUID UNIQUE,
  "requestAudit" JSONB, "reason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMPTZ(3),
  FOREIGN KEY ("matchId", "agentId") REFERENCES "ArenaLiveAgent"("matchId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ArenaLiveCycle_one_active_agent" ON "ArenaLiveCycle"("agentId") WHERE "state" IN ('pending','running');
CREATE INDEX "ArenaLiveCycle_pending" ON "ArenaLiveCycle"("state", "createdAt");
CREATE INDEX "ArenaLiveCycle_agent_created" ON "ArenaLiveCycle"("agentId", "createdAt");
CREATE TABLE "ArenaLiveValuation" (
  "id" UUID PRIMARY KEY, "matchId" UUID NOT NULL REFERENCES "ArenaLiveMatch"("id") ON DELETE RESTRICT,
  "at" TIMESTAMPTZ(3) NOT NULL, "frame" JSONB NOT NULL, "evidence" JSONB NOT NULL, UNIQUE ("matchId", "at")
);
CREATE INDEX "ArenaLiveValuation_match_at" ON "ArenaLiveValuation"("matchId", "at");
COMMIT;
