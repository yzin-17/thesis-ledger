INSERT INTO "Account" (
  "id", "name", "type", "mode", "currency", "active", "createdAt", "updatedAt"
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Legacy Fee Fixture',
  'brokerage',
  'actual',
  'CNY',
  true,
  '2025-01-01T00:00:00Z',
  CURRENT_TIMESTAMP
);

INSERT INTO "Asset" (
  "symbol", "name", "market", "assetType", "currency", "updatedAt"
) VALUES (
  'LEGACY.FEE', 'Legacy Fee Fixture Asset', 'TEST', 'stock', 'CNY', CURRENT_TIMESTAMP
);

INSERT INTO "LedgerEvent" (
  "id", "accountId", "type", "occurredAt", "symbol", "quantity", "price", "amount",
  "fee", "tax", "externalId", "source", "currency", "note", "metadata", "createdAt"
) VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'BUY',
    '2025-01-01T01:00:00Z',
    'LEGACY.FEE',
    10,
    100,
    NULL,
    1.25,
    0,
    'legacy-fee-01',
    'manual',
    'CNY',
    '仅佣金',
    NULL,
    '2025-01-01T01:00:01Z'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'SELL',
    '2025-01-02T01:00:00Z',
    'LEGACY.FEE',
    2,
    110,
    NULL,
    0,
    0.75,
    'legacy-fee-02',
    'manual',
    'CNY',
    '仅税费',
    NULL,
    '2025-01-02T01:00:01Z'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'BUY',
    '2025-01-03T01:00:00Z',
    'LEGACY.FEE',
    3,
    90,
    NULL,
    1.5,
    0.25,
    'legacy-fee-03',
    'manual',
    'CNY',
    '混合费用',
    NULL,
    '2025-01-03T01:00:01Z'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'SELL',
    '2025-01-04T01:00:00Z',
    'LEGACY.FEE',
    1,
    95,
    NULL,
    0,
    0,
    'legacy-fee-04',
    'manual',
    'CNY',
    '零费用',
    NULL,
    '2025-01-04T01:00:01Z'
  );
