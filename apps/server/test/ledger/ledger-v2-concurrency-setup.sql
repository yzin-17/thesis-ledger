INSERT INTO "Account" (
  "id", "name", "type", "mode", "currency", "active", "createdAt", "updatedAt"
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Concurrency A',
    'brokerage',
    'actual',
    'CNY',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Concurrency B',
    'brokerage',
    'actual',
    'CNY',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccountLedgerState" (
  "accountId", "ledgerRevision", "projectionGeneration", "updatedAt"
) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 0, CURRENT_TIMESTAMP),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("accountId") DO UPDATE SET
  "ledgerRevision" = 0,
  "projectionGeneration" = 0,
  "updatedAt" = CURRENT_TIMESTAMP;
