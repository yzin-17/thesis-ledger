BEGIN;

CREATE TABLE "AutomationRunLease" (
    "runId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "executionAttempt" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "recoveryPolicy" TEXT NOT NULL DEFAULT 'unknown-outcome',
    "recoveryReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRunLease_pkey" PRIMARY KEY ("runId"),
    CONSTRAINT "AutomationRunLease_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AutomationRunLease_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationRunLease_jobId_scheduledAt_key"
  ON "AutomationRunLease"("jobId", "scheduledAt")
  WHERE "trigger"='scheduled' AND "scheduledAt" IS NOT NULL;

CREATE INDEX "AutomationRunLease_leaseUntil_idx"
  ON "AutomationRunLease"("leaseUntil", "runId");

CREATE INDEX "AutomationRunLease_jobId_idx"
  ON "AutomationRunLease"("jobId", "runId");

-- 历史 AutomationRun 无法可靠区分 manual/scheduled，不伪造 scheduled occurrence。
-- 非终态历史 run 采用 unknown-outcome：部署后由 reconciler 保守终结，不自动重放副作用。
INSERT INTO "AutomationRunLease" (
  "runId", "jobId", "trigger", "executionAttempt", "claimedAt", "leaseUntil",
  "recoveryPolicy", "recoveryReason", "createdAt", "updatedAt"
)
SELECT
  r."id", r."jobId", 'legacy', GREATEST(r."attempt", 1), r."startedAt",
  CASE WHEN r."status"='running' THEN CURRENT_TIMESTAMP ELSE NULL END,
  'unknown-outcome',
  CASE WHEN r."status"='running' THEN 'legacy_running_requires_reconciliation' ELSE NULL END,
  r."startedAt", CURRENT_TIMESTAMP
FROM "AutomationRun" r
ON CONFLICT ("runId") DO NOTHING;

COMMIT;
