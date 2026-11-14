ALTER TABLE "OptimizationExperiment"
  ADD COLUMN "retryState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT "OptimizationExperiment_retryState_object"
    CHECK (jsonb_typeof("retryState") = 'object');
