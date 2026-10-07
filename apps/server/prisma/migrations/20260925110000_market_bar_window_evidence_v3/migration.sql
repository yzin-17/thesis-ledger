BEGIN;

CREATE TABLE "MarketBarWindowEvidenceV3" (
  "identityFingerprint" CHAR(64) NOT NULL,
  "routeKind" VARCHAR(8) NOT NULL DEFAULT 'bar',
  "market" VARCHAR(2) NOT NULL,
  "assetType" VARCHAR(32) NOT NULL,
  "capability" VARCHAR(32) NOT NULL,
  "timeframe" VARCHAR(8) NOT NULL,
  "adjustment" VARCHAR(8) NOT NULL,
  "symbol" VARCHAR(128) NOT NULL,
  "providerId" VARCHAR(128) NOT NULL,
  "upstreamSource" VARCHAR(128) NOT NULL,
  "routeIndex" SMALLINT NOT NULL,
  "requestedStart" DATE NOT NULL,
  "requestedEnd" DATE NOT NULL,
  "seriesVersion" VARCHAR(128) NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "desiredRevision" INTEGER NOT NULL,
  "effectivePolicyRevision" INTEGER NOT NULL,
  "catalogRevision" INTEGER NOT NULL,
  "sourcePriceBasis" JSONB NOT NULL,
  "coverageProof" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketBarWindowEvidenceV3_pkey" PRIMARY KEY ("identityFingerprint"),
  CONSTRAINT "MarketBarWindowEvidenceV3_fingerprint_check"
    CHECK ("identityFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MarketBarWindowEvidenceV3_route_check"
    CHECK (
      "routeKind" = 'bar'
      AND "market" IN ('CN', 'HK', 'US')
      AND "assetType" IN ('STOCK', 'ETF', 'MUTUAL_FUND', 'LOF', 'INDEX', 'BOND', 'CONVERTIBLE_BOND')
      AND "capability" IN ('DAILY_BAR', 'MINUTE_BAR')
      AND (
        ("capability" = 'DAILY_BAR' AND "timeframe" = '1d')
        OR ("capability" = 'MINUTE_BAR' AND "timeframe" = '1m')
      )
      AND "adjustment" IN ('none', 'qfq', 'hfq')
      AND "routeIndex" IN (0, 1)
    ),
  CONSTRAINT "MarketBarWindowEvidenceV3_window_check"
    CHECK ("requestedStart" <= "requestedEnd"),
  CONSTRAINT "MarketBarWindowEvidenceV3_revision_check"
    CHECK ("desiredRevision" > 0 AND "effectivePolicyRevision" > 0 AND "catalogRevision" > 0),
  CONSTRAINT "MarketBarWindowEvidenceV3_evidence_check"
    CHECK (
      length(btrim("symbol")) > 0
      AND length(btrim("providerId")) > 0
      AND length(btrim("upstreamSource")) > 0
      AND length(btrim("seriesVersion")) > 0
      AND length(btrim("inputFingerprint")) > 0
      AND jsonb_typeof("sourcePriceBasis") = 'object'
      AND jsonb_typeof("coverageProof") = 'object'
    )
);

CREATE INDEX "market_bar_window_evidence_v3_window_idx"
ON "MarketBarWindowEvidenceV3"(
  "market", "assetType", "capability", "timeframe", "adjustment", "symbol", "requestedStart", "requestedEnd"
);

CREATE INDEX "market_bar_window_evidence_v3_source_idx"
ON "MarketBarWindowEvidenceV3"("providerId", "upstreamSource", "seriesVersion");

COMMIT;
