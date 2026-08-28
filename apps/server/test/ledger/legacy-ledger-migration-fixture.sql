INSERT INTO "Account" (
  "id", "name", "type", "mode", "currency", "active", "createdAt", "updatedAt"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Legacy Migration Fixture',
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
  'LEGACY.TEST', 'Legacy Fixture Asset', 'TEST', 'stock', 'CNY', CURRENT_TIMESTAMP
);

INSERT INTO "LedgerEvent" (
  "id", "accountId", "type", "occurredAt", "symbol", "quantity", "price", "amount",
  "fee", "tax", "externalId", "source", "currency", "note", "correctionOf", "metadata", "createdAt"
) VALUES
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BUY', '2025-01-01T01:00:00Z', 'LEGACY.TEST', 10, 100, NULL, 1, 0.5, 'legacy-01', 'manual', 'CNY', '买入', NULL, NULL, '2025-01-01T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SELL', '2025-01-02T01:00:00Z', 'LEGACY.TEST', 2, 110, NULL, 1, 0.5, 'legacy-02', 'manual', 'CNY', '卖出', NULL, NULL, '2025-01-02T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BONUS', '2025-01-03T01:00:00Z', 'LEGACY.TEST', 1, NULL, NULL, NULL, NULL, 'legacy-03', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-03T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SPLIT', '2025-01-04T01:00:00Z', 'LEGACY.TEST', 2, NULL, NULL, NULL, NULL, 'legacy-04', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-04T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'MERGE', '2025-01-05T01:00:00Z', 'LEGACY.TEST', 2, NULL, NULL, NULL, NULL, 'legacy-05', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-05T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DIVIDEND', '2025-01-06T01:00:00Z', 'LEGACY.TEST', NULL, NULL, 12.5, NULL, NULL, 'legacy-06', 'manual', 'CNY', '分红', NULL, NULL, '2025-01-06T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CASH_DEPOSIT', '2025-01-07T01:00:00Z', NULL, NULL, NULL, 1000, NULL, NULL, 'legacy-07', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-07T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CASH_WITHDRAW', '2025-01-08T01:00:00Z', NULL, NULL, NULL, 100, NULL, NULL, 'legacy-08', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-08T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TRANSFER_IN', '2025-01-09T01:00:00Z', NULL, NULL, NULL, 50, NULL, NULL, 'legacy-09', 'integration', 'CNY', NULL, NULL, NULL, '2025-01-09T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TRANSFER_OUT', '2025-01-10T01:00:00Z', NULL, NULL, NULL, 25, NULL, NULL, 'legacy-10', 'integration', 'CNY', NULL, NULL, NULL, '2025-01-10T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'INTEREST', '2025-01-11T01:00:00Z', NULL, NULL, NULL, 3, NULL, NULL, 'legacy-11', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-11T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'FEE', '2025-01-12T01:00:00Z', NULL, NULL, NULL, 2, NULL, NULL, 'legacy-12', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-12T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000013', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TAX', '2025-01-13T01:00:00Z', NULL, NULL, NULL, 4, NULL, NULL, 'legacy-13', 'manual', 'CNY', NULL, NULL, NULL, '2025-01-13T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000014', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADJUSTMENT', '2025-01-14T01:00:00Z', 'LEGACY.TEST', 8, 105, NULL, NULL, NULL, 'legacy-14', 'screenshot', 'CNY', '期初持仓', '00000000-0000-4000-8000-000000000001', '{"kind":"opening-balance","quantity":8,"costPrice":105}', '2025-01-14T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000015', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADJUSTMENT', '2025-01-15T01:00:00Z', 'LEGACY.TEST', 9, 106, NULL, NULL, NULL, 'legacy-15', 'manual', 'CNY', '持仓余额', '00000000-0000-4000-8000-000000000014', '{"kind":"position-balance","quantity":9,"costPrice":106}', '2025-01-15T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADJUSTMENT', '2025-01-16T01:00:00Z', 'LEGACY.TEST', 7, 104, NULL, NULL, NULL, 'legacy-16', 'screenshot:rollback', 'CNY', '回滚', '00000000-0000-4000-8000-000000000015', '{"kind":"rollback","quantity":7,"costPrice":104}', '2025-01-16T01:00:01Z'),
  ('00000000-0000-4000-8000-000000000017', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADJUSTMENT', '2025-01-17T01:00:00Z', NULL, NULL, NULL, 888, NULL, NULL, 'legacy-17', 'manual', 'CNY', '现金余额', NULL, '{"kind":"cash-balance","amount":888}', '2025-01-17T01:00:01Z');
