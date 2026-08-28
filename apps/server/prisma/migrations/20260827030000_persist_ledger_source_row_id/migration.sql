ALTER TABLE "LedgerEvent"
  ADD COLUMN "sourceRowId" TEXT;

CREATE INDEX "LedgerEvent_accountId_sourceChannel_sourceRowId_idx"
  ON "LedgerEvent"("accountId", "sourceChannel", "sourceRowId");
