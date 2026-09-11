BEGIN;

CREATE TABLE "StrategyRiskApplication" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerKey" TEXT NOT NULL DEFAULT 'local-user',
  "strategyVersionId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "symbol" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "semanticVersion" TEXT NOT NULL,
  "planHash" TEXT NOT NULL,
  "plan" JSONB NOT NULL,
  "cycleMode" TEXT NOT NULL,
  "cycleAnchor" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "notification" JSONB NOT NULL,
  "coverage" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "StrategyRiskApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StrategyRiskApplication_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StrategyRiskApplication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StrategyRiskApplication_idempotencyKey_key" ON "StrategyRiskApplication"("idempotencyKey");
CREATE INDEX "StrategyRiskApplication_strategyVersionId_idx" ON "StrategyRiskApplication"("strategyVersionId");
CREATE INDEX "StrategyRiskApplication_account_symbol_idx" ON "StrategyRiskApplication"("accountId", "symbol");
CREATE UNIQUE INDEX "StrategyRiskApplication_active_account_symbol_key"
  ON "StrategyRiskApplication"("accountId", "symbol")
  WHERE "enabled" = true AND "archivedAt" IS NULL;

CREATE TABLE "StrategyRiskApplicationAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrategyRiskApplicationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StrategyRiskApplicationAudit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "StrategyRiskApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StrategyRiskApplicationAudit_application_created_idx" ON "StrategyRiskApplicationAudit"("applicationId", "createdAt");

CREATE TABLE "OptimizationExperiment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerKey" TEXT NOT NULL DEFAULT 'local-user',
  "baselineStrategyVersionId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "objective" JSONB NOT NULL,
  "allowedParameterIds" JSONB NOT NULL,
  "split" JSONB NOT NULL,
  "runConfig" JSONB NOT NULL,
  "dataFingerprint" TEXT NOT NULL,
  "modelConfig" JSONB NOT NULL,
  "budget" JSONB NOT NULL,
  "maxRounds" INTEGER NOT NULL,
  "aiCallsUsed" INTEGER NOT NULL DEFAULT 0,
  "backtestRunsUsed" INTEGER NOT NULL DEFAULT 0,
  "pausedDurationMs" INTEGER NOT NULL DEFAULT 0 CHECK ("pausedDurationMs" >= 0),
  "costUsed" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "baselineRunRefs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "baselineMetrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "frozenDataFingerprints" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lockedCandidateIds" JSONB,
  "selectedCandidateId" UUID,
  "testExposedAt" TIMESTAMP(3),
  "exposure" JSONB,
  "stopReason" TEXT,
  "cancelRequestedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "executionAttempt" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptimizationExperiment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OptimizationExperiment_baselineStrategyVersionId_fkey" FOREIGN KEY ("baselineStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OptimizationExperiment_idempotencyKey_key" ON "OptimizationExperiment"("idempotencyKey");
CREATE INDEX "OptimizationExperiment_status_stage_idx" ON "OptimizationExperiment"("status", "stage");
CREATE INDEX "OptimizationExperiment_baseline_idx" ON "OptimizationExperiment"("baselineStrategyVersionId", "createdAt");
CREATE INDEX "OptimizationExperiment_lease_idx" ON "OptimizationExperiment"("leaseUntil");

CREATE TABLE "OptimizationCandidate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "experimentId" UUID NOT NULL,
  "candidateNumber" INTEGER NOT NULL,
  "modelKey" TEXT NOT NULL,
  "candidateStrategyVersionId" UUID NOT NULL,
  "executionHash" TEXT NOT NULL,
  "parentCandidateId" UUID,
  "proposal" JSONB NOT NULL,
  "diff" JSONB NOT NULL,
  "validationStatus" TEXT NOT NULL,
  "duplicateOfId" UUID,
  "runRefs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "adoptedStrategyVersionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptimizationCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OptimizationCandidate_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "OptimizationExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationCandidate_candidateStrategyVersionId_fkey" FOREIGN KEY ("candidateStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationCandidate_parentCandidateId_fkey" FOREIGN KEY ("parentCandidateId") REFERENCES "OptimizationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationCandidate_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "OptimizationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationCandidate_adoptedStrategyVersionId_fkey" FOREIGN KEY ("adoptedStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OptimizationCandidate_number_key" ON "OptimizationCandidate"("experimentId", "candidateNumber");
CREATE UNIQUE INDEX "OptimizationCandidate_hash_key" ON "OptimizationCandidate"("experimentId", "executionHash");
CREATE INDEX "OptimizationCandidate_experiment_model_idx" ON "OptimizationCandidate"("experimentId", "modelKey");

CREATE TABLE "OptimizationAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "experimentId" UUID NOT NULL,
  "modelKey" TEXT NOT NULL,
  "aiRunId" UUID,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "proposal" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptimizationAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OptimizationAttempt_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "OptimizationExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationAttempt_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OptimizationAttempt_model_attempt_key" ON "OptimizationAttempt"("experimentId", "modelKey", "attempt");
CREATE INDEX "OptimizationAttempt_experiment_created_idx" ON "OptimizationAttempt"("experimentId", "createdAt");

CREATE TABLE "OptimizationAdoption" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "experimentId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "candidateHash" TEXT NOT NULL,
  "formalStrategyVersionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptimizationAdoption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OptimizationAdoption_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "OptimizationExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationAdoption_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "OptimizationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OptimizationAdoption_formalStrategyVersionId_fkey" FOREIGN KEY ("formalStrategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OptimizationAdoption_idempotencyKey_key" ON "OptimizationAdoption"("idempotencyKey");
CREATE UNIQUE INDEX "OptimizationAdoption_formalVersion_key" ON "OptimizationAdoption"("formalStrategyVersionId");

COMMIT;
