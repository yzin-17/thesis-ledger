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
