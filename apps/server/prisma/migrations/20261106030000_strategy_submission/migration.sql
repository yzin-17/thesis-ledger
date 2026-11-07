BEGIN;
CREATE TABLE "StrategySubmission" (
  "id" UUID PRIMARY KEY, "ownerId" UUID NOT NULL, "kind" TEXT NOT NULL,
  "input" JSONB NOT NULL, "state" TEXT NOT NULL, "attempt" INTEGER NOT NULL DEFAULT 0,
  "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "prepared" JSONB, "outcome" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("kind" IN ('ordinary','nav','optimization')),
  CHECK ("state" IN ('queued','preparing','awaiting_confirmation','ready','creating','submitted','blocked'))
);
CREATE INDEX "StrategySubmission_state_nextAt_idx" ON "StrategySubmission"("state","nextAt");
CREATE INDEX "StrategySubmission_ownerId_createdAt_idx" ON "StrategySubmission"("ownerId","createdAt");
COMMIT;
