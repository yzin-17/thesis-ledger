CREATE TABLE "StrategyAuthoringOperation" (
  "id" UUID PRIMARY KEY,
  "draftId" UUID NOT NULL,
  "ownerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  "attempt" INTEGER NOT NULL DEFAULT 0 CHECK ("attempt" >= 0),
  "leaseUntil" TIMESTAMPTZ,
  "outcome" JSONB,
  "disposition" TEXT NOT NULL DEFAULT 'unapplied' CHECK ("disposition" IN ('unapplied', 'stale')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("draftId", "idempotencyKey"),
  UNIQUE ("id", "draftId", "revision", "ownerId"),
  FOREIGN KEY ("draftId", "revision", "ownerId") REFERENCES "StrategyAuthoringRevision"("draftId", "revision", "ownerId") ON DELETE RESTRICT,
  CHECK (("status" = 'running') = ("leaseUntil" IS NOT NULL)),
  CHECK (("status" IN ('succeeded', 'failed', 'cancelled')) = ("outcome" IS NOT NULL))
);
CREATE UNIQUE INDEX "StrategyAuthoringOperation_one_active" ON "StrategyAuthoringOperation" ("draftId") WHERE "status" IN ('queued', 'running');
CREATE INDEX "StrategyAuthoringOperation_owner_draft" ON "StrategyAuthoringOperation" ("ownerId", "draftId", "createdAt");
CREATE TABLE "StrategyAuthoringProposal" (
  "id" UUID PRIMARY KEY,
  "draftId" UUID NOT NULL,
  "ownerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operationId" UUID NOT NULL UNIQUE,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'applied', 'discarded', 'expired')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY ("operationId", "draftId", "revision", "ownerId") REFERENCES "StrategyAuthoringOperation"("id", "draftId", "revision", "ownerId") ON DELETE RESTRICT
);
CREATE TABLE "StrategyAuthoringSource" (
  "versionId" UUID PRIMARY KEY REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT,
  "draftId" UUID NOT NULL UNIQUE,
  "ownerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY ("draftId", "revision", "ownerId") REFERENCES "StrategyAuthoringRevision"("draftId", "revision", "ownerId") ON DELETE RESTRICT
);
INSERT INTO "SchemaVersion" (id, version, "updatedAt") VALUES (1, '20261004140000_strategy_authoring_records', now())
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = EXCLUDED."updatedAt";
