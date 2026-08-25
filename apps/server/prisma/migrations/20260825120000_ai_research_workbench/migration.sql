ALTER TABLE "AiRun"
  ADD COLUMN "question" TEXT,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorSummary" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "retryOfRunId" UUID,
  ADD COLUMN "executionAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3);

CREATE INDEX "AiRun_retryOfRunId_idx" ON "AiRun"("retryOfRunId");
CREATE INDEX "AiRun_status_createdAt_id_idx" ON "AiRun"("status", "createdAt", "id");
CREATE INDEX "AiRun_leaseUntil_idx" ON "AiRun"("leaseUntil");
