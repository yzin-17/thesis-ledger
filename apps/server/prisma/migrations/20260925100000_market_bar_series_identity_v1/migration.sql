BEGIN;

ALTER TABLE "MarketBarSeriesFact"
ADD COLUMN "seriesVersion" TEXT;
UPDATE "MarketBarSeriesFact"
SET "seriesVersion" = 'legacy'
WHERE "seriesVersion" IS NULL;
ALTER TABLE "MarketBarSeriesFact"
ALTER COLUMN "seriesVersion" SET NOT NULL;

ALTER TABLE "MarketBarSeriesCoverage"
ADD COLUMN "seriesVersion" TEXT;
UPDATE "MarketBarSeriesCoverage"
SET "seriesVersion" = 'legacy'
WHERE "seriesVersion" IS NULL;
ALTER TABLE "MarketBarSeriesCoverage"
ALTER COLUMN "seriesVersion" SET NOT NULL;

DROP INDEX "MarketBarSeriesFact_identity_key";
CREATE UNIQUE INDEX "MarketBarSeriesFact_identity_key"
ON "MarketBarSeriesFact"("symbol", "timeframe", "timestamp", "adjustment", "providerId", "upstreamSource", "seriesVersion");

DROP INDEX "MarketBarSeriesCoverage_identity_key";
CREATE UNIQUE INDEX "MarketBarSeriesCoverage_identity_key"
ON "MarketBarSeriesCoverage"("symbol", "timeframe", "adjustment", "providerId", "upstreamSource", "seriesVersion");

COMMIT;
