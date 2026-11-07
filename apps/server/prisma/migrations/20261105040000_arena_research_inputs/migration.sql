BEGIN;
CREATE TABLE "ArenaResearchPacket" (
  "roundId" UUID PRIMARY KEY REFERENCES "ArenaRound"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "asOf" TIMESTAMP(3) NOT NULL, fingerprint CHAR(64) NOT NULL, "promptVersion" TEXT NOT NULL, facts JSONB NOT NULL
);
ALTER TABLE "ArenaReservation" ADD COLUMN "privateBook" JSONB,
  ADD COLUMN "decisionState" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "decision" JSONB,
  ADD COLUMN "requestAudit" JSONB,
  ADD COLUMN "requestId" UUID UNIQUE,
  ADD COLUMN "settledAt" TIMESTAMP(3);
CREATE TABLE "ArenaFill" (
  id UUID PRIMARY KEY, "reservationId" UUID NOT NULL REFERENCES "ArenaReservation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  symbol VARCHAR(80) NOT NULL, side TEXT NOT NULL CHECK (side IN ('buy','sell')), quantity DECIMAL(24,6) NOT NULL CHECK (quantity>0),
  price DECIMAL(24,6) NOT NULL CHECK(price>0), fee DECIMAL(24,6) NOT NULL CHECK(fee>=0),
  "cashDelta" DECIMAL(24,6) NOT NULL, "executedAt" TIMESTAMP(3) NOT NULL, "sourceRef" TEXT NOT NULL, UNIQUE ("reservationId",symbol)
);
CREATE INDEX "ArenaFill_executedAt_idx" ON "ArenaFill"("executedAt");
INSERT INTO "SchemaVersion" (id,version,"updatedAt") VALUES (1,'20261105040000_arena_research_inputs',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
