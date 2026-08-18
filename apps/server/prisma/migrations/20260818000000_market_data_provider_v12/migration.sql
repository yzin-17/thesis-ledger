-- Market data/provider v1.2 keeps the Ledger Asset identity and adds a
-- Provider-neutral catalog plus an auditable Desired Policy aggregate.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "Instrument" (
    "id" UUID NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "canonicalCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL DEFAULT '',
    "pinyinInitials" TEXT NOT NULL DEFAULT '',
    "searchAliases" JSONB,
    "generation" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Instrument_canonicalCode_instrumentType_market_key"
    ON "Instrument"("canonicalCode", "instrumentType", "market");
CREATE INDEX "Instrument_canonicalCode_idx" ON "Instrument"("canonicalCode");
CREATE INDEX "Instrument_displayName_idx" ON "Instrument"("displayName");
CREATE INDEX "Instrument_generation_active_idx" ON "Instrument"("generation", "active");
CREATE INDEX "Instrument_displayName_trgm_idx"
    ON "Instrument" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX "Instrument_searchAliases_trgm_idx"
    ON "Instrument" USING GIN ((COALESCE("searchAliases"::text, '')) gin_trgm_ops);

CREATE TABLE "CatalogSyncState" (
    "consumer" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogSyncState_pkey" PRIMARY KEY ("consumer")
);

CREATE TABLE "InstrumentAssetAssociation" (
    "id" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstrumentAssetAssociation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstrumentAssetAssociation_symbol_key"
    ON "InstrumentAssetAssociation"("symbol");
CREATE UNIQUE INDEX "InstrumentAssetAssociation_instrumentId_symbol_key"
    ON "InstrumentAssetAssociation"("instrumentId", "symbol");
CREATE INDEX "InstrumentAssetAssociation_instrumentId_status_idx"
    ON "InstrumentAssetAssociation"("instrumentId", "status");
ALTER TABLE "InstrumentAssetAssociation"
    ADD CONSTRAINT "InstrumentAssetAssociation_instrumentId_fkey"
    FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstrumentAssetAssociation"
    ADD CONSTRAINT "InstrumentAssetAssociation_symbol_fkey"
    FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DesiredProviderPolicy" (
    "consumer" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "routes" JSONB NOT NULL,
    "syncState" TEXT NOT NULL,
    "dsaRevision" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "lastError" JSONB,
    "effectiveProjection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesiredProviderPolicy_pkey" PRIMARY KEY ("consumer")
);
CREATE INDEX "DesiredProviderPolicy_syncState_updatedAt_idx"
    ON "DesiredProviderPolicy"("syncState", "updatedAt");

CREATE TABLE "DesiredProviderPolicyRevision" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "routes" JSONB NOT NULL,
    "syncState" TEXT NOT NULL,
    "dsaRevision" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "lastError" JSONB,
    "effectiveProjection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesiredProviderPolicyRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DesiredProviderPolicyRevision_consumer_revision_key"
    ON "DesiredProviderPolicyRevision"("consumer", "revision");
CREATE INDEX "DesiredProviderPolicyRevision_consumer_createdAt_idx"
    ON "DesiredProviderPolicyRevision"("consumer", "createdAt");
ALTER TABLE "DesiredProviderPolicyRevision"
    ADD CONSTRAINT "DesiredProviderPolicyRevision_consumer_fkey"
    FOREIGN KEY ("consumer") REFERENCES "DesiredProviderPolicy"("consumer") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProviderTombstone" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderTombstone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderTombstone_providerId_key" ON "ProviderTombstone"("providerId");
CREATE INDEX "ProviderTombstone_removedAt_idx" ON "ProviderTombstone"("removedAt");

CREATE TABLE "FundNavPoint" (
    "symbol" TEXT NOT NULL,
    "navDate" TIMESTAMP(3) NOT NULL,
    "unitNav" DECIMAL(24,8) NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshness" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "FundNavPoint_pkey" PRIMARY KEY ("symbol", "navDate")
);
CREATE INDEX "FundNavPoint_navDate_idx" ON "FundNavPoint"("navDate");
ALTER TABLE "FundNavPoint"
    ADD CONSTRAINT "FundNavPoint_symbol_fkey"
    FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deterministic backfill only recognizes the existing canonical symbol forms.
-- Unknown/legacy symbols stay untouched and can be reviewed later.
INSERT INTO "Instrument" (
    "id", "instrumentType", "market", "canonicalCode", "displayName",
    "generation", "active", "updatedAt"
)
SELECT
    md5('instrument:' || a."symbol")::uuid,
    CASE a."assetType"
        WHEN 'etf' THEN 'ETF'
        WHEN 'fund' THEN 'MUTUAL_FUND'
        ELSE 'STOCK'
    END,
    split_part(a."symbol", '.', 2),
    split_part(a."symbol", '.', 1),
    a."name",
    0,
    true,
    CURRENT_TIMESTAMP
FROM "Asset" a
WHERE a."symbol" ~ '^[0-9]{6}\.(SH|SZ|BJ|OF)$'
ON CONFLICT ("canonicalCode", "instrumentType", "market") DO NOTHING;

INSERT INTO "InstrumentAssetAssociation" (
    "id", "instrumentId", "symbol", "status", "source", "confirmedAt",
    "firstSeenAt", "lastSeenAt"
)
SELECT
    md5('association:' || a."symbol")::uuid,
    i."id",
    a."symbol",
    'active',
    'deterministic-backfill',
    CASE WHEN a."identityStatus" = 'confirmed' THEN a."updatedAt" ELSE NULL END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Asset" a
JOIN "Instrument" i
  ON i."canonicalCode" = split_part(a."symbol", '.', 1)
 AND i."market" = split_part(a."symbol", '.', 2)
WHERE a."symbol" ~ '^[0-9]{6}\.(SH|SZ|BJ|OF)$'
ON CONFLICT ("symbol") DO NOTHING;
