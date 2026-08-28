ALTER TABLE "LedgerEvent"
  ALTER COLUMN "occurredAt" DROP NOT NULL;

ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_v2_unknown_time_check"
  CHECK (
    "factId" IS NULL
    OR "occurredAt" IS NOT NULL
    OR "timePrecision" = 'UNKNOWN'
  );
