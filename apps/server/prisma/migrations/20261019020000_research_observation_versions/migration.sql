BEGIN;

CREATE TABLE "ResearchObservation" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL,
  "runId" UUID NOT NULL REFERENCES "AiRun" ("id") ON DELETE RESTRICT,
  "lineageId" UUID NOT NULL,
  "logicalKey" VARCHAR(64) NOT NULL UNIQUE,
  "artifactFingerprint" VARCHAR(64) NOT NULL,
  "claimId" VARCHAR(80) NOT NULL,
  "windowTradingDays" INTEGER,
  "methodVersion" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchObservation_identity_check" CHECK (
    "logicalKey" ~ '^[0-9a-f]{64}$'
    AND "artifactFingerprint" ~ '^[0-9a-f]{64}$'
    AND length("claimId") > 0 AND length("methodVersion") > 0
    AND ("windowTradingDays" IS NULL OR "windowTradingDays" IN (5, 20))
  )
);
CREATE INDEX "ResearchObservation_ownerId_runId_idx"
  ON "ResearchObservation" ("ownerId", "runId");
CREATE INDEX "ResearchObservation_ownerId_lineageId_methodVersion_idx"
  ON "ResearchObservation" ("ownerId", "lineageId", "methodVersion");

CREATE TABLE "ResearchObservationVersion" (
  "id" UUID PRIMARY KEY,
  "observationId" UUID NOT NULL REFERENCES "ResearchObservation" ("id") ON DELETE RESTRICT,
  "inputFingerprint" VARCHAR(64) NOT NULL,
  "visibleAt" TIMESTAMPTZ(6) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchObservationVersion_input_check" CHECK (
    "inputFingerprint" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("payload") = 'object'
  ),
  UNIQUE ("observationId", "inputFingerprint"),
  UNIQUE ("observationId", "id")
);
CREATE INDEX "ResearchObservationVersion_projection_idx"
  ON "ResearchObservationVersion" ("observationId", "visibleAt", "createdAt", "id");

CREATE TABLE "ResearchObservationSubmission" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "observationId" UUID NOT NULL REFERENCES "ResearchObservation" ("id") ON DELETE RESTRICT,
  "requestDigest" VARCHAR(64) NOT NULL,
  "visibleAt" TIMESTAMPTZ(6) NOT NULL,
  "state" TEXT NOT NULL,
  "versionId" UUID,
  "errorCode" VARCHAR(80),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  FOREIGN KEY ("observationId", "versionId")
    REFERENCES "ResearchObservationVersion" ("observationId", "id") ON DELETE RESTRICT,
  UNIQUE ("ownerId", "submissionId"),
  CONSTRAINT "ResearchObservationSubmission_state_check" CHECK (
    "requestDigest" ~ '^[0-9a-f]{64}$' AND "expiresAt" > "createdAt" AND (
      ("state" = 'pending' AND "versionId" IS NULL AND "errorCode" IS NULL AND "completedAt" IS NULL)
      OR ("state" = 'succeeded' AND "versionId" IS NOT NULL AND "errorCode" IS NULL AND "completedAt" IS NOT NULL)
      OR ("state" = 'failed' AND "versionId" IS NULL AND "errorCode" IN ('attempt_expired', 'data_read_failed') AND "completedAt" IS NOT NULL)
    ) IS TRUE
  )
);
CREATE INDEX "ResearchObservationSubmission_observationId_createdAt_idx"
  ON "ResearchObservationSubmission" ("observationId", "createdAt");

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261019020000_research_observation_versions', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
