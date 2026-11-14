BEGIN;
CREATE TABLE "JournalPeriodReviewSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "symbol" TEXT,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "ledgerRevision" BIGINT NOT NULL,
    "projectionGeneration" BIGINT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "objectFingerprints" JSONB NOT NULL,
    "analysisSnapshot" JSONB NOT NULL,
    "aiExplanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JournalPeriodReviewSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JournalPeriodReviewSnapshot_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "JournalPeriodReviewSnapshot_accountId_mode_createdAt_id_idx"
    ON "JournalPeriodReviewSnapshot"("accountId", "mode", "createdAt", "id");
CREATE INDEX "JournalPeriodReviewSnapshot_accountId_start_end_idx"
    ON "JournalPeriodReviewSnapshot"("accountId", "start", "end");
INSERT INTO "SchemaVersion"(id,version,"updatedAt")
VALUES(1,'20261114010000_journal_period_review_snapshots',CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
