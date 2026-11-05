BEGIN;

ALTER TABLE "AiRun"
  ADD COLUMN "researchOwnerId" UUID,
  ADD COLUMN "researchSubmissionId" UUID,
  ADD COLUMN "researchInputDigest" VARCHAR(64),
  ADD COLUMN "researchScopeSnapshot" JSONB;

ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_research_submission_v2_complete" CHECK (
  (
    "researchOwnerId" IS NULL AND "researchSubmissionId" IS NULL
    AND "researchInputDigest" IS NULL AND "researchScopeSnapshot" IS NULL
  ) OR (
    "researchOwnerId" IS NOT NULL AND "researchSubmissionId" IS NOT NULL
    AND "researchInputDigest" IS NOT NULL AND "researchScopeSnapshot" IS NOT NULL
    AND "researchInputDigest" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("researchScopeSnapshot") = 'object'
    AND "researchScopeSnapshot" ->> 'version' = 'research-scope-v2'
    AND "researchScopeSnapshot" ->> 'mode' IN ('actual', 'shadow')
    AND "researchScopeSnapshot" ->> 'scope' IN ('instrument', 'portfolio', 'account', 'position', 'strategy')
  ) IS TRUE
);

CREATE UNIQUE INDEX "AiRun_researchOwnerId_researchSubmissionId_key"
  ON "AiRun" ("researchOwnerId", "researchSubmissionId");
CREATE INDEX "AiRun_researchOwnerId_createdAt_id_idx"
  ON "AiRun" ("researchOwnerId", "createdAt", "id");

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261019010000_research_submission_v2', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
