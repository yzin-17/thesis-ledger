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

CREATE INDEX "TargetAllocation_scope_accountId_active_idx"
ON "TargetAllocation"("scope", "accountId", "active");
