ALTER TABLE "BacktestJob"
ADD COLUMN "executionAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dispatchedAt" TIMESTAMP(3),
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorSummary" TEXT;

UPDATE "BacktestJob"
SET
  "status" = 'failed',
  "progress" = 100,
  "finishedAt" = CURRENT_TIMESTAMP,
  "errorCode" = 'legacy_execution_incomplete',
  "errorSummary" = '旧版执行链未完成，任务已在队列升级时安全终止。'
WHERE "status" IN ('queued', 'running');
