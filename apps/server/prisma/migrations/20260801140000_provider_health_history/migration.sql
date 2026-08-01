CREATE TABLE "ProviderHealthCheck" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderHealthCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProviderHealthCheck_provider_checkedAt_idx" ON "ProviderHealthCheck"("provider", "checkedAt");
CREATE INDEX "ProviderHealthCheck_state_checkedAt_idx" ON "ProviderHealthCheck"("state", "checkedAt");
