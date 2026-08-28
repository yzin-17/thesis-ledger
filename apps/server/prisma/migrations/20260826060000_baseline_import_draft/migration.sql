ALTER TABLE "ImportDraft"
  ADD COLUMN "currentRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "ImportDraft"
  ADD CONSTRAINT "ImportDraft_scope_check" CHECK ("scope" IN ('FULL', 'PARTIAL'));

CREATE TABLE "ImportDraftRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "draftId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "rawEvidenceRef" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'FULL',
  "observedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3),
  "timePrecision" TEXT,
  "sourceTimezone" TEXT,
  "rows" JSONB NOT NULL,
  "issues" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "submittedRowIds" JSONB,

  CONSTRAINT "ImportDraftRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportDraftRevision_time_precision_check"
    CHECK ("timePrecision" IS NULL OR "timePrecision" IN ('INSTANT', 'DATE', 'UNKNOWN')),
  CONSTRAINT "ImportDraftRevision_scope_check"
    CHECK ("scope" IN ('FULL', 'PARTIAL')),
  CONSTRAINT "ImportDraftRevision_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "ImportDraft"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImportDraftRevision_draftId_revision_key"
  ON "ImportDraftRevision"("draftId", "revision");
CREATE INDEX "ImportDraftRevision_draftId_submittedAt_idx"
  ON "ImportDraftRevision"("draftId", "submittedAt");

INSERT INTO "ImportDraftRevision" (
  "draftId", "revision", "parserVersion", "rawEvidenceRef", "contentHash",
  "rows", "issues", "submittedAt", "submittedRowIds"
)
SELECT
  "id",
  1,
  'legacy-import-draft@1',
  'legacy-import-draft://' || "id"::text || '/image/' || "imageHash",
  "imageHash",
  "rows",
  '[]'::jsonb,
  "committedAt",
  CASE WHEN "committedAt" IS NULL THEN NULL ELSE '[]'::jsonb END
FROM "ImportDraft";

UPDATE "ImportDraft" SET "currentRevision" = 1;

CREATE TABLE "BaselineObservationBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "timePrecision" TEXT NOT NULL DEFAULT 'INSTANT',
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceCategory" TEXT NOT NULL,
  "sourceChannel" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "evidenceRef" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),

  CONSTRAINT "BaselineObservationBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BaselineObservationBatch_time_precision_check"
    CHECK ("timePrecision" IN ('INSTANT', 'DATE', 'UNKNOWN')),
  CONSTRAINT "BaselineObservationBatch_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BaselineObservationBatch_scope_check"
    CHECK ("scope" IN ('FULL', 'PARTIAL')),
  CONSTRAINT "BaselineObservationBatch_status_check"
    CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'VOID'))
);

CREATE UNIQUE INDEX "BaselineObservationBatch_accountId_sourceChannel_externalId_key"
  ON "BaselineObservationBatch"("accountId", "sourceChannel", "externalId");
CREATE INDEX "BaselineObservationBatch_accountId_observedAt_idx"
  ON "BaselineObservationBatch"("accountId", "observedAt");

CREATE FUNCTION reject_frozen_import_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $frozen_import$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted ImportDraftRevision is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$frozen_import$;

CREATE TRIGGER "ImportDraftRevision_frozen"
BEFORE UPDATE OR DELETE ON "ImportDraftRevision"
FOR EACH ROW EXECUTE FUNCTION reject_frozen_import_revision_mutation();

CREATE FUNCTION reject_submitted_baseline_batch_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $submitted_baseline$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted BaselineObservationBatch is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$submitted_baseline$;

CREATE TRIGGER "BaselineObservationBatch_submitted"
BEFORE UPDATE OR DELETE ON "BaselineObservationBatch"
FOR EACH ROW EXECUTE FUNCTION reject_submitted_baseline_batch_mutation();
