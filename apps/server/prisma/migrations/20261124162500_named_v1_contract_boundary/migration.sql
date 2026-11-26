BEGIN;

UPDATE "ModelArena"
SET protocol = jsonb_set(protocol, '{version}', '"arena-historical-match-protocol-v1"'::jsonb)
WHERE protocol->'version' = '1'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Strategy" WHERE "schemaVersion" <> 1)
  OR EXISTS (SELECT 1 FROM "StrategyVersion"
    WHERE "schemaVersion" <> 1 OR schema->>'schemaVersion' IS DISTINCT FROM 'strategy-definition-v1')
  OR EXISTS (SELECT 1 FROM "BacktestJob"
    WHERE mode <> 'frozen' OR input->'contractVersion' IS DISTINCT FROM '1'::jsonb
      OR COALESCE(input->>'schemaVersion', '') NOT IN ('backtest-trade-run-v1', 'backtest-nav-run-v1'))
  OR EXISTS (SELECT 1 FROM "MarketBarWindowEvidenceV3"
    WHERE "completeResponse" IS NOT NULL AND "completeResponse"->'contractVersion' IS DISTINCT FROM '1'::jsonb)
  OR EXISTS (SELECT 1 FROM "MarketDerivedSeriesSnapshotV3"
    WHERE snapshot->'contractVersion' IS DISTINCT FROM '1'::jsonb)
  OR EXISTS (SELECT 1 FROM "MarketReportMetadataSnapshot"
    WHERE payload#>>'{page,metadataVersion}' IS DISTINCT FROM 'market-external-report-metadata-v1')
  OR EXISTS (SELECT 1 FROM "AiRun" WHERE "modelMetadata" ? 'frozenResearch'
    AND "modelMetadata"#>>'{frozenResearch,version}' IS DISTINCT FROM 'research-frozen-input-v1')
  OR EXISTS (SELECT 1 FROM "ArenaLiveMatch"
    WHERE protocol->>'version' IS DISTINCT FROM 'arena-live-match-protocol-v1')
  OR EXISTS (SELECT 1 FROM "ModelArena"
    WHERE protocol->>'version' IS DISTINCT FROM 'arena-historical-match-protocol-v1')
  OR EXISTS (SELECT 1 FROM "ArenaLiveCycle" WHERE input->'protocol' IS NOT NULL
    AND input#>>'{protocol,version}' IS DISTINCT FROM 'arena-live-match-protocol-v1')
  OR EXISTS (SELECT 1 FROM "DesiredProviderPolicy"
    WHERE routes->>'storageVersion' IS DISTINCT FROM 'market-routing-policy-v1')
  THEN
    RAISE EXCEPTION 'named V1 contracts require the staged data cutover before schema activation';
  END IF;
END;
$$;

ALTER TABLE "BacktestJob" ALTER COLUMN mode SET DEFAULT 'frozen';
ALTER TABLE "MarketBarWindowEvidenceV3" DROP CONSTRAINT IF EXISTS "MarketBarWindowEvidenceV3_response_check";
ALTER TABLE "MarketDerivedSeriesSnapshotV3" DROP CONSTRAINT IF EXISTS "MarketDerivedSeriesSnapshotV3_snapshot_check";
ALTER TABLE "MarketBarWindowEvidenceV3" ADD CONSTRAINT "MarketBarWindowEvidenceV3_response_check" CHECK (
  ("completeResponse" IS NULL AND "completeResponseHash" IS NULL)
  OR COALESCE(jsonb_typeof("completeResponse") = 'object'
    AND "completeResponse"->'contractVersion' = '1'::jsonb
    AND jsonb_typeof("completeResponse"->'bars') = 'array'
    AND "completeResponseHash" ~ '^[a-f0-9]{64}$', false)
);
ALTER TABLE "MarketDerivedSeriesSnapshotV3" ADD CONSTRAINT "MarketDerivedSeriesSnapshotV3_snapshot_check" CHECK (
  COALESCE("inputFingerprint" ~ '^[a-f0-9]{64}$'
    AND length("algorithmRevision") > 0
    AND jsonb_typeof(snapshot) = 'object'
    AND snapshot->'contractVersion' = '1'::jsonb
    AND snapshot->>'kind' = 'locally-derived'
    AND snapshot->>'inputFingerprint' = "inputFingerprint"
    AND snapshot->>'algorithmRevision' = "algorithmRevision"
    AND jsonb_typeof(snapshot->'input') = 'object', false)
);
ALTER TABLE "AiRun" DROP CONSTRAINT IF EXISTS "AiRun_research_submission_v2_complete";
ALTER TABLE "AiRun" DROP CONSTRAINT IF EXISTS "AiRun_research_report_submission_check";
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_research_report_submission_check" CHECK (
  (
    "researchOwnerId" IS NULL AND "researchSubmissionId" IS NULL
    AND "researchInputDigest" IS NULL AND "researchScopeSnapshot" IS NULL
  ) OR (
    "researchOwnerId" IS NOT NULL AND "researchSubmissionId" IS NOT NULL
    AND "researchInputDigest" IS NOT NULL AND "researchScopeSnapshot" IS NOT NULL
    AND "researchInputDigest" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("researchScopeSnapshot") = 'object'
    AND "researchScopeSnapshot" ->> 'version' = 'research-scope-snapshot-v1'
    AND "researchScopeSnapshot" ->> 'mode' IN ('actual', 'shadow')
    AND "researchScopeSnapshot" ->> 'scope' IN ('instrument', 'portfolio', 'account', 'position', 'strategy')
  ) IS TRUE
);
ALTER TABLE "ArenaLiveMatch" DROP CONSTRAINT IF EXISTS "ArenaLiveMatch_protocol_check";
ALTER TABLE "ArenaLiveMatch" ADD CONSTRAINT "ArenaLiveMatch_protocol_check"
  CHECK ("protocol"->>'version' IS NOT DISTINCT FROM 'arena-live-match-protocol-v1');
ALTER TABLE "ModelArena" ADD CONSTRAINT "ModelArena_protocol_check"
  CHECK ("protocol"->>'version' IS NOT DISTINCT FROM 'arena-historical-match-protocol-v1');

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261124162500_named_v1_contract_boundary', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;
COMMIT;
