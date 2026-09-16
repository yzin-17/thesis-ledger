BEGIN;

CREATE TABLE "MarketBarSeriesFact" (
    "id" BIGSERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "adjustment" TEXT NOT NULL,
    "open" DECIMAL(24,8) NOT NULL,
    "high" DECIMAL(24,8) NOT NULL,
    "low" DECIMAL(24,8) NOT NULL,
    "close" DECIMAL(24,8) NOT NULL,
    "volume" DECIMAL(30,8) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "completionStatus" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT NOT NULL,
    "upstreamSource" TEXT NOT NULL,
    "providerRevision" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketBarSeriesFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketBarSeriesCoverage" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "adjustment" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "upstreamSource" TEXT NOT NULL,
    "providerRevision" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshUntil" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "hasMoreBefore" BOOLEAN NOT NULL,
    "latestCompleteTradingDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketBarSeriesCoverage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketBarSeriesFact_identity_key"
ON "MarketBarSeriesFact"("symbol", "timeframe", "timestamp", "adjustment", "providerId", "upstreamSource");
CREATE INDEX "MarketBarSeriesFact_lookup_idx"
ON "MarketBarSeriesFact"("symbol", "assetType", "timeframe", "adjustment", "timestamp");
CREATE INDEX "MarketBarSeriesFact_provider_fetched_idx"
ON "MarketBarSeriesFact"("providerId", "upstreamSource", "fetchedAt");
CREATE UNIQUE INDEX "MarketBarSeriesCoverage_identity_key"
ON "MarketBarSeriesCoverage"("symbol", "timeframe", "adjustment", "providerId", "upstreamSource");
CREATE INDEX "MarketBarSeriesCoverage_lookup_idx"
ON "MarketBarSeriesCoverage"("symbol", "assetType", "timeframe", "adjustment", "updatedAt");

COMMIT;
