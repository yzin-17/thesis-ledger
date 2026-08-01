ALTER TABLE "RiskRule" ADD COLUMN "sourcePlanId" UUID;

ALTER TABLE "JournalEntry"
  ADD COLUMN "entryType" TEXT NOT NULL DEFAULT 'note',
  ADD COLUMN "accountId" UUID,
  ADD COLUMN "tradePlanId" UUID,
  ADD COLUMN "riskEventId" UUID,
  ADD COLUMN "strategyVersionId" UUID,
  ADD COLUMN "content" TEXT,
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "thesis" TEXT,
  ADD COLUMN "catalyst" TEXT,
  ADD COLUMN "risk" TEXT,
  ADD COLUMN "exitReason" TEXT;

ALTER TABLE "TradePlan"
  ADD COLUMN "accountId" UUID,
  ADD COLUMN "side" TEXT,
  ADD COLUMN "plannedEntryAt" TIMESTAMP(3),
  ADD COLUMN "plannedExitAt" TIMESTAMP(3),
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "thesis" TEXT;

CREATE INDEX "JournalEntry_accountId_createdAt_idx" ON "JournalEntry"("accountId", "createdAt");
CREATE INDEX "JournalEntry_tradePlanId_createdAt_idx" ON "JournalEntry"("tradePlanId", "createdAt");
CREATE INDEX "TradePlan_accountId_status_idx" ON "TradePlan"("accountId", "status");
