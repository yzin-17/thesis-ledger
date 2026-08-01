ALTER TABLE "RiskRule"
ADD COLUMN "condition" JSONB,
ADD COLUMN "parameters" JSONB,
ADD COLUMN "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "RiskEvent"
ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1;

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

CREATE INDEX "RiskRuleAudit_ruleId_createdAt_idx"
ON "RiskRuleAudit"("ruleId", "createdAt");
