CREATE TABLE "ProviderHealth" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderHealth_provider_key" ON "ProviderHealth"("provider");
CREATE INDEX "ProviderHealth_state_checkedAt_idx" ON "ProviderHealth"("state", "checkedAt");
