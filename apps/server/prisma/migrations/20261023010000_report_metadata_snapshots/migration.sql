BEGIN;

CREATE TABLE "MarketReportMetadataSnapshot" (
  "id" UUID PRIMARY KEY,
  "instrumentId" UUID NOT NULL REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "symbol" VARCHAR(32) NOT NULL,
  "contentHash" CHAR(64) NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  "payload" JSONB NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MarketReportMetadataSnapshot_instrumentId_collectedAt_id_idx"
  ON "MarketReportMetadataSnapshot" ("instrumentId", "collectedAt", "id");

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261023010000_report_metadata_snapshots', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
