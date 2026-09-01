ALTER TABLE "NotificationDelivery"
  ADD COLUMN "subjectType" TEXT,
  ADD COLUMN "subjectId" TEXT,
  ADD COLUMN "message" JSONB;

UPDATE "NotificationDelivery" AS delivery
SET
  "subjectType" = 'risk-event',
  "subjectId" = delivery."eventId"::text,
  "message" = jsonb_build_object(
    'title', '风险提醒',
    'body', event."message",
    'severity', CASE
      WHEN delivery."severity" IN ('info', 'warning', 'error', 'critical') THEN delivery."severity"
      ELSE 'warning'
    END,
    'traceId', COALESCE(NULLIF(event."context"->>'traceId', ''), delivery."id"::text)
  )
FROM "RiskEvent" AS event
WHERE event."id" = delivery."eventId";

ALTER TABLE "NotificationDelivery"
  ALTER COLUMN "subjectType" SET NOT NULL,
  ALTER COLUMN "subjectId" SET NOT NULL,
  ALTER COLUMN "message" SET NOT NULL;

ALTER TABLE "NotificationDelivery"
  DROP CONSTRAINT "NotificationDelivery_eventId_fkey",
  DROP COLUMN "eventId";

DROP INDEX IF EXISTS "NotificationDelivery_eventId_idx";

CREATE INDEX "NotificationDelivery_subjectType_subjectId_idx"
ON "NotificationDelivery"("subjectType", "subjectId");

CREATE TABLE "RecurringCashDepositPlan" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "expectedAmount" DECIMAL(38,18) NOT NULL,
  "currency" TEXT NOT NULL,
  "dayOfMonth" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "startPeriod" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "nextDueAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "pausedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecurringCashDepositPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringCashDepositPlan_dayOfMonth_check" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  CONSTRAINT "RecurringCashDepositPlan_expectedAmount_check" CHECK ("expectedAmount" > 0),
  CONSTRAINT "RecurringCashDepositPlan_version_check" CHECK ("version" > 0),
  CONSTRAINT "RecurringCashDepositPlan_timezone_check" CHECK ("timezone" = 'Asia/Shanghai'),
  CONSTRAINT "RecurringCashDepositPlan_startPeriod_check" CHECK ("startPeriod" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "RecurringCashDepositPlan_status_check" CHECK ("status" IN ('ACTIVE', 'PAUSED', 'ENDED')),
  CONSTRAINT "RecurringCashDepositPlan_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RecurringCashDepositPlan_accountId_status_idx"
ON "RecurringCashDepositPlan"("accountId", "status");

CREATE INDEX "RecurringCashDepositPlan_status_nextDueAt_idx"
ON "RecurringCashDepositPlan"("status", "nextDueAt");

CREATE TABLE "RecurringCashDepositOccurrence" (
  "id" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "periodKey" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "expectedAmount" DECIMAL(38,18) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "actualAmount" DECIMAL(38,18),
  "occurredAt" TIMESTAMP(3),
  "ledgerEventId" UUID,
  "ledgerFactId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "skippedReason" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecurringCashDepositOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringCashDepositOccurrence_expectedAmount_check" CHECK ("expectedAmount" > 0),
  CONSTRAINT "RecurringCashDepositOccurrence_actualAmount_check" CHECK ("actualAmount" IS NULL OR "actualAmount" > 0),
  CONSTRAINT "RecurringCashDepositOccurrence_version_check" CHECK ("version" > 0),
  CONSTRAINT "RecurringCashDepositOccurrence_periodKey_check" CHECK ("periodKey" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "RecurringCashDepositOccurrence_status_check" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'SKIPPED')),
  CONSTRAINT "RecurringCashDepositOccurrence_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "RecurringCashDepositPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurringCashDepositOccurrence_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurringCashDepositOccurrence_ledgerEventId_fkey"
    FOREIGN KEY ("ledgerEventId") REFERENCES "LedgerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecurringCashDepositOccurrence_planId_periodKey_key"
ON "RecurringCashDepositOccurrence"("planId", "periodKey");

CREATE INDEX "RecurringCashDepositOccurrence_accountId_status_scheduledFor_idx"
ON "RecurringCashDepositOccurrence"("accountId", "status", "scheduledFor");

CREATE INDEX "RecurringCashDepositOccurrence_status_scheduledFor_idx"
ON "RecurringCashDepositOccurrence"("status", "scheduledFor");

CREATE INDEX "RecurringCashDepositOccurrence_ledgerEventId_idx"
ON "RecurringCashDepositOccurrence"("ledgerEventId");

CREATE UNIQUE INDEX "AutomationJob_cash_deposit_materialization_singleton_key"
ON "AutomationJob"("type")
WHERE "type" = 'cash-deposit-materialization';

INSERT INTO "AutomationJob" (
  "id",
  "name",
  "type",
  "cron",
  "timezone",
  "enabled",
  "retryPolicy",
  "lockTtlMs",
  "nextRunAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000010',
  '定期现金入账实例生成',
  'cash-deposit-materialization',
  '0 9 * * *',
  'Asia/Shanghai',
  TRUE,
  '{"maxAttempts":3,"backoffMs":1000}'::jsonb,
  300000,
  CURRENT_TIMESTAMP
);
