BEGIN;

ALTER TABLE "Position"
  ALTER COLUMN "quantity" TYPE DECIMAL(38, 18),
  ALTER COLUMN "costPrice" TYPE DECIMAL(38, 18);

CREATE TABLE "Trade" (
  "id" TEXT NOT NULL,
  "accountId" UUID NOT NULL,
  "accountMode" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "lifecycle" TEXT NOT NULL,
  "exitProgress" TEXT NOT NULL,
  "endEvidence" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "earliestEvidenceAt" TIMESTAMP(3),
  "sourceQuantity" DECIMAL(38, 18) NOT NULL,
  "closedQuantity" DECIMAL(38, 18) NOT NULL,
  "remainingQuantity" DECIMAL(38, 18) NOT NULL,
  "grossRealizedPnl" DECIMAL(38, 18),
  "netRealizedPnl" DECIMAL(38, 18),
  "realizedNetReturnRate" DECIMAL(38, 18),
  "costEstimated" BOOLEAN NOT NULL DEFAULT false,
  "completeness" TEXT NOT NULL,
  "issues" JSONB NOT NULL,
  "costIssues" JSONB NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
  "costStrategyRevisionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Trade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Trade_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trade_symbol_fkey"
    FOREIGN KEY ("symbol") REFERENCES "Asset"("symbol")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trade_costStrategyRevisionId_fkey"
    FOREIGN KEY ("costStrategyRevisionId") REFERENCES "AccountCostStrategyVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Trade_accountId_accountMode_symbol_idx"
  ON "Trade"("accountId", "accountMode", "symbol");
CREATE INDEX "Trade_accountId_projectionGeneration_idx"
  ON "Trade"("accountId", "projectionGeneration");
CREATE INDEX "Trade_accountId_openedAt_idx"
  ON "Trade"("accountId", "openedAt");
CREATE INDEX "Trade_costStrategyRevisionId_idx"
  ON "Trade"("costStrategyRevisionId");

CREATE TABLE "TradeEntryLeg" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tradeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL,
  "price" DECIMAL(38, 18) NOT NULL,
  "originalQuantity" DECIMAL(38, 18) NOT NULL,
  "quantity" DECIMAL(38, 18) NOT NULL,
  "remainingQuantity" DECIMAL(38, 18) NOT NULL,
  "rawCost" DECIMAL(38, 18),
  "remainingCost" DECIMAL(38, 18),
  "rawCostEstimated" BOOLEAN NOT NULL DEFAULT false,
  "charges" JSONB NOT NULL,

  CONSTRAINT "TradeEntryLeg_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeEntryLeg_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeEntryLeg_tradeId_factId_key"
  ON "TradeEntryLeg"("tradeId", "factId");
CREATE INDEX "TradeEntryLeg_tradeId_occurredAt_idx"
  ON "TradeEntryLeg"("tradeId", "occurredAt");

CREATE TABLE "TradeBaselineComponent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tradeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "batchScope" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL,
  "observedQuantity" DECIMAL(38, 18) NOT NULL,
  "quantity" DECIMAL(38, 18) NOT NULL,
  "remainingQuantity" DECIMAL(38, 18) NOT NULL,
  "averageCost" DECIMAL(38, 18),
  "rawCost" DECIMAL(38, 18),
  "remainingCost" DECIMAL(38, 18),
  "rawCostEstimated" BOOLEAN NOT NULL DEFAULT false,
  "costIncludesFees" TEXT NOT NULL,
  "reconciledExecutionFactIds" JSONB NOT NULL,
  "reconciliationFactIds" JSONB NOT NULL,

  CONSTRAINT "TradeBaselineComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeBaselineComponent_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeBaselineComponent_tradeId_factId_key"
  ON "TradeBaselineComponent"("tradeId", "factId");
CREATE INDEX "TradeBaselineComponent_tradeId_occurredAt_idx"
  ON "TradeBaselineComponent"("tradeId", "occurredAt");

CREATE TABLE "TradeCorporateActionAdjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tradeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "quantity" DECIMAL(38, 18),
  "fromUnits" DECIMAL(38, 18),
  "toUnits" DECIMAL(38, 18),
  "positionQuantityBefore" DECIMAL(38, 18) NOT NULL,
  "positionQuantityAfter" DECIMAL(38, 18) NOT NULL,

  CONSTRAINT "TradeCorporateActionAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeCorporateActionAdjustment_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeCorporateActionAdjustment_tradeId_factId_key"
  ON "TradeCorporateActionAdjustment"("tradeId", "factId");
CREATE INDEX "TradeCorporateActionAdjustment_tradeId_occurredAt_idx"
  ON "TradeCorporateActionAdjustment"("tradeId", "occurredAt");

CREATE TABLE "TradeCloseSlice" (
  "id" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL,
  "quantity" DECIMAL(38, 18) NOT NULL,
  "remainingQuantityAfter" DECIMAL(38, 18) NOT NULL,
  "charges" JSONB NOT NULL,
  "grossRealizedPnl" DECIMAL(38, 18),
  "netRealizedPnl" DECIMAL(38, 18),
  "realizedNetReturnRate" DECIMAL(38, 18),
  "costEstimated" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "TradeCloseSlice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeCloseSlice_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeCloseSlice_tradeId_factId_key"
  ON "TradeCloseSlice"("tradeId", "factId");
CREATE INDEX "TradeCloseSlice_tradeId_occurredAt_idx"
  ON "TradeCloseSlice"("tradeId", "occurredAt");

CREATE TABLE "TradeCloseAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "closeSliceId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "sourceFactId" TEXT NOT NULL,
  "quantity" DECIMAL(38, 18) NOT NULL,
  "originalCost" DECIMAL(38, 18),
  "allocatedBuyCharges" JSONB NOT NULL,

  CONSTRAINT "TradeCloseAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeCloseAllocation_closeSliceId_fkey"
    FOREIGN KEY ("closeSliceId") REFERENCES "TradeCloseSlice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeCloseAllocation_closeSliceId_sourceFactId_key"
  ON "TradeCloseAllocation"("closeSliceId", "sourceFactId");
CREATE INDEX "TradeCloseAllocation_sourceFactId_idx"
  ON "TradeCloseAllocation"("sourceFactId");

CREATE TABLE "TradeDividendAttribution" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tradeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "amount" DECIMAL(38, 18) NOT NULL,
  "currency" TEXT NOT NULL,

  CONSTRAINT "TradeDividendAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeDividendAttribution_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeDividendAttribution_tradeId_factId_key"
  ON "TradeDividendAttribution"("tradeId", "factId");
CREATE INDEX "TradeDividendAttribution_tradeId_occurredAt_idx"
  ON "TradeDividendAttribution"("tradeId", "occurredAt");

CREATE TABLE "TradeEvidenceSource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tradeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "source" JSONB NOT NULL,

  CONSTRAINT "TradeEvidenceSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeEvidenceSource_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Trade"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeEvidenceSource_tradeId_kind_factId_key"
  ON "TradeEvidenceSource"("tradeId", "kind", "factId");
CREATE INDEX "TradeEvidenceSource_tradeId_eventId_idx"
  ON "TradeEvidenceSource"("tradeId", "eventId");

CREATE TABLE "CashBalance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "currency" TEXT NOT NULL,
  "settledAmount" DECIMAL(38, 18) NOT NULL,
  "pendingReceivable" DECIMAL(38, 18) NOT NULL,
  "pendingPayable" DECIMAL(38, 18) NOT NULL,
  "completeness" TEXT NOT NULL,
  "issues" JSONB NOT NULL,
  "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CashBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashBalance_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashBalance_accountId_currency_key"
  ON "CashBalance"("accountId", "currency");
CREATE INDEX "CashBalance_accountId_projectionGeneration_idx"
  ON "CashBalance"("accountId", "projectionGeneration");

CREATE TABLE "CashSettlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "eventId" TEXT NOT NULL,
  "factId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" DECIMAL(38, 18) NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "projectionGeneration" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CashSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashSettlement_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashSettlement_accountId_factId_key"
  ON "CashSettlement"("accountId", "factId");
CREATE INDEX "CashSettlement_accountId_status_settledAt_idx"
  ON "CashSettlement"("accountId", "status", "settledAt");
CREATE INDEX "CashSettlement_accountId_currency_idx"
  ON "CashSettlement"("accountId", "currency");

COMMIT;
