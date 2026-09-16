BEGIN;

ALTER TABLE "OptimizationExperiment"
  ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'existing',
  ADD COLUMN "discoveryScope" JSONB,
  ADD COLUMN "strategySpaceVersion" TEXT;

ALTER TABLE "OptimizationExperiment"
  ADD CONSTRAINT "OptimizationExperiment_source_mode_check"
  CHECK ("sourceMode" IN ('existing', 'discovery'));

ALTER TABLE "OptimizationExperiment"
  ADD CONSTRAINT "OptimizationExperiment_discovery_scope_check"
  CHECK (
    ("sourceMode" = 'existing' AND "discoveryScope" IS NULL AND "strategySpaceVersion" IS NULL)
    OR
    ("sourceMode" = 'discovery' AND "discoveryScope" IS NOT NULL AND "strategySpaceVersion" IS NOT NULL)
  );

COMMIT;
