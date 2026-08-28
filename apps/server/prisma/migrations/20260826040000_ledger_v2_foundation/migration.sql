CREATE TABLE "AccountLedgerState" (
  "accountId" UUID NOT NULL,
  "ledgerRevision" BIGINT NOT NULL DEFAULT 0,
  "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountLedgerState_pkey" PRIMARY KEY ("accountId"),
  CONSTRAINT "AccountLedgerState_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "AccountLedgerState" ("accountId")
SELECT "id" FROM "Account"
ON CONFLICT ("accountId") DO NOTHING;

ALTER TABLE "LedgerEvent"
  ADD COLUMN "factId" UUID,
  ADD COLUMN "ledgerRevision" BIGINT,
  ADD COLUMN "timePrecision" TEXT,
  ADD COLUMN "sourceTimezone" TEXT,
  ADD COLUMN "economicOrderKey" TEXT,
  ADD COLUMN "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "payloadVersion" INTEGER,
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "sourceCategory" TEXT,
  ADD COLUMN "sourceChannel" TEXT,
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "revisionAction" TEXT,
  ADD COLUMN "supersedesEventId" UUID,
  ADD COLUMN "reason" TEXT;

ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_supersedesEventId_fkey"
  FOREIGN KEY ("supersedesEventId") REFERENCES "LedgerEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LedgerEvent_v2_revisionAction_check"
  CHECK (
    "factId" IS NULL OR "revisionAction" IN ('CREATE', 'REPLACE', 'VOID', 'RESTORE')
  ),
  ADD CONSTRAINT "LedgerEvent_v2_required_fields_check"
  CHECK (
    "factId" IS NULL OR (
      "factId" IS NOT NULL
      AND "ledgerRevision" IS NOT NULL
      AND "timePrecision" IS NOT NULL
      AND "sourceTimezone" IS NOT NULL
      AND "economicOrderKey" IS NOT NULL
      AND "payloadVersion" IS NOT NULL
      AND "sourceCategory" IS NOT NULL
      AND "sourceChannel" IS NOT NULL
      AND "actorId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "LedgerEvent_v2_symbol_payload_check"
  CHECK (
    "factId" IS NULL
    OR "symbol" IS NULL
    OR "payload"->>'symbol' = "symbol"
  ),
  ADD CONSTRAINT "LedgerEvent_v2_revision_shape_check"
  CHECK (
    "factId" IS NULL
    OR (
      ("revisionAction" = 'CREATE' AND "supersedesEventId" IS NULL)
      OR (
        "revisionAction" IN ('REPLACE', 'RESTORE')
        AND "supersedesEventId" IS NOT NULL
        AND "reason" IS NOT NULL
      )
      OR (
        "revisionAction" = 'VOID'
        AND "supersedesEventId" IS NOT NULL
        AND "reason" IS NOT NULL
      )
    )
  );

CREATE INDEX "LedgerEvent_accountId_ledgerRevision_idx"
  ON "LedgerEvent"("accountId", "ledgerRevision");
DROP INDEX IF EXISTS "LedgerEvent_accountId_externalId_key";
CREATE UNIQUE INDEX "LedgerEvent_accountId_sourceChannel_externalId_key"
  ON "LedgerEvent"("accountId", "sourceChannel", "externalId");
CREATE UNIQUE INDEX "LedgerEvent_supersedesEventId_key"
  ON "LedgerEvent"("supersedesEventId");
CREATE INDEX "LedgerEvent_accountId_factId_ledgerRevision_idx"
  ON "LedgerEvent"("accountId", "factId", "ledgerRevision");
CREATE INDEX "LedgerEvent_accountId_occurredAt_economicOrderKey_id_idx"
  ON "LedgerEvent"("accountId", "occurredAt", "economicOrderKey", "id");

CREATE FUNCTION reject_ledger_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $ledger_immutable$
BEGIN
  RAISE EXCEPTION 'LedgerEvent is append-only; UPDATE and DELETE are forbidden'
    USING ERRCODE = '55000';
END
$ledger_immutable$;

CREATE TRIGGER "LedgerEvent_append_only"
BEFORE UPDATE OR DELETE ON "LedgerEvent"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_event_mutation();

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thesis_ledger_app') THEN
    REVOKE UPDATE, DELETE ON TABLE "LedgerEvent" FROM thesis_ledger_app;
  END IF;
END
$permissions$;
