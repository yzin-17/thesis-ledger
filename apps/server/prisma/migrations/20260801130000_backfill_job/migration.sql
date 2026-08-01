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
CREATE INDEX "BackfillJob_symbol_timeframe_status_idx" ON "BackfillJob"("symbol", "timeframe", "status");
