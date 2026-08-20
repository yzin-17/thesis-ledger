ALTER TABLE "MarketBar"
  ADD COLUMN "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "freshness" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "fallbackUsed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RiskEvent"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'actual';

UPDATE "RiskEvent"
SET "mode" = CASE
  WHEN "context"->>'mode' = 'shadow' THEN 'shadow'
  ELSE 'actual'
END;

CREATE INDEX "RiskEvent_mode_evaluatedAt_id_idx"
  ON "RiskEvent"("mode", "evaluatedAt", "id");
