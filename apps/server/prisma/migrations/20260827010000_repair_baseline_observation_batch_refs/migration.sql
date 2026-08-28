BEGIN;

ALTER TABLE "BaselineObservationBatch"
  ALTER COLUMN "observedAt" DROP NOT NULL,
  ALTER COLUMN "capturedAt" DROP NOT NULL;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LedgerEvent"
    WHERE "type" = 'POSITION_BASELINE_OBSERVATION'
      AND (
        jsonb_typeof("payload") IS DISTINCT FROM 'object'
        OR COALESCE("payload"->>'batchId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
  ) THEN
    RAISE EXCEPTION 'Position Baseline event contains an invalid batchId; migration is blocked';
  END IF;
END
$preflight$;

INSERT INTO "BaselineObservationBatch" (
  "id",
  "accountId",
  "scope",
  "observedAt",
  "timePrecision",
  "capturedAt",
  "recordedAt",
  "sourceCategory",
  "sourceChannel",
  "externalId",
  "evidenceRef",
  "contentHash",
  "status",
  "submittedAt"
)
SELECT
  (event."payload"->>'batchId')::uuid,
  event."accountId",
  CASE
    WHEN event."payload"->>'batchScope' IN ('FULL', 'PARTIAL')
      THEN event."payload"->>'batchScope'
    ELSE 'PARTIAL'
  END,
  CASE
    WHEN event."timePrecision" IN ('INSTANT', 'DATE') AND event."occurredAt" IS NOT NULL
      THEN event."occurredAt"
    ELSE NULL
  END,
  CASE
    WHEN event."timePrecision" IN ('INSTANT', 'DATE') AND event."occurredAt" IS NOT NULL
      THEN event."timePrecision"
    ELSE 'UNKNOWN'
  END,
  NULL,
  event."recordedAt",
  COALESCE(NULLIF(event."sourceCategory", ''), 'MIGRATION'),
  COALESCE(NULLIF(event."sourceChannel", ''), 'legacy'),
  'legacy-baseline-batch:' || event."id"::text,
  'legacy-ledger://' || event."id"::text,
  md5(event."id"::text || ':' || COALESCE(event."payload"::text, '')),
  'SUBMITTED',
  event."recordedAt"
FROM "LedgerEvent" AS event
WHERE event."type" = 'POSITION_BASELINE_OBSERVATION'
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "LedgerEvent" DISABLE TRIGGER "LedgerEvent_append_only";

UPDATE "LedgerEvent" AS event
SET "payload" = event."payload" - 'batchId'
WHERE event."type" = 'CASH_BALANCE_OBSERVATION'
  AND jsonb_typeof(event."payload") = 'object'
  AND event."payload" ? 'batchId';

ALTER TABLE "LedgerEvent" ENABLE TRIGGER "LedgerEvent_append_only";

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LedgerEvent" AS event
    LEFT JOIN "BaselineObservationBatch" AS batch
      ON batch."id" = CASE
        WHEN event."payload"->>'batchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (event."payload"->>'batchId')::uuid
        ELSE NULL
      END
    WHERE event."type" = 'POSITION_BASELINE_OBSERVATION'
      AND (
        batch."id" IS NULL
        OR batch."accountId" <> event."accountId"
      )
  ) THEN
    RAISE EXCEPTION 'Position Baseline event has no matching account batch after repair';
  END IF;
END
$postflight$;

COMMIT;
