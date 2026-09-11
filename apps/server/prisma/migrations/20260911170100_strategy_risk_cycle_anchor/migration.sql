ALTER TABLE "StrategyRiskApplication"
ADD COLUMN "cycleAnchor" JSONB;

ALTER TABLE "OptimizationExperiment"
ADD COLUMN "baselineRunRefs" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "baselineMetrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "frozenDataFingerprints" JSONB NOT NULL DEFAULT '{}'::jsonb;
