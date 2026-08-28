BEGIN;

INSERT INTO "Account" (
  "id", "name", "type", "mode", "currency", "active", "createdAt", "updatedAt"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Ledger V2 Integration',
  'brokerage',
  'actual',
  'CNY',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "Asset" (
  "symbol", "name", "market", "assetType", "currency", "updatedAt"
) VALUES (
  'LEDGERV2.TEST',
  'Ledger V2 Integration Asset',
  'TEST',
  'stock',
  'CNY',
  CURRENT_TIMESTAMP
);

INSERT INTO "AccountLedgerState" (
  "accountId", "ledgerRevision", "projectionGeneration", "updatedAt"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 2, CURRENT_TIMESTAMP
) ON CONFLICT ("accountId") DO UPDATE SET
  "ledgerRevision" = EXCLUDED."ledgerRevision",
  "projectionGeneration" = EXCLUDED."projectionGeneration",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "LedgerEvent" (
  "id", "accountId", "type", "occurredAt", "symbol", "externalId", "source", "currency",
  "factId", "ledgerRevision", "timePrecision", "sourceTimezone", "economicOrderKey",
  "recordedAt", "payloadVersion", "payload", "sourceCategory", "sourceChannel", "actorId",
  "revisionAction"
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'BUY_EXECUTION',
  '2026-08-26T02:30:00.000Z',
  'LEDGERV2.TEST',
  'database-integration-create',
  'database-integration',
  'CNY',
  '22222222-2222-4222-8222-222222222222',
  1,
  'INSTANT',
  'Asia/Shanghai',
  'a0',
  '2026-08-26T02:31:00.000Z',
  1,
  '{"symbol":"LEDGERV2.TEST","quantity":"1","price":"10","currency":"CNY","capabilityVerification":"VERIFIED","charges":[]}'::jsonb,
  'MANUAL',
  'database-integration',
  'integration-test',
  'CREATE'
);

INSERT INTO "LedgerEvent" (
  "id", "accountId", "type", "occurredAt", "externalId", "source", "currency",
  "factId", "ledgerRevision", "timePrecision", "sourceTimezone", "economicOrderKey",
  "recordedAt", "payloadVersion", "sourceCategory", "sourceChannel", "actorId",
  "revisionAction", "supersedesEventId", "reason"
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'BUY_EXECUTION',
  '2026-08-26T02:30:00.000Z',
  'database-integration-void',
  'database-integration',
  'CNY',
  '22222222-2222-4222-8222-222222222222',
  2,
  'INSTANT',
  'Asia/Shanghai',
  'a0',
  '2026-08-26T02:32:00.000Z',
  1,
  'MANUAL',
  'database-integration',
  'integration-test',
  'VOID',
  '11111111-1111-4111-8111-111111111111',
  '重复导入'
);

DO $assert_immutable$
BEGIN
  BEGIN
    UPDATE "LedgerEvent"
    SET "reason" = '不应成功'
    WHERE "id" = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION '期望 LedgerEvent UPDATE 被拒绝';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM "LedgerEvent"
    WHERE "id" = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION '期望 LedgerEvent DELETE 被拒绝';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$assert_immutable$;

DO $assert_history$
DECLARE
  effective_at_one INTEGER;
  effective_at_two INTEGER;
BEGIN
  SELECT COUNT(*) INTO effective_at_one
  FROM (
    SELECT DISTINCT ON ("factId") "revisionAction"
    FROM "LedgerEvent"
    WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND "ledgerRevision" <= 1
    ORDER BY "factId", "ledgerRevision" DESC
  ) tips
  WHERE "revisionAction" <> 'VOID';

  SELECT COUNT(*) INTO effective_at_two
  FROM (
    SELECT DISTINCT ON ("factId") "revisionAction"
    FROM "LedgerEvent"
    WHERE "accountId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND "ledgerRevision" <= 2
    ORDER BY "factId", "ledgerRevision" DESC
  ) tips
  WHERE "revisionAction" <> 'VOID';

  IF effective_at_one <> 1 OR effective_at_two <> 0 THEN
    RAISE EXCEPTION '历史 Revision 有效事实解析错误: %, %', effective_at_one, effective_at_two;
  END IF;
END
$assert_history$;

ROLLBACK;
