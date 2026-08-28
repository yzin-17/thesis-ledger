BEGIN;

ALTER TABLE "Trade"
  ADD COLUMN "projectionFingerprint" TEXT;

ALTER TABLE "TradeCloseSlice"
  ADD COLUMN "price" DECIMAL(38, 18);

ALTER TABLE "TradePlan"
  ADD COLUMN "tradeId" TEXT;

CREATE INDEX "TradePlan_tradeId_status_idx"
  ON "TradePlan"("tradeId", "status");

CREATE TABLE "JournalReviewSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "mode" TEXT NOT NULL,
  "reviewObjectType" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "closeSliceId" TEXT,
  "factIds" JSONB NOT NULL,
  "eventIds" JSONB NOT NULL,
  "ledgerRevision" BIGINT NOT NULL,
  "projectionGeneration" BIGINT NOT NULL,
  "projectionFingerprint" TEXT,
  "fxEvidenceVersion" TEXT,
  "conversionFingerprint" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "outputSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CURRENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JournalReviewSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalReviewSnapshot_accountId_reviewObjectType_tradeId_idx"
  ON "JournalReviewSnapshot"("accountId", "reviewObjectType", "tradeId");
CREATE INDEX "JournalReviewSnapshot_tradeId_closeSliceId_createdAt_idx"
  ON "JournalReviewSnapshot"("tradeId", "closeSliceId", "createdAt");
CREATE INDEX "JournalReviewSnapshot_status_createdAt_idx"
  ON "JournalReviewSnapshot"("status", "createdAt");

COMMIT;
