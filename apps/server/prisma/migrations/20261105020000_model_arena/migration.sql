BEGIN;
CREATE TABLE "ModelArena" (
  id UUID PRIMARY KEY, "ownerId" UUID NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','running','paused','ended')),
  protocol JSONB NOT NULL, remaining JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ModelArena_ownerId_createdAt_idx" ON "ModelArena" ("ownerId","createdAt");
CREATE TABLE "ArenaEntrant" (
  id UUID PRIMARY KEY, "arenaId" UUID NOT NULL REFERENCES "ModelArena"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "providerId" TEXT NOT NULL, model TEXT NOT NULL, cash DECIMAL(24,6) NOT NULL CHECK (cash>=0), remaining JSONB NOT NULL,
  UNIQUE ("arenaId","providerId",model), UNIQUE ("arenaId",id)
);
CREATE TABLE "ArenaRound" (
  id UUID PRIMARY KEY, "arenaId" UUID NOT NULL REFERENCES "ModelArena"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "tradingDate" VARCHAR(10) NOT NULL, outcome JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("arenaId","tradingDate"), UNIQUE ("arenaId",id)
);
CREATE TABLE "ArenaReservation" (
  id UUID PRIMARY KEY, "arenaId" UUID NOT NULL, "roundId" UUID NOT NULL, "entrantId" UUID NOT NULL,
  amount JSONB NOT NULL, UNIQUE ("roundId","entrantId"),
  FOREIGN KEY ("arenaId","roundId") REFERENCES "ArenaRound"("arenaId",id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY ("arenaId","entrantId") REFERENCES "ArenaEntrant"("arenaId",id) ON UPDATE CASCADE ON DELETE RESTRICT
);
INSERT INTO "SchemaVersion" (id,version,"updatedAt") VALUES (1,'20261105020000_model_arena',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
