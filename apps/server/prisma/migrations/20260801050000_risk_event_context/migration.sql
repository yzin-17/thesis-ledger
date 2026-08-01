ALTER TABLE "RiskEvent"
ADD COLUMN "accountId" UUID,
ADD COLUMN "symbol" TEXT,
ADD COLUMN "triggerValue" DECIMAL(24, 8),
ADD COLUMN "threshold" DECIMAL(24, 8),
ADD COLUMN "marketTime" TIMESTAMP(3);

CREATE INDEX "RiskEvent_accountId_symbol_evaluatedAt_idx"
ON "RiskEvent"("accountId", "symbol", "evaluatedAt");
