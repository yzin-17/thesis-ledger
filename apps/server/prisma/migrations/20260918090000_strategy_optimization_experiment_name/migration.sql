BEGIN;

ALTER TABLE "OptimizationExperiment"
  ADD COLUMN "name" TEXT;

CREATE INDEX "OptimizationExperiment_owner_created_id_idx"
  ON "OptimizationExperiment" ("ownerKey", "createdAt" DESC, "id" DESC);

COMMIT;
