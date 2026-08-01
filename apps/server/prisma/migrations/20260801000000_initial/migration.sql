-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "broker" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sector" TEXT,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "costPrice" DECIMAL(24,8) NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT,
    "quantity" DECIMAL(24,8),
    "price" DECIMAL(24,8),
    "amount" DECIMAL(24,8),
    "fee" DECIMAL(24,8),
    "tax" DECIMAL(24,8),
    "externalId" TEXT,
    "correctionOf" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "marketValue" DECIMAL(24,8) NOT NULL,
    "costValue" DECIMAL(24,8) NOT NULL,
    "cashValue" DECIMAL(24,8) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketBar" (
    "id" BIGSERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(24,8) NOT NULL,
    "high" DECIMAL(24,8) NOT NULL,
    "low" DECIMAL(24,8) NOT NULL,
    "close" DECIMAL(24,8) NOT NULL,
    "volume" DECIMAL(30,8) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "MarketBar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityIssue" (
    "id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "symbol" TEXT,
    "provider" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DataQualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRule" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "threshold" DECIMAL(24,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "symbol" TEXT,
    "accountId" UUID,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestJob" (
    "id" UUID NOT NULL,
    "strategyVersionId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "warnings" JSONB,
    "cancelRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "ledgerEventId" UUID,
    "symbol" TEXT,
    "side" TEXT,
    "reason" TEXT NOT NULL,
    "emotion" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePlan" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "plannedEntry" DECIMAL(24,8),
    "plannedExit" DECIMAL(24,8),
    "stopLoss" DECIMAL(24,8),
    "takeProfit" DECIMAL(24,8),
    "targetWeight" DECIMAL(12,8),
    "expectedHoldingDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "capabilities" JSONB NOT NULL,
    "encryptedCredentials" BYTEA,
    "quota" JSONB,
    "cost" JSONB,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retryPolicy" JSONB NOT NULL,
    "lockTtlMs" INTEGER NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "traceId" TEXT NOT NULL,
    "output" JSONB,
    "error" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "traceId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_active_idx" ON "Account"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_source_key" ON "Account"("name", "source");

-- CreateIndex
CREATE INDEX "Position_symbol_idx" ON "Position"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Position_accountId_symbol_key" ON "Position"("accountId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDraft_idempotencyKey_key" ON "ImportDraft"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportDraft_accountId_status_idx" ON "ImportDraft"("accountId", "status");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_occurredAt_idx" ON "LedgerEvent"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEvent_symbol_occurredAt_idx" ON "LedgerEvent"("symbol", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEvent_accountId_externalId_key" ON "LedgerEvent"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_capturedAt_idx" ON "PortfolioSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_accountId_capturedAt_key" ON "PortfolioSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketBar_symbol_timeframe_timestamp_idx" ON "MarketBar"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "MarketBar_symbol_timeframe_timestamp_provider_key" ON "MarketBar"("symbol", "timeframe", "timestamp", "provider");

-- CreateIndex
CREATE INDEX "DataQualityIssue_status_detectedAt_idx" ON "DataQualityIssue"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_ruleId_evaluatedAt_idx" ON "RiskEvent"("ruleId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_triggered_severity_idx" ON "RiskEvent"("triggered", "severity");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_scheduledAt_idx" ON "NotificationDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_dedupKey_channel_key" ON "NotificationDelivery"("dedupKey", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
CREATE INDEX "BacktestJob_status_createdAt_idx" ON "BacktestJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_symbol_createdAt_idx" ON "JournalEntry"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "TradePlan_symbol_status_idx" ON "TradePlan"("symbol", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_name_key" ON "ProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AutomationRun_jobId_startedAt_idx" ON "AutomationRun"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_createdAt_idx" ON "AuditLog"("resource", "resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketBar" ADD CONSTRAINT "MarketBar_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RiskRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestJob" ADD CONSTRAINT "BacktestJob_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
