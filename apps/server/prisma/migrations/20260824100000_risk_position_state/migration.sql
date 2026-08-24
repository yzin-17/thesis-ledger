CREATE TABLE "RiskPositionState" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "symbol" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'actual',
  "positionId" UUID,
  "holdingPeak" DECIMAL(24,8) NOT NULL,
  "peakAt" TIMESTAMP(3) NOT NULL,
  "positionUpdatedAt" TIMESTAMP(3),
  "lastQuantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
  "lastPrice" DECIMAL(24,8) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiskPositionState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskPositionState_accountId_symbol_mode_key"
  ON "RiskPositionState"("accountId", "symbol", "mode");
CREATE INDEX "RiskPositionState_symbol_mode_idx"
  ON "RiskPositionState"("symbol", "mode");
CREATE INDEX "RiskPositionState_positionId_idx"
  ON "RiskPositionState"("positionId");

ALTER TABLE "RiskPositionState"
  ADD CONSTRAINT "RiskPositionState_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "RiskPositionState"
  ADD CONSTRAINT "RiskPositionState_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "RiskRule"
  ADD COLUMN "needsRepair" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repairReason" TEXT;

UPDATE "RiskRule"
SET "enabled" = false,
    "needsRepair" = true,
    "repairReason" = 'account-binding-required'
WHERE "scope" = 'security'
  AND "accountId" IS NULL
  AND "kind" IN ('cost-stop', 'take-profit', 'trailing-stop');

ALTER TABLE "RiskEvent"
  ADD COLUMN "scanId" UUID,
  ADD COLUMN "dedupeKey" TEXT;
UPDATE "RiskEvent"
SET "dedupeKey" = 'legacy:' || "id"::text
WHERE "dedupeKey" IS NULL;
ALTER TABLE "RiskEvent"
  ALTER COLUMN "dedupeKey" SET NOT NULL;
CREATE UNIQUE INDEX "RiskEvent_dedupeKey_key"
  ON "RiskEvent"("dedupeKey");

CREATE TABLE "RiskRuleTriggerState" (
  "id" UUID NOT NULL,
  "ruleId" UUID NOT NULL,
  "targetKey" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'actual',
  "positionId" UUID,
  "ruleVersion" INTEGER NOT NULL,
  "breachActive" BOOLEAN NOT NULL DEFAULT false,
  "activeEventId" UUID,
  "lastScanId" UUID,
  "triggeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiskRuleTriggerState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskRuleTriggerState_ruleId_targetKey_symbol_mode_key"
  ON "RiskRuleTriggerState"("ruleId", "targetKey", "symbol", "mode");
CREATE INDEX "RiskRuleTriggerState_positionId_idx"
  ON "RiskRuleTriggerState"("positionId");
CREATE INDEX "RiskRuleTriggerState_activeEventId_idx"
  ON "RiskRuleTriggerState"("activeEventId");

ALTER TABLE "RiskRuleTriggerState"
  ADD CONSTRAINT "RiskRuleTriggerState_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "RiskRule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RiskRuleTriggerState"
  ADD CONSTRAINT "RiskRuleTriggerState_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RiskRuleTriggerState"
  ADD CONSTRAINT "RiskRuleTriggerState_activeEventId_fkey"
  FOREIGN KEY ("activeEventId") REFERENCES "RiskEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
