ALTER TABLE "BacktestJob"
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'V1',
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "stage" TEXT,
ADD COLUMN "snapshotId" TEXT,
ADD COLUMN "snapshotManifest" JSONB,
ADD COLUMN "runConfig" JSONB,
ADD COLUMN "diagnostics" JSONB;

CREATE UNIQUE INDEX "BacktestJob_strategyVersionId_idempotencyKey_key"
ON "BacktestJob"("strategyVersionId", "idempotencyKey");
