ALTER TABLE "StrategyAuthoringOperation"
  ADD COLUMN "startedAt" TIMESTAMPTZ,
  ADD COLUMN "cancelRequestedAt" TIMESTAMPTZ,
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("deliveryAttempts" BETWEEN 0 AND 2);
UPDATE "SchemaVersion" SET "version"='20261005140000_authoring_execution_state', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=1;
