BEGIN;

ALTER TABLE "OptimizationAttempt"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "OptimizationAttempt_lease_idx" ON "OptimizationAttempt"("leaseUntil");
CREATE UNIQUE INDEX "OptimizationAdoption_candidate_key" ON "OptimizationAdoption"("candidateId");

COMMIT;
