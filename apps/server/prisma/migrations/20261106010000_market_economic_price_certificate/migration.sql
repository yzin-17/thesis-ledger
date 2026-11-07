BEGIN;
CREATE TABLE "MarketEconomicPriceCertificate" (
  "inputFingerprint" CHAR(64) PRIMARY KEY,
  "algorithmRevision" VARCHAR(128) NOT NULL,
  "symbol" VARCHAR(32) NOT NULL,
  "startDate" CHAR(10) NOT NULL,
  "endDate" CHAR(10) NOT NULL,
  "derivedFingerprint" CHAR(64) NOT NULL REFERENCES "MarketDerivedSeriesSnapshotV3"("inputFingerprint"),
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketEconomicPriceCertificate_identity_check" CHECK (COALESCE(
    "inputFingerprint" ~ '^[a-f0-9]{64}$'
    AND "algorithmRevision" = 'market-event-free-economic-evidence-v1'
    AND "startDate" < "endDate"
    AND "snapshot"->>'format' = "algorithmRevision"
    AND "snapshot"->>'derivedFingerprint' = "derivedFingerprint"
    AND "snapshot"->'bundle'->>'symbol' = "symbol"
    AND "snapshot"->'bundle'->>'start' = "startDate"
    AND "snapshot"->'bundle'->>'end' = "endDate", FALSE))
);
CREATE INDEX "MarketEconomicPriceCertificate_symbol_startDate_endDate_idx"
  ON "MarketEconomicPriceCertificate"("symbol", "startDate", "endDate");
COMMIT;
