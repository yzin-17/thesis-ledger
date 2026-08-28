BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" IN ('BUY', 'SELL')
      AND (
        "fee" IS NULL OR "tax" IS NULL
        OR "fee" < 0 OR "tax" < 0
        OR lower("fee"::text) IN ('nan', 'infinity', '-infinity')
        OR lower("tax"::text) IN ('nan', 'infinity', '-infinity')
      )
  ) THEN
    RAISE EXCEPTION
      'Legacy BUY/SELL contains a missing, negative, or non-finite fee/tax value; migration is blocked'
      USING ERRCODE = 'check_violation';
  END IF;
END
$preflight$;

CREATE TABLE "AccountCostStrategyVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountCostStrategyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountCostStrategyVersion_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountCostStrategyVersion_method_check"
    CHECK ("method" IN ('AVG', 'FIFO'))
);

CREATE UNIQUE INDEX "AccountCostStrategyVersion_accountId_revision_key"
  ON "AccountCostStrategyVersion"("accountId", "revision");
CREATE INDEX "AccountCostStrategyVersion_accountId_effectiveAt_idx"
  ON "AccountCostStrategyVersion"("accountId", "effectiveAt");

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" NOT IN (
      'BUY', 'SELL', 'BONUS', 'SPLIT', 'MERGE', 'DIVIDEND',
      'FEE', 'TAX', 'INTEREST', 'TRANSFER_IN', 'TRANSFER_OUT',
      'CASH_DEPOSIT', 'CASH_WITHDRAW', 'ADJUSTMENT'
    )
  ) THEN
    RAISE EXCEPTION 'Legacy LedgerEvent contains an unknown type; migration is blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" = 'ADJUSTMENT'
      AND COALESCE("metadata"->>'kind', '') NOT IN (
        'opening-balance', 'position-balance', 'rollback', 'cash-balance'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy ADJUSTMENT contains an unknown metadata.kind; migration is blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" IN ('BUY', 'SELL')
      AND (
        "symbol" IS NULL OR "quantity" IS NULL OR "quantity" <= 0
        OR "price" IS NULL OR "price" <= 0
      )
  ) THEN
    RAISE EXCEPTION 'Legacy execution contains a missing symbol or non-positive quantity/price';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" IN ('BONUS', 'SPLIT', 'MERGE')
      AND ("symbol" IS NULL OR "quantity" IS NULL OR "quantity" <= 0)
  ) THEN
    RAISE EXCEPTION 'Legacy corporate action contains a missing symbol or non-positive quantity';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" IN (
      'DIVIDEND', 'FEE', 'TAX', 'INTEREST', 'TRANSFER_IN', 'TRANSFER_OUT',
      'CASH_DEPOSIT', 'CASH_WITHDRAW'
    ) AND ("amount" IS NULL OR "amount" <= 0)
  ) THEN
    RAISE EXCEPTION 'Legacy cash event contains a non-positive amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" = 'ADJUSTMENT'
      AND "metadata"->>'kind' IN ('opening-balance', 'position-balance', 'rollback')
      AND (
        "symbol" IS NULL
        OR jsonb_typeof("metadata"->'quantity') IS DISTINCT FROM 'number'
        OR jsonb_typeof("metadata"->'costPrice') IS DISTINCT FROM 'number'
        OR ("metadata"->>'quantity')::numeric < 0
        OR ("metadata"->>'costPrice')::numeric < 0
      )
  ) THEN
    RAISE EXCEPTION 'Legacy position ADJUSTMENT is missing a valid quantity or costPrice';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "LedgerEvent"
    WHERE "type" = 'ADJUSTMENT'
      AND "metadata"->>'kind' = 'cash-balance'
      AND jsonb_typeof("metadata"->'amount') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'Legacy cash-balance ADJUSTMENT is missing a numeric amount';
  END IF;
END
$preflight$;

ALTER TABLE "LedgerEvent" DISABLE TRIGGER "LedgerEvent_append_only";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "accountId"
      ORDER BY "occurredAt", "createdAt", "id"
    ) AS account_revision
  FROM "LedgerEvent"
  WHERE "factId" IS NULL
)
UPDATE "LedgerEvent" AS event
SET
  "factId" = event."id",
  "ledgerRevision" = ranked.account_revision,
  "type" = CASE event."type"
    WHEN 'BUY' THEN 'BUY_EXECUTION'
    WHEN 'SELL' THEN 'SELL_EXECUTION'
    WHEN 'BONUS' THEN 'BONUS_SHARE'
    WHEN 'ADJUSTMENT' THEN CASE
      WHEN event."metadata"->>'kind' = 'cash-balance' THEN 'CASH_BALANCE_OBSERVATION'
      ELSE 'POSITION_BASELINE_OBSERVATION'
    END
    WHEN 'CASH_DEPOSIT' THEN 'CASH_FLOW'
    WHEN 'CASH_WITHDRAW' THEN 'CASH_FLOW'
    WHEN 'TRANSFER_IN' THEN 'CASH_FLOW'
    WHEN 'TRANSFER_OUT' THEN 'CASH_FLOW'
    WHEN 'INTEREST' THEN 'CASH_FLOW'
    WHEN 'FEE' THEN 'CASH_FLOW'
    WHEN 'TAX' THEN 'CASH_FLOW'
    ELSE event."type"
  END,
  "timePrecision" = 'UNKNOWN',
  "sourceTimezone" = 'UNKNOWN',
  "economicOrderKey" = LPAD(ranked.account_revision::text, 20, '0'),
  "recordedAt" = event."createdAt",
  "payloadVersion" = 1,
  "payload" = CASE event."type"
    WHEN 'BUY' THEN jsonb_strip_nulls(jsonb_build_object(
      'symbol', event."symbol",
      'quantity', event."quantity"::text,
      'price', event."price"::text,
      'currency', event."currency",
      'capabilityVerification', 'UNVERIFIED',
      'charges',
        CASE WHEN event."fee" > 0
          THEN jsonb_build_array(jsonb_build_object(
            'category', 'COMMISSION', 'amount', event."fee"::text, 'currency', event."currency"
          )) ELSE '[]'::jsonb END
        || CASE WHEN event."tax" > 0
          THEN jsonb_build_array(jsonb_build_object(
            'category', 'TAX', 'amount', event."tax"::text, 'currency', event."currency"
          )) ELSE '[]'::jsonb END,
      'note', event."note"
    ))
    WHEN 'SELL' THEN jsonb_strip_nulls(jsonb_build_object(
      'symbol', event."symbol",
      'quantity', event."quantity"::text,
      'price', event."price"::text,
      'currency', event."currency",
      'capabilityVerification', 'UNVERIFIED',
      'charges',
        CASE WHEN event."fee" > 0
          THEN jsonb_build_array(jsonb_build_object(
            'category', 'COMMISSION', 'amount', event."fee"::text, 'currency', event."currency"
          )) ELSE '[]'::jsonb END
        || CASE WHEN event."tax" > 0
          THEN jsonb_build_array(jsonb_build_object(
            'category', 'TAX', 'amount', event."tax"::text, 'currency', event."currency"
          )) ELSE '[]'::jsonb END,
      'note', event."note"
    ))
    WHEN 'BONUS' THEN jsonb_build_object(
      'symbol', event."symbol", 'quantity', event."quantity"::text
    )
    WHEN 'SPLIT' THEN jsonb_build_object(
      'symbol', event."symbol", 'fromUnits', '1', 'toUnits', event."quantity"::text
    )
    WHEN 'MERGE' THEN jsonb_build_object(
      'symbol', event."symbol", 'fromUnits', event."quantity"::text, 'toUnits', '1'
    )
    WHEN 'DIVIDEND' THEN jsonb_strip_nulls(jsonb_build_object(
      'symbol', event."symbol",
      'amount', event."amount"::text,
      'currency', event."currency",
      'note', event."note"
    ))
    WHEN 'ADJUSTMENT' THEN CASE
      WHEN event."metadata"->>'kind' = 'cash-balance' THEN jsonb_build_object(
        'currency', event."currency",
        'amount', event."metadata"->>'amount'
      )
      ELSE jsonb_build_object(
        'symbol', event."symbol",
        'batchId', event."id"::text,
        'batchScope', 'PARTIAL',
        'quantity', event."metadata"->>'quantity',
        'averageCost', event."metadata"->>'costPrice',
        'currency', event."currency",
        'costIncludesFees', 'UNKNOWN'
      )
    END
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'direction', CASE
        WHEN event."type" IN ('CASH_DEPOSIT', 'TRANSFER_IN', 'INTEREST') THEN 'INFLOW'
        ELSE 'OUTFLOW'
      END,
      'category', CASE event."type"
        WHEN 'CASH_DEPOSIT' THEN 'DEPOSIT'
        WHEN 'CASH_WITHDRAW' THEN 'WITHDRAWAL'
        WHEN 'TRANSFER_IN' THEN 'TRANSFER'
        WHEN 'TRANSFER_OUT' THEN 'TRANSFER'
        WHEN 'INTEREST' THEN 'INTEREST'
        WHEN 'FEE' THEN 'FEE'
        WHEN 'TAX' THEN 'TAX'
      END,
      'amount', event."amount"::text,
      'currency', event."currency",
      'note', event."note"
    ))
  END,
  "sourceCategory" = CASE lower(event."source")
    WHEN 'manual' THEN 'MANUAL'
    WHEN 'migration' THEN 'MIGRATION'
    WHEN 'screenshot' THEN 'IMPORT'
    WHEN 'import' THEN 'IMPORT'
    ELSE 'INTEGRATION'
  END,
  "sourceChannel" = COALESCE(NULLIF(event."source", ''), 'legacy'),
  "actorId" = 'migration:legacy-ledger-v2',
  "revisionAction" = 'CREATE',
  "supersedesEventId" = NULL,
  "reason" = NULL
FROM ranked
WHERE event."id" = ranked."id";

INSERT INTO "AccountCostStrategyVersion" (
  "accountId", "revision", "method", "effectiveAt", "reason", "actorId"
)
SELECT
  account."id",
  1,
  'AVG',
  COALESCE(MIN(event."occurredAt"), account."createdAt"),
  '旧账户默认移动加权平均成本策略',
  'migration:legacy-ledger-v2'
FROM "Account" AS account
LEFT JOIN "LedgerEvent" AS event ON event."accountId" = account."id"
GROUP BY account."id", account."createdAt"
ON CONFLICT ("accountId", "revision") DO NOTHING;

INSERT INTO "AccountLedgerState" (
  "accountId", "ledgerRevision", "projectionGeneration", "updatedAt"
)
SELECT
  account."id",
  COALESCE(MAX(event."ledgerRevision"), 0),
  0,
  CURRENT_TIMESTAMP
FROM "Account" AS account
LEFT JOIN "LedgerEvent" AS event ON event."accountId" = account."id"
GROUP BY account."id"
ON CONFLICT ("accountId") DO UPDATE SET
  "ledgerRevision" = EXCLUDED."ledgerRevision",
  "projectionGeneration" = 0,
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "LedgerEvent" ENABLE TRIGGER "LedgerEvent_append_only";

COMMIT;
