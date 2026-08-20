UPDATE "Asset"
SET "identityStatus" = 'confirmed'
WHERE "identityStatus" = 'user-confirmed';

UPDATE "Asset"
SET "identitySource" = 'catalog'
WHERE "identitySource" = 'user-confirmed';

UPDATE "Asset"
SET "identitySource" = 'catalog'
WHERE "identityStatus" = 'provider' AND "identitySource" IS NULL;

UPDATE "InstrumentAssetAssociation"
SET "source" = 'catalog'
WHERE "source" = 'user-confirmed';

UPDATE "ImportDraft" AS draft
SET "committedAt" = (
  SELECT MAX(event."createdAt")
  FROM "LedgerEvent" AS event
  WHERE event."correctionOf" = draft."id"
)
WHERE draft."status" = 'committed'
  AND draft."committedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "LedgerEvent" AS event
    WHERE event."correctionOf" = draft."id"
  );
