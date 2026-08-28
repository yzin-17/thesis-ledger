INSERT INTO "Asset" (
  "symbol", "name", "market", "assetType", "currency", "updatedAt"
) VALUES (
  'LEGACY.SECOND', 'Legacy Fixture Second Asset', 'TEST', 'stock', 'CNY', CURRENT_TIMESTAMP
);

INSERT INTO "Position" (
  "id", "accountId", "symbol", "quantity", "costPrice", "source", "updatedAt"
) VALUES
  (
    '00000000-0000-4000-8000-000000000021',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'LEGACY.TEST',
    42.5,
    101.25,
    'legacy-fixture',
    '2025-01-20T01:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'LEGACY.SECOND',
    7,
    88.5,
    'legacy-fixture',
    '2025-01-20T01:00:00Z'
  );
