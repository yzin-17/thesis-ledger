CREATE TABLE "NavBacktestPreparation" (
    "id" UUID NOT NULL,
    "strategyVersionId" UUID NOT NULL,
    "preparationHash" CHAR(64) NOT NULL,
    "contentChecksum" CHAR(64) NOT NULL,
    "request" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedRunId" UUID,

    CONSTRAINT "NavBacktestPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NavBacktestPreparation_consumedRunId_key"
    ON "NavBacktestPreparation"("consumedRunId");

CREATE INDEX "NavBacktestPreparation_strategyVersionId_expiresAt_idx"
    ON "NavBacktestPreparation"("strategyVersionId", "expiresAt");

ALTER TABLE "NavBacktestPreparation"
    ADD CONSTRAINT "NavBacktestPreparation_strategyVersionId_fkey"
    FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NavBacktestPreparation"
    ADD CONSTRAINT "NavBacktestPreparation_consumedRunId_fkey"
    FOREIGN KEY ("consumedRunId") REFERENCES "BacktestJob"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
