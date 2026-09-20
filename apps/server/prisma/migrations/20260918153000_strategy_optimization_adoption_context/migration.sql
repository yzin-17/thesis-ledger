BEGIN;

ALTER TABLE "OptimizationAdoption"
  ADD COLUMN "baselineStrategyVersionId" UUID,
  ADD COLUMN "confirmedCurrentStrategyVersionId" UUID;

ALTER TABLE "OptimizationAdoption"
  ADD CONSTRAINT "OptimizationAdoption_baselineVersion_fkey"
    FOREIGN KEY ("baselineStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OptimizationAdoption_confirmedCurrentVersion_fkey"
    FOREIGN KEY ("confirmedCurrentStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OptimizationAdoption_baselineVersion_idx"
  ON "OptimizationAdoption"("baselineStrategyVersionId");

COMMIT;
