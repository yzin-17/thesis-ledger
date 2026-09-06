BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- PostgreSQL 扩展：保留当前 Instrument 搜索使用的 trigram 索引。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "TradeAccountMode" AS ENUM ('actual', 'shadow');

-- CreateEnum
CREATE TYPE "TradeLifecycle" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "TradeExitProgress" AS ENUM ('NONE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "TradeEndEvidence" AS ENUM ('SELL_EXECUTION', 'BALANCE_OBSERVATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TradeEvidenceCompleteness" AS ENUM ('COMPLETE', 'PARTIAL', 'CONFLICTED');

-- CreateTable
CREATE TABLE "SchemaVersion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'actual',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLedgerState" (
    "accountId" UUID NOT NULL,
    "ledgerRevision" BIGINT NOT NULL DEFAULT 0,
    "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountLedgerState_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "AccountCostStrategyVersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountCostStrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sector" TEXT,
    "identityStatus" TEXT NOT NULL DEFAULT 'provider',
    "identitySource" TEXT,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "FundNavPoint" (
    "symbol" TEXT NOT NULL,
    "navDate" TIMESTAMP(3) NOT NULL,
    "unitNav" DECIMAL(24,8) NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshness" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FundNavPoint_pkey" PRIMARY KEY ("symbol","navDate")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" UUID NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "canonicalCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL DEFAULT '',
    "pinyinInitials" TEXT NOT NULL DEFAULT '',
    "searchAliases" JSONB,
    "generation" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentAssetAssociation" (
    "id" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentAssetAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSyncState" (
    "consumer" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSyncState_pkey" PRIMARY KEY ("consumer")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "costPrice" DECIMAL(38,18) NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "accountMode" "TradeAccountMode" NOT NULL,
    "symbol" TEXT NOT NULL,
    "lifecycle" "TradeLifecycle" NOT NULL,
    "exitProgress" "TradeExitProgress" NOT NULL,
    "endEvidence" "TradeEndEvidence" NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "earliestEvidenceAt" TIMESTAMP(3),
    "sourceQuantity" DECIMAL(38,18) NOT NULL,
    "closedQuantity" DECIMAL(38,18) NOT NULL,
    "remainingQuantity" DECIMAL(38,18) NOT NULL,
    "grossRealizedPnl" DECIMAL(38,18),
    "netRealizedPnl" DECIMAL(38,18),
    "realizedNetReturnRate" DECIMAL(38,18),
    "costEstimated" BOOLEAN NOT NULL DEFAULT false,
    "completeness" "TradeEvidenceCompleteness" NOT NULL,
    "issues" JSONB NOT NULL,
    "costIssues" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "projectionFingerprint" TEXT,
    "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
    "costStrategyRevisionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEntryLeg" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "originalQuantity" DECIMAL(38,18) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "remainingQuantity" DECIMAL(38,18) NOT NULL,
    "rawCost" DECIMAL(38,18),
    "remainingCost" DECIMAL(38,18),
    "rawCostEstimated" BOOLEAN NOT NULL DEFAULT false,
    "charges" JSONB NOT NULL,

    CONSTRAINT "TradeEntryLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeBaselineComponent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "batchScope" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "observedQuantity" DECIMAL(38,18) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "remainingQuantity" DECIMAL(38,18) NOT NULL,
    "averageCost" DECIMAL(38,18),
    "rawCost" DECIMAL(38,18),
    "remainingCost" DECIMAL(38,18),
    "rawCostEstimated" BOOLEAN NOT NULL DEFAULT false,
    "costIncludesFees" TEXT NOT NULL,
    "reconciledExecutionFactIds" JSONB NOT NULL,
    "reconciliationFactIds" JSONB NOT NULL,

    CONSTRAINT "TradeBaselineComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCorporateActionAdjustment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "quantity" DECIMAL(38,18),
    "fromUnits" DECIMAL(38,18),
    "toUnits" DECIMAL(38,18),
    "positionQuantityBefore" DECIMAL(38,18) NOT NULL,
    "positionQuantityAfter" DECIMAL(38,18) NOT NULL,

    CONSTRAINT "TradeCorporateActionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCloseSlice" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "price" DECIMAL(38,18),
    "quantity" DECIMAL(38,18) NOT NULL,
    "remainingQuantityAfter" DECIMAL(38,18) NOT NULL,
    "charges" JSONB NOT NULL,
    "grossRealizedPnl" DECIMAL(38,18),
    "netRealizedPnl" DECIMAL(38,18),
    "realizedNetReturnRate" DECIMAL(38,18),
    "costEstimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TradeCloseSlice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCloseAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "closeSliceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceFactId" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "originalCost" DECIMAL(38,18),
    "allocatedBuyCharges" JSONB NOT NULL,

    CONSTRAINT "TradeCloseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeDividendAttribution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "amount" DECIMAL(38,18) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "TradeDividendAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvidenceSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "source" JSONB NOT NULL,

    CONSTRAINT "TradeEvidenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "settledAmount" DECIMAL(38,18) NOT NULL,
    "pendingReceivable" DECIMAL(38,18) NOT NULL,
    "pendingPayable" DECIMAL(38,18) NOT NULL,
    "completeness" TEXT NOT NULL,
    "issues" JSONB NOT NULL,
    "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSettlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "sourceConfidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "scope" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "contentFingerprint" TEXT,
    "imageHash" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "baselineHash" TEXT,
    "beforeState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "currentRevision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraftRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draftId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "rawEvidenceRef" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'FULL',
    "observedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "timePrecision" TEXT,
    "sourceTimezone" TEXT,
    "rows" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "submittedRowIds" JSONB,

    CONSTRAINT "ImportDraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineObservationBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "timePrecision" TEXT NOT NULL DEFAULT 'INSTANT',
    "capturedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceCategory" TEXT NOT NULL,
    "sourceChannel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "BaselineObservationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "externalId" TEXT,
    "sourceRowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "factId" UUID,
    "ledgerRevision" BIGINT,
    "timePrecision" TEXT,
    "sourceTimezone" TEXT,
    "economicOrderKey" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectionGeneration" BIGINT,
    "payloadVersion" INTEGER,
    "payload" JSONB,
    "sourceCategory" TEXT,
    "sourceChannel" TEXT,
    "actorId" TEXT,
    "revisionAction" TEXT,
    "supersedesEventId" UUID,
    "reason" TEXT,

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
CREATE TABLE "TargetAllocation" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "accountId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targets" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetAllocation_pkey" PRIMARY KEY ("id")
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
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshness" TEXT NOT NULL DEFAULT 'unknown',
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,

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
CREATE TABLE "BackfillJob" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "cursor" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackfillJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ProviderHealthCheck" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesiredProviderPolicy" (
    "consumer" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "routes" JSONB NOT NULL,
    "syncState" TEXT NOT NULL,
    "dsaRevision" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "lastError" JSONB,
    "effectiveProjection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesiredProviderPolicy_pkey" PRIMARY KEY ("consumer")
);

-- CreateTable
CREATE TABLE "DesiredProviderPolicyRevision" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "routes" JSONB NOT NULL,
    "syncState" TEXT NOT NULL,
    "dsaRevision" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "lastError" JSONB,
    "effectiveProjection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesiredProviderPolicyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTombstone" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderTombstone_pkey" PRIMARY KEY ("id")
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
    "needsRepair" BOOLEAN NOT NULL DEFAULT false,
    "repairReason" TEXT,
    "symbol" TEXT,
    "accountId" UUID,
    "sourcePlanId" UUID,
    "condition" JSONB,
    "parameters" JSONB,
    "config" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPositionState" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'actual',
    "holdingPeak" DECIMAL(24,8) NOT NULL,
    "peakAt" TIMESTAMP(3) NOT NULL,
    "positionUpdatedAt" TIMESTAMP(3),
    "lastPrice" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "positionId" UUID,
    "lastQuantity" DECIMAL(24,8) NOT NULL DEFAULT 0,

    CONSTRAINT "RiskPositionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRuleTriggerState" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "targetKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'actual',
    "positionId" UUID,
    "ruleVersion" INTEGER NOT NULL,
    "breachActive" BOOLEAN NOT NULL DEFAULT false,
    "activeEventId" UUID,
    "lastScanId" UUID,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRuleTriggerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'actual',
    "accountId" UUID,
    "symbol" TEXT,
    "triggerValue" DECIMAL(24,8),
    "threshold" DECIMAL(24,8),
    "marketTime" TIMESTAMP(3),
    "scanId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRuleAudit" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskRuleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCode" TEXT,
    "responseSummary" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCashDepositPlan" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "expectedAmount" DECIMAL(38,18) NOT NULL,
    "currency" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "startPeriod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextDueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "pausedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCashDepositPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCashDepositOccurrence" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DECIMAL(38,18) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actualAmount" DECIMAL(38,18),
    "occurredAt" TIMESTAMP(3),
    "ledgerEventId" UUID,
    "ledgerFactId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "skippedReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCashDepositOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
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
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestJob" (
    "id" UUID NOT NULL,
    "strategyVersionId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "warnings" JSONB,
    "cancelRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "engineVersion" TEXT,
    "resultChecksum" TEXT,

    CONSTRAINT "BacktestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'note',
    "accountId" UUID,
    "ledgerEventId" UUID,
    "tradePlanId" UUID,
    "riskEventId" UUID,
    "strategyVersionId" UUID,
    "symbol" TEXT,
    "side" TEXT,
    "reason" TEXT NOT NULL,
    "content" TEXT,
    "tags" JSONB,
    "thesis" TEXT,
    "catalyst" TEXT,
    "risk" TEXT,
    "exitReason" TEXT,
    "emotion" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePlan" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "tradeId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT,
    "plannedEntry" DECIMAL(24,8),
    "plannedExit" DECIMAL(24,8),
    "stopLoss" DECIMAL(24,8),
    "takeProfit" DECIMAL(24,8),
    "targetWeight" DECIMAL(12,8),
    "expectedHoldingDays" INTEGER,
    "plannedEntryAt" TIMESTAMP(3),
    "plannedExitAt" TIMESTAMP(3),
    "reason" TEXT,
    "thesis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalReviewSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "reviewObjectType" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "closeSliceId" TEXT,
    "factIds" JSONB NOT NULL,
    "eventIds" JSONB NOT NULL,
    "ledgerRevision" BIGINT NOT NULL,
    "projectionGeneration" BIGINT NOT NULL,
    "projectionFingerprint" TEXT,
    "fxEvidenceVersion" TEXT,
    "conversionFingerprint" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalReviewSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "capabilities" JSONB NOT NULL,
    "settings" JSONB,
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
    "question" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "result" JSONB,
    "context" JSONB,
    "modelMetadata" JSONB,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "retryOfRunId" UUID,
    "executionAttempt" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiToolCall" (
    "id" UUID NOT NULL,
    "aiRunId" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "provider" TEXT,
    "durationMs" INTEGER,
    "marketTime" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDecisionLog" (
    "id" UUID NOT NULL,
    "symbol" TEXT,
    "accountId" UUID,
    "question" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "conclusion" JSONB NOT NULL,
    "context" JSONB,
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecisionLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "SchemaVersion_version_key" ON "SchemaVersion"("version");

-- CreateIndex
CREATE INDEX "Account_active_idx" ON "Account"("active");

-- CreateIndex
CREATE INDEX "AccountCostStrategyVersion_accountId_effectiveAt_idx" ON "AccountCostStrategyVersion"("accountId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCostStrategyVersion_accountId_revision_key" ON "AccountCostStrategyVersion"("accountId", "revision");

-- CreateIndex
CREATE INDEX "FundNavPoint_navDate_idx" ON "FundNavPoint"("navDate");

-- CreateIndex
CREATE INDEX "Instrument_canonicalCode_idx" ON "Instrument"("canonicalCode");

-- CreateIndex
CREATE INDEX "Instrument_displayName_idx" ON "Instrument"("displayName");

-- CreateIndex
CREATE INDEX "Instrument_generation_active_idx" ON "Instrument"("generation", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_canonicalCode_instrumentType_market_key" ON "Instrument"("canonicalCode", "instrumentType", "market");

-- CreateIndex
CREATE INDEX "InstrumentAssetAssociation_instrumentId_status_idx" ON "InstrumentAssetAssociation"("instrumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentAssetAssociation_symbol_key" ON "InstrumentAssetAssociation"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentAssetAssociation_instrumentId_symbol_key" ON "InstrumentAssetAssociation"("instrumentId", "symbol");

-- CreateIndex
CREATE INDEX "Position_symbol_idx" ON "Position"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Position_accountId_symbol_key" ON "Position"("accountId", "symbol");

-- CreateIndex
CREATE INDEX "Trade_accountId_accountMode_symbol_idx" ON "Trade"("accountId", "accountMode", "symbol");

-- CreateIndex
CREATE INDEX "Trade_accountId_projectionGeneration_idx" ON "Trade"("accountId", "projectionGeneration");

-- CreateIndex
CREATE INDEX "Trade_accountId_openedAt_idx" ON "Trade"("accountId", "openedAt");

-- CreateIndex
CREATE INDEX "Trade_costStrategyRevisionId_idx" ON "Trade"("costStrategyRevisionId");

-- CreateIndex
CREATE INDEX "TradeEntryLeg_tradeId_occurredAt_idx" ON "TradeEntryLeg"("tradeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeEntryLeg_tradeId_factId_key" ON "TradeEntryLeg"("tradeId", "factId");

-- CreateIndex
CREATE INDEX "TradeBaselineComponent_tradeId_occurredAt_idx" ON "TradeBaselineComponent"("tradeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeBaselineComponent_tradeId_factId_key" ON "TradeBaselineComponent"("tradeId", "factId");

-- CreateIndex
CREATE INDEX "TradeCorporateActionAdjustment_tradeId_occurredAt_idx" ON "TradeCorporateActionAdjustment"("tradeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCorporateActionAdjustment_tradeId_factId_key" ON "TradeCorporateActionAdjustment"("tradeId", "factId");

-- CreateIndex
CREATE INDEX "TradeCloseSlice_tradeId_occurredAt_idx" ON "TradeCloseSlice"("tradeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCloseSlice_tradeId_factId_key" ON "TradeCloseSlice"("tradeId", "factId");

-- CreateIndex
CREATE INDEX "TradeCloseAllocation_sourceFactId_idx" ON "TradeCloseAllocation"("sourceFactId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCloseAllocation_closeSliceId_sourceFactId_key" ON "TradeCloseAllocation"("closeSliceId", "sourceFactId");

-- CreateIndex
CREATE INDEX "TradeDividendAttribution_tradeId_occurredAt_idx" ON "TradeDividendAttribution"("tradeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeDividendAttribution_tradeId_factId_key" ON "TradeDividendAttribution"("tradeId", "factId");

-- CreateIndex
CREATE INDEX "TradeEvidenceSource_tradeId_eventId_idx" ON "TradeEvidenceSource"("tradeId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeEvidenceSource_tradeId_kind_factId_key" ON "TradeEvidenceSource"("tradeId", "kind", "factId");

-- CreateIndex
CREATE INDEX "CashBalance_accountId_projectionGeneration_idx" ON "CashBalance"("accountId", "projectionGeneration");

-- CreateIndex
CREATE UNIQUE INDEX "CashBalance_accountId_currency_key" ON "CashBalance"("accountId", "currency");

-- CreateIndex
CREATE INDEX "CashSettlement_accountId_status_settledAt_idx" ON "CashSettlement"("accountId", "status", "settledAt");

-- CreateIndex
CREATE INDEX "CashSettlement_accountId_currency_idx" ON "CashSettlement"("accountId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "CashSettlement_accountId_factId_key" ON "CashSettlement"("accountId", "factId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDraft_idempotencyKey_key" ON "ImportDraft"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportDraft_accountId_status_idx" ON "ImportDraft"("accountId", "status");

-- CreateIndex
CREATE INDEX "ImportDraftRevision_draftId_submittedAt_idx" ON "ImportDraftRevision"("draftId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDraftRevision_draftId_revision_key" ON "ImportDraftRevision"("draftId", "revision");

-- CreateIndex
CREATE INDEX "BaselineObservationBatch_accountId_observedAt_idx" ON "BaselineObservationBatch"("accountId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineObservationBatch_accountId_sourceChannel_externalId_key" ON "BaselineObservationBatch"("accountId", "sourceChannel", "externalId");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_sourceChannel_sourceRowId_idx" ON "LedgerEvent"("accountId", "sourceChannel", "sourceRowId");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_ledgerRevision_idx" ON "LedgerEvent"("accountId", "ledgerRevision");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_occurredAt_idx" ON "LedgerEvent"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_factId_ledgerRevision_idx" ON "LedgerEvent"("accountId", "factId", "ledgerRevision");

-- CreateIndex
CREATE INDEX "LedgerEvent_accountId_occurredAt_economicOrderKey_id_idx" ON "LedgerEvent"("accountId", "occurredAt", "economicOrderKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEvent_accountId_sourceChannel_externalId_key" ON "LedgerEvent"("accountId", "sourceChannel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEvent_supersedesEventId_key" ON "LedgerEvent"("supersedesEventId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_capturedAt_idx" ON "PortfolioSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_accountId_capturedAt_key" ON "PortfolioSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "TargetAllocation_scope_accountId_active_idx" ON "TargetAllocation"("scope", "accountId", "active");

-- CreateIndex
CREATE INDEX "MarketBar_symbol_timeframe_timestamp_idx" ON "MarketBar"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "MarketBar_symbol_timeframe_timestamp_provider_key" ON "MarketBar"("symbol", "timeframe", "timestamp", "provider");

-- CreateIndex
CREATE INDEX "DataQualityIssue_status_detectedAt_idx" ON "DataQualityIssue"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "BackfillJob_symbol_timeframe_status_idx" ON "BackfillJob"("symbol", "timeframe", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_provider_key" ON "ProviderHealth"("provider");

-- CreateIndex
CREATE INDEX "ProviderHealth_state_checkedAt_idx" ON "ProviderHealth"("state", "checkedAt");

-- CreateIndex
CREATE INDEX "ProviderHealthCheck_provider_checkedAt_idx" ON "ProviderHealthCheck"("provider", "checkedAt");

-- CreateIndex
CREATE INDEX "ProviderHealthCheck_state_checkedAt_idx" ON "ProviderHealthCheck"("state", "checkedAt");

-- CreateIndex
CREATE INDEX "DesiredProviderPolicy_syncState_updatedAt_idx" ON "DesiredProviderPolicy"("syncState", "updatedAt");

-- CreateIndex
CREATE INDEX "DesiredProviderPolicyRevision_consumer_createdAt_idx" ON "DesiredProviderPolicyRevision"("consumer", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesiredProviderPolicyRevision_consumer_revision_key" ON "DesiredProviderPolicyRevision"("consumer", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderTombstone_providerId_key" ON "ProviderTombstone"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTombstone_removedAt_idx" ON "ProviderTombstone"("removedAt");

-- CreateIndex
CREATE INDEX "RiskRule_accountId_idx" ON "RiskRule"("accountId");

-- CreateIndex
CREATE INDEX "RiskPositionState_symbol_mode_idx" ON "RiskPositionState"("symbol", "mode");

-- CreateIndex
CREATE INDEX "RiskPositionState_positionId_idx" ON "RiskPositionState"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskPositionState_accountId_symbol_mode_key" ON "RiskPositionState"("accountId", "symbol", "mode");

-- CreateIndex
CREATE INDEX "RiskRuleTriggerState_positionId_idx" ON "RiskRuleTriggerState"("positionId");

-- CreateIndex
CREATE INDEX "RiskRuleTriggerState_activeEventId_idx" ON "RiskRuleTriggerState"("activeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskRuleTriggerState_ruleId_targetKey_symbol_mode_key" ON "RiskRuleTriggerState"("ruleId", "targetKey", "symbol", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEvent_dedupeKey_key" ON "RiskEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "RiskEvent_ruleId_evaluatedAt_idx" ON "RiskEvent"("ruleId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_triggered_severity_idx" ON "RiskEvent"("triggered", "severity");

-- CreateIndex
CREATE INDEX "RiskEvent_accountId_symbol_evaluatedAt_idx" ON "RiskEvent"("accountId", "symbol", "evaluatedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_mode_evaluatedAt_id_idx" ON "RiskEvent"("mode", "evaluatedAt", "id");

-- CreateIndex
CREATE INDEX "RiskRuleAudit_ruleId_createdAt_idx" ON "RiskRuleAudit"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_scheduledAt_idx" ON "NotificationDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_subjectType_subjectId_idx" ON "NotificationDelivery"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_dedupKey_channel_key" ON "NotificationDelivery"("dedupKey", "channel");

-- CreateIndex
CREATE INDEX "RecurringCashDepositPlan_accountId_status_idx" ON "RecurringCashDepositPlan"("accountId", "status");

-- CreateIndex
CREATE INDEX "RecurringCashDepositPlan_status_nextDueAt_idx" ON "RecurringCashDepositPlan"("status", "nextDueAt");

-- CreateIndex
CREATE INDEX "RecurringCashDepositOccurrence_accountId_status_scheduledFo_idx" ON "RecurringCashDepositOccurrence"("accountId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RecurringCashDepositOccurrence_status_scheduledFor_idx" ON "RecurringCashDepositOccurrence"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RecurringCashDepositOccurrence_ledgerEventId_idx" ON "RecurringCashDepositOccurrence"("ledgerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringCashDepositOccurrence_planId_periodKey_key" ON "RecurringCashDepositOccurrence"("planId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
CREATE INDEX "BacktestJob_status_createdAt_idx" ON "BacktestJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_symbol_createdAt_idx" ON "JournalEntry"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_accountId_createdAt_idx" ON "JournalEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_tradePlanId_createdAt_idx" ON "JournalEntry"("tradePlanId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_ledgerEventId_idx" ON "JournalEntry"("ledgerEventId");

-- CreateIndex
CREATE INDEX "JournalEntry_riskEventId_idx" ON "JournalEntry"("riskEventId");

-- CreateIndex
CREATE INDEX "JournalEntry_strategyVersionId_idx" ON "JournalEntry"("strategyVersionId");

-- CreateIndex
CREATE INDEX "TradePlan_symbol_status_idx" ON "TradePlan"("symbol", "status");

-- CreateIndex
CREATE INDEX "TradePlan_accountId_status_idx" ON "TradePlan"("accountId", "status");

-- CreateIndex
CREATE INDEX "TradePlan_tradeId_status_idx" ON "TradePlan"("tradeId", "status");

-- CreateIndex
CREATE INDEX "JournalReviewSnapshot_accountId_reviewObjectType_tradeId_idx" ON "JournalReviewSnapshot"("accountId", "reviewObjectType", "tradeId");

-- CreateIndex
CREATE INDEX "JournalReviewSnapshot_tradeId_closeSliceId_createdAt_idx" ON "JournalReviewSnapshot"("tradeId", "closeSliceId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalReviewSnapshot_status_createdAt_idx" ON "JournalReviewSnapshot"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_name_key" ON "ProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AutomationRun_jobId_startedAt_idx" ON "AutomationRun"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_id_idx" ON "AiRun"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AiRun_retryOfRunId_idx" ON "AiRun"("retryOfRunId");

-- CreateIndex
CREATE INDEX "AiRun_leaseUntil_idx" ON "AiRun"("leaseUntil");

-- CreateIndex
CREATE INDEX "AiToolCall_aiRunId_createdAt_idx" ON "AiToolCall"("aiRunId", "createdAt");

-- CreateIndex
CREATE INDEX "AiToolCall_tool_status_createdAt_idx" ON "AiToolCall"("tool", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiDecisionLog_symbol_createdAt_idx" ON "AiDecisionLog"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "AiDecisionLog_accountId_createdAt_idx" ON "AiDecisionLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_createdAt_idx" ON "AuditLog"("resource", "resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountLedgerState" ADD CONSTRAINT "AccountLedgerState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCostStrategyVersion" ADD CONSTRAINT "AccountCostStrategyVersion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundNavPoint" ADD CONSTRAINT "FundNavPoint_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentAssetAssociation" ADD CONSTRAINT "InstrumentAssetAssociation_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentAssetAssociation" ADD CONSTRAINT "InstrumentAssetAssociation_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_costStrategyRevisionId_fkey" FOREIGN KEY ("costStrategyRevisionId") REFERENCES "AccountCostStrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEntryLeg" ADD CONSTRAINT "TradeEntryLeg_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeBaselineComponent" ADD CONSTRAINT "TradeBaselineComponent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCorporateActionAdjustment" ADD CONSTRAINT "TradeCorporateActionAdjustment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCloseSlice" ADD CONSTRAINT "TradeCloseSlice_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCloseAllocation" ADD CONSTRAINT "TradeCloseAllocation_closeSliceId_fkey" FOREIGN KEY ("closeSliceId") REFERENCES "TradeCloseSlice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDividendAttribution" ADD CONSTRAINT "TradeDividendAttribution_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvidenceSource" ADD CONSTRAINT "TradeEvidenceSource_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBalance" ADD CONSTRAINT "CashBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSettlement" ADD CONSTRAINT "CashSettlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraftRevision" ADD CONSTRAINT "ImportDraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ImportDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineObservationBatch" ADD CONSTRAINT "BaselineObservationBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "LedgerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketBar" ADD CONSTRAINT "MarketBar_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesiredProviderPolicyRevision" ADD CONSTRAINT "DesiredProviderPolicyRevision_consumer_fkey" FOREIGN KEY ("consumer") REFERENCES "DesiredProviderPolicy"("consumer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRule" ADD CONSTRAINT "RiskRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPositionState" ADD CONSTRAINT "RiskPositionState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPositionState" ADD CONSTRAINT "RiskPositionState_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRuleTriggerState" ADD CONSTRAINT "RiskRuleTriggerState_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RiskRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRuleTriggerState" ADD CONSTRAINT "RiskRuleTriggerState_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRuleTriggerState" ADD CONSTRAINT "RiskRuleTriggerState_activeEventId_fkey" FOREIGN KEY ("activeEventId") REFERENCES "RiskEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RiskRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCashDepositPlan" ADD CONSTRAINT "RecurringCashDepositPlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCashDepositOccurrence" ADD CONSTRAINT "RecurringCashDepositOccurrence_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecurringCashDepositPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCashDepositOccurrence" ADD CONSTRAINT "RecurringCashDepositOccurrence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCashDepositOccurrence" ADD CONSTRAINT "RecurringCashDepositOccurrence_ledgerEventId_fkey" FOREIGN KEY ("ledgerEventId") REFERENCES "LedgerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestJob" ADD CONSTRAINT "BacktestJob_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_ledgerEventId_fkey" FOREIGN KEY ("ledgerEventId") REFERENCES "LedgerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "RiskEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma Schema 无法表达的 current database invariants。
ALTER TABLE "SchemaVersion"
  ADD CONSTRAINT "SchemaVersion_singleton_check" CHECK ("id" = 1);

ALTER TABLE "AccountCostStrategyVersion"
  ADD CONSTRAINT "AccountCostStrategyVersion_method_check"
  CHECK ("method" IN ('AVG', 'FIFO'));

ALTER TABLE "ImportDraft"
  ADD CONSTRAINT "ImportDraft_scope_check"
  CHECK ("scope" IN ('FULL', 'PARTIAL'));

ALTER TABLE "ImportDraftRevision"
  ADD CONSTRAINT "ImportDraftRevision_time_precision_check"
  CHECK ("timePrecision" IS NULL OR "timePrecision" IN ('INSTANT', 'DATE', 'UNKNOWN')),
  ADD CONSTRAINT "ImportDraftRevision_scope_check"
  CHECK ("scope" IN ('FULL', 'PARTIAL'));

ALTER TABLE "BaselineObservationBatch"
  ADD CONSTRAINT "BaselineObservationBatch_time_precision_check"
  CHECK ("timePrecision" IN ('INSTANT', 'DATE', 'UNKNOWN')),
  ADD CONSTRAINT "BaselineObservationBatch_scope_check"
  CHECK ("scope" IN ('FULL', 'PARTIAL')),
  ADD CONSTRAINT "BaselineObservationBatch_status_check"
  CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'VOID'));

ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_v2_revisionAction_check"
  CHECK (
    "factId" IS NULL OR "revisionAction" IN ('CREATE', 'REPLACE', 'VOID', 'RESTORE')
  ),
  ADD CONSTRAINT "LedgerEvent_v2_required_fields_check"
  CHECK (
    "factId" IS NULL OR (
      "ledgerRevision" IS NOT NULL
      AND "timePrecision" IS NOT NULL
      AND "sourceTimezone" IS NOT NULL
      AND "economicOrderKey" IS NOT NULL
      AND "payloadVersion" IS NOT NULL
      AND "sourceCategory" IS NOT NULL
      AND "sourceChannel" IS NOT NULL
      AND "actorId" IS NOT NULL
      AND "revisionAction" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "LedgerEvent_v2_revision_shape_check"
  CHECK (
    "factId" IS NULL OR (
      ("revisionAction" = 'CREATE' AND "supersedesEventId" IS NULL)
      OR (
        "revisionAction" IN ('REPLACE', 'RESTORE')
        AND "supersedesEventId" IS NOT NULL
        AND "reason" IS NOT NULL
      )
      OR (
        "revisionAction" = 'VOID'
        AND "supersedesEventId" IS NOT NULL
        AND "reason" IS NOT NULL
      )
    )
  ),
  ADD CONSTRAINT "LedgerEvent_v2_unknown_time_check"
  CHECK (
    "factId" IS NULL
    OR "occurredAt" IS NOT NULL
    OR "timePrecision" = 'UNKNOWN'
  );

ALTER TABLE "RecurringCashDepositPlan"
  ADD CONSTRAINT "RecurringCashDepositPlan_dayOfMonth_check"
  CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  ADD CONSTRAINT "RecurringCashDepositPlan_expectedAmount_check"
  CHECK ("expectedAmount" > 0),
  ADD CONSTRAINT "RecurringCashDepositPlan_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "RecurringCashDepositPlan_timezone_check"
  CHECK ("timezone" = 'Asia/Shanghai'),
  ADD CONSTRAINT "RecurringCashDepositPlan_startPeriod_check"
  CHECK ("startPeriod" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "RecurringCashDepositPlan_status_check"
  CHECK ("status" IN ('ACTIVE', 'PAUSED', 'ENDED'));

ALTER TABLE "RecurringCashDepositOccurrence"
  ADD CONSTRAINT "RecurringCashDepositOccurrence_expectedAmount_check"
  CHECK ("expectedAmount" > 0),
  ADD CONSTRAINT "RecurringCashDepositOccurrence_actualAmount_check"
  CHECK ("actualAmount" IS NULL OR "actualAmount" > 0),
  ADD CONSTRAINT "RecurringCashDepositOccurrence_version_check"
  CHECK ("version" > 0),
  ADD CONSTRAINT "RecurringCashDepositOccurrence_periodKey_check"
  CHECK ("periodKey" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "RecurringCashDepositOccurrence_status_check"
  CHECK ("status" IN ('PENDING', 'CONFIRMED', 'SKIPPED'));

-- 保留当前 Prisma Schema 未建模的 trigram 搜索索引和部分唯一索引。
CREATE INDEX "Instrument_displayName_trgm_idx"
  ON "Instrument" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX "Instrument_searchAliases_trgm_idx"
  ON "Instrument" USING GIN ((COALESCE("searchAliases"::text, '')) gin_trgm_ops);
CREATE UNIQUE INDEX "AutomationJob_cash_deposit_materialization_singleton_key"
  ON "AutomationJob"("type")
  WHERE "type" = 'cash-deposit-materialization';

CREATE FUNCTION reject_ledger_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $ledger_immutable$
BEGIN
  RAISE EXCEPTION 'LedgerEvent is append-only; UPDATE and DELETE are forbidden'
    USING ERRCODE = '55000';
END
$ledger_immutable$;

CREATE TRIGGER "LedgerEvent_append_only"
BEFORE UPDATE OR DELETE ON "LedgerEvent"
FOR EACH ROW EXECUTE FUNCTION reject_ledger_event_mutation();

CREATE FUNCTION reject_frozen_import_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $frozen_import$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted ImportDraftRevision is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$frozen_import$;

CREATE TRIGGER "ImportDraftRevision_frozen"
BEFORE UPDATE OR DELETE ON "ImportDraftRevision"
FOR EACH ROW EXECUTE FUNCTION reject_frozen_import_revision_mutation();

CREATE FUNCTION reject_submitted_baseline_batch_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $submitted_baseline$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted BaselineObservationBatch is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$submitted_baseline$;

CREATE TRIGGER "BaselineObservationBatch_submitted"
BEFORE UPDATE OR DELETE ON "BaselineObservationBatch"
FOR EACH ROW EXECUTE FUNCTION reject_submitted_baseline_batch_mutation();

-- 系统调度器需要的内置任务属于 current baseline，而非旧数据迁移。
INSERT INTO "AutomationJob" (
  "id", "name", "type", "cron", "timezone", "enabled", "retryPolicy", "lockTtlMs", "nextRunAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000010',
  '定期现金入账实例生成',
  'cash-deposit-materialization',
  '0 9 * * *',
  'Asia/Shanghai',
  TRUE,
  '{"maxAttempts":3,"backoffMs":1000}'::jsonb,
  300000,
  CURRENT_TIMESTAMP
);

INSERT INTO "SchemaVersion" ("id", "version")
VALUES (1, '20260905000000_fresh_database_baseline');

COMMIT;
