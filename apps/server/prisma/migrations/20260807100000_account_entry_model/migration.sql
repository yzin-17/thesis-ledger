-- Refuse to migrate known account/asset type conflicts; operators must repair them first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Account" account
    JOIN "Position" position ON position."accountId" = account."id"
    JOIN "Asset" asset ON asset."symbol" = position."symbol"
    WHERE
      (account."type" IN ('securities', 'shadow') AND asset."assetType" NOT IN ('stock', 'etf'))
      OR (account."type" = 'fund' AND asset."assetType" <> 'fund')
      OR account."type" = 'cash'
  ) THEN
    RAISE EXCEPTION 'account/asset type conflict; repair Position and Asset before migration';
  END IF;
END $$;

-- Account.source was an entry method, not account identity. Preserve recognizable
-- historical institutions before removing the overloaded column.
ALTER TABLE "Account" ADD COLUMN "institution" TEXT;
ALTER TABLE "Account" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'actual';

UPDATE "Account"
SET "institution" = NULLIF("source", 'manual'),
    "mode" = CASE WHEN "type" = 'shadow' THEN 'shadow' ELSE 'actual' END,
    "type" = CASE WHEN "type" = 'shadow' THEN 'securities' ELSE "type" END;

DROP INDEX IF EXISTS "Account_name_source_key";
ALTER TABLE "Account" DROP COLUMN "source";

ALTER TABLE "Asset" ADD COLUMN "identityStatus" TEXT NOT NULL DEFAULT 'provider';
ALTER TABLE "Asset" ADD COLUMN "identitySource" TEXT;
ALTER TABLE "ImportDraft" ADD COLUMN "baselineHash" TEXT;
