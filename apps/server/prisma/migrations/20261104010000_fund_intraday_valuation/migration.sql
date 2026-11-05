BEGIN;

CREATE TABLE "FundValuationPoint" (
  "symbol" TEXT NOT NULL CHECK ("symbol" ~ '^[0-9]{6}\.OF$'),
  "minute" TIMESTAMP(3) NOT NULL CHECK ("minute" = date_trunc('minute', "minute")),
  "method" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "quality" TEXT NOT NULL CHECK ("quality" IN ('complete', 'partial', 'low_coverage', 'unavailable')),
  "snapshot" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "lastValidAt" TIMESTAMP(3),
  "lastValidSnapshot" JSONB,
  PRIMARY KEY ("symbol", "minute", "method")
);
CREATE INDEX "FundValuationPoint_symbol_lastValidAt_idx" ON "FundValuationPoint" ("symbol", "lastValidAt");

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261104010000_fund_intraday_valuation', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
