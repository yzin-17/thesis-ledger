BEGIN;
SELECT "ledgerRevision"
FROM "AccountLedgerState"
WHERE "accountId" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
FOR UPDATE;
SELECT pg_sleep(2);
UPDATE "AccountLedgerState"
SET
  "ledgerRevision" = "ledgerRevision" + 1,
  "projectionGeneration" = "projectionGeneration" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "accountId" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
COMMIT;
