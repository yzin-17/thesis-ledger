BEGIN;

CREATE TABLE "MarketDerivedSeriesSnapshotV3" (
  "inputFingerprint" CHAR(64) PRIMARY KEY,
  "algorithmRevision" VARCHAR(128) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketDerivedSeriesSnapshotV3_snapshot_check" CHECK (
    COALESCE(
      "inputFingerprint" ~ '^[a-f0-9]{64}$'
      AND length("algorithmRevision") > 0
      AND jsonb_typeof("snapshot") = 'object'
      AND "snapshot"->>'contractVersion' = '3'
      AND "snapshot"->>'kind' = 'locally-derived'
      AND "snapshot"->>'inputFingerprint' = "inputFingerprint"
      AND "snapshot"->>'algorithmRevision' = "algorithmRevision"
      AND jsonb_typeof("snapshot"->'input') = 'object',
      FALSE
    )
  )
);

COMMIT;
