-- NotificationDelivery.eventId historically used PostgreSQL text while RiskEvent.id is UUID.
-- Refuse a destructive conversion if legacy values are not UUID-shaped; operators can repair
-- those rows explicitly instead of silently deleting notification history.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "NotificationDelivery"
    WHERE "eventId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'NotificationDelivery.eventId contains non-UUID legacy values; repair them before applying logical FK migration';
  END IF;
END
$migration$;

ALTER TABLE "NotificationDelivery"
  ALTER COLUMN "eventId" TYPE UUID USING "eventId"::uuid;

CREATE INDEX "RiskRule_accountId_idx" ON "RiskRule"("accountId");
CREATE INDEX "NotificationDelivery_eventId_idx" ON "NotificationDelivery"("eventId");
CREATE INDEX "JournalEntry_ledgerEventId_idx" ON "JournalEntry"("ledgerEventId");
CREATE INDEX "JournalEntry_riskEventId_idx" ON "JournalEntry"("riskEventId");
CREATE INDEX "JournalEntry_strategyVersionId_idx" ON "JournalEntry"("strategyVersionId");

-- NOT VALID preserves legacy history if an old row is orphaned while still enforcing the
-- constraint for every new or updated row. A later maintenance migration may VALIDATE these
-- constraints after operators reconcile any historical orphans.
ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "RiskEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_ledgerEventId_fkey"
  FOREIGN KEY ("ledgerEventId") REFERENCES "LedgerEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_riskEventId_fkey"
  FOREIGN KEY ("riskEventId") REFERENCES "RiskEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_strategyVersionId_fkey"
  FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "TradePlan"
  ADD CONSTRAINT "TradePlan_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "RiskRule"
  ADD CONSTRAINT "RiskRule_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "ImportDraft"
  ADD CONSTRAINT "ImportDraft_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
