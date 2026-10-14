CREATE TABLE "StrategyAuthoringDraft" (
  "id" UUID PRIMARY KEY,
  "ownerId" TEXT NOT NULL CHECK (length("ownerId") BETWEEN 1 AND 200),
  "state" TEXT NOT NULL DEFAULT 'editing' CHECK ("state" IN ('editing', 'saved', 'discarded')),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "title" TEXT NOT NULL,
  "savedVersionId" UUID UNIQUE REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("id", "ownerId"),
  CHECK (("state" = 'saved') = ("savedVersionId" IS NOT NULL))
);
CREATE INDEX "StrategyAuthoringDraft_owner_updated" ON "StrategyAuthoringDraft" ("ownerId", "updatedAt" DESC, "id" DESC);
CREATE TABLE "StrategyAuthoringRevision" (
  "draftId" UUID NOT NULL,
  "ownerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "content" JSONB NOT NULL CHECK (jsonb_typeof("content") = 'object'),
  "validation" JSONB NOT NULL CHECK ("validation"->>'status' IN ('incomplete', 'invalid', 'structurally_valid')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("draftId", "revision"),
  UNIQUE ("draftId", "revision", "ownerId"),
  FOREIGN KEY ("draftId", "ownerId") REFERENCES "StrategyAuthoringDraft"("id", "ownerId") ON DELETE RESTRICT
);
ALTER TABLE "StrategyAuthoringDraft" ADD CONSTRAINT "StrategyAuthoringDraft_current_revision"
  FOREIGN KEY ("id", "revision", "ownerId") REFERENCES "StrategyAuthoringRevision"("draftId", "revision", "ownerId") DEFERRABLE INITIALLY DEFERRED;
INSERT INTO "SchemaVersion" (id, version, "updatedAt") VALUES (1, '20261004130000_strategy_authoring_drafts', now())
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = EXCLUDED."updatedAt";
