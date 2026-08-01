ALTER TABLE "AiRun"
  ADD COLUMN "context" JSONB,
  ADD COLUMN "modelMetadata" JSONB,
  ADD COLUMN "durationMs" INTEGER;

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
  CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiToolCall_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AiToolCall_aiRunId_createdAt_idx" ON "AiToolCall"("aiRunId", "createdAt");
CREATE INDEX "AiToolCall_tool_status_createdAt_idx" ON "AiToolCall"("tool", "status", "createdAt");

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

CREATE INDEX "AiDecisionLog_symbol_createdAt_idx" ON "AiDecisionLog"("symbol", "createdAt");
CREATE INDEX "AiDecisionLog_accountId_createdAt_idx" ON "AiDecisionLog"("accountId", "createdAt");
