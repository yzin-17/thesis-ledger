BEGIN;

DO $$
DECLARE
  orphan_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO orphan_count
  FROM "TargetAllocation" AS target
  LEFT JOIN "Account" AS account ON account."id" = target."accountId"
  WHERE target."accountId" IS NOT NULL AND account."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'TargetAllocation.accountId 存在 % 条孤立引用，阻止添加 Account 外键', orphan_count;
  END IF;

  SELECT COUNT(*)
  INTO orphan_count
  FROM "RiskEvent" AS event
  LEFT JOIN "Account" AS account ON account."id" = event."accountId"
  WHERE event."accountId" IS NOT NULL AND account."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'RiskEvent.accountId 存在 % 条孤立引用，阻止添加 Account 外键', orphan_count;
  END IF;

  SELECT COUNT(*)
  INTO orphan_count
  FROM "JournalEntry" AS entry
  LEFT JOIN "Account" AS account ON account."id" = entry."accountId"
  WHERE entry."accountId" IS NOT NULL AND account."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'JournalEntry.accountId 存在 % 条孤立引用，阻止添加 Account 外键', orphan_count;
  END IF;

  SELECT COUNT(*)
  INTO orphan_count
  FROM "JournalReviewSnapshot" AS snapshot
  LEFT JOIN "Account" AS account ON account."id" = snapshot."accountId"
  WHERE snapshot."accountId" IS NOT NULL AND account."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'JournalReviewSnapshot.accountId 存在 % 条孤立引用，阻止添加 Account 外键', orphan_count;
  END IF;

  SELECT COUNT(*)
  INTO orphan_count
  FROM "AiDecisionLog" AS decision
  LEFT JOIN "Account" AS account ON account."id" = decision."accountId"
  WHERE decision."accountId" IS NOT NULL AND account."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'AiDecisionLog.accountId 存在 % 条孤立引用，阻止添加 Account 外键', orphan_count;
  END IF;
END;
$$;

ALTER TABLE "TargetAllocation"
  ADD CONSTRAINT "TargetAllocation_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiskEvent"
  ADD CONSTRAINT "RiskEvent_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JournalReviewSnapshot"
  ADD CONSTRAINT "JournalReviewSnapshot_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiDecisionLog"
  ADD CONSTRAINT "AiDecisionLog_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
