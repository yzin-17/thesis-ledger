ALTER TABLE "StrategyAuthoringOperation"
  DROP CONSTRAINT "StrategyAuthoringOperation_disposition_check",
  ADD CONSTRAINT "StrategyAuthoringOperation_disposition_check"
    CHECK ("disposition" IN ('unapplied', 'stale', 'applied')
      AND ("disposition" <> 'applied' OR "status" = 'succeeded'));

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261005143000_authoring_analysis_application', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;
