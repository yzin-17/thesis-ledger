BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Trade"
    WHERE "accountMode" NOT IN ('actual', 'shadow')
      OR "lifecycle" NOT IN ('ACTIVE', 'ENDED')
      OR "exitProgress" NOT IN ('NONE', 'PARTIAL', 'FULL')
      OR "endEvidence" NOT IN ('SELL_EXECUTION', 'BALANCE_OBSERVATION', 'UNKNOWN')
      OR "completeness" NOT IN ('COMPLETE', 'PARTIAL', 'CONFLICTED')
  ) THEN
    RAISE EXCEPTION 'Trade contains an invalid state value; enum migration is blocked';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LedgerEvent"
    WHERE "factId" IS NULL
       OR "ledgerRevision" IS NULL
       OR "timePrecision" IS NULL
       OR "sourceTimezone" IS NULL
       OR "economicOrderKey" IS NULL
       OR "payloadVersion" IS NULL
       OR "payload" IS NULL
       OR "sourceCategory" IS NULL
       OR "sourceChannel" IS NULL
       OR "actorId" IS NULL
       OR "revisionAction" IS NULL
  ) THEN
    RAISE EXCEPTION 'LedgerEvent contains legacy rows; V2 schema hardening is blocked';
  END IF;
END
$preflight$;

CREATE TYPE "TradeAccountMode" AS ENUM ('actual', 'shadow');
CREATE TYPE "TradeLifecycle" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "TradeExitProgress" AS ENUM ('NONE', 'PARTIAL', 'FULL');
CREATE TYPE "TradeEndEvidence" AS ENUM ('SELL_EXECUTION', 'BALANCE_OBSERVATION', 'UNKNOWN');
CREATE TYPE "TradeEvidenceCompleteness" AS ENUM ('COMPLETE', 'PARTIAL', 'CONFLICTED');

ALTER TABLE "Trade"
  ALTER COLUMN "accountMode" TYPE "TradeAccountMode"
    USING "accountMode"::"TradeAccountMode",
  ALTER COLUMN "lifecycle" TYPE "TradeLifecycle"
    USING "lifecycle"::"TradeLifecycle",
  ALTER COLUMN "exitProgress" TYPE "TradeExitProgress"
    USING "exitProgress"::"TradeExitProgress",
  ALTER COLUMN "endEvidence" TYPE "TradeEndEvidence"
    USING "endEvidence"::"TradeEndEvidence",
  ALTER COLUMN "completeness" TYPE "TradeEvidenceCompleteness"
    USING "completeness"::"TradeEvidenceCompleteness";

ALTER TABLE "LedgerEvent" DROP CONSTRAINT IF EXISTS "LedgerEvent_symbol_fkey";
DROP INDEX IF EXISTS "LedgerEvent_symbol_occurredAt_idx";

ALTER TABLE "LedgerEvent"
  DROP COLUMN "symbol",
  DROP COLUMN "quantity",
  DROP COLUMN "price",
  DROP COLUMN "amount",
  DROP COLUMN "fee",
  DROP COLUMN "tax",
  DROP COLUMN "source",
  DROP COLUMN "currency",
  DROP COLUMN "note",
  DROP COLUMN "metadata";

COMMIT;
