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
-- running 交给部署后的 reconciler 保守转 unknown_outcome；极端遗留 queued 直接在迁移中终结，
-- 避免它们因没有可信 trigger/occurrence 身份而永久悬挂或被自动重放。
INSERT INTO "AutomationRunLease" (
  "runId", "jobId", "trigger", "executionAttempt", "claimedAt", "leaseUntil",
  "recoveryPolicy", "recoveryReason", "createdAt", "updatedAt"
)
SELECT
  r."id", r."jobId", 'legacy', GREATEST(r."attempt", 1), r."startedAt",
  CASE WHEN r."status"='running' THEN CURRENT_TIMESTAMP ELSE NULL END,
  'unknown-outcome',
  CASE
    WHEN r."status"='running' THEN 'legacy_running_requires_reconciliation'
    WHEN r."status"='queued' THEN 'legacy_queued_closed_during_migration'
    ELSE NULL
  END,
  r."startedAt", CURRENT_TIMESTAMP
FROM "AutomationRun" r
ON CONFLICT ("runId") DO NOTHING;

UPDATE "AutomationRun"
SET
  "status"='unknown_outcome',
  "finishedAt"=COALESCE("finishedAt", CURRENT_TIMESTAMP),
  "error"=COALESCE("error", '历史 queued Automation 无法证明 trigger/occurrence 身份，迁移时保守终结。')
WHERE "status"='queued';

COMMIT;
