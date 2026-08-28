BEGIN;
SELECT "ledgerRevision"
FROM "AccountLedgerState"
WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
FOR UPDATE;
SELECT pg_sleep(2);
UPDATE "AccountLedgerState"
SET
  "ledgerRevision" = "ledgerRevision" + 1,
  "projectionGeneration" = "projectionGeneration" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
COMMIT;
