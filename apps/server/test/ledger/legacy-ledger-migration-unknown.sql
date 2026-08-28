INSERT INTO "Account" (
  "id", "name", "type", "mode", "currency", "active", "createdAt", "updatedAt"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Legacy Unknown Fixture',
  'brokerage',
  'actual',
  'CNY',
  true,
  '2025-01-01T00:00:00Z',
  CURRENT_TIMESTAMP
);

INSERT INTO "LedgerEvent" (
  "id", "accountId", "type", "occurredAt", "externalId", "source", "currency", "createdAt"
) VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'UNKNOWN_LEGACY_EVENT',
  '2025-01-18T01:00:00Z',
  'legacy-unknown',
  'manual',
  'CNY',
  '2025-01-18T01:00:01Z'
);
