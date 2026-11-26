BEGIN;
LOCK TABLE "LedgerEvent" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LedgerEvent" WHERE "envelopeVersion" IS DISTINCT FROM 3) THEN
    RAISE EXCEPTION 'ledger-event-envelope-v1 requires a verified current event envelope';
  END IF;
END;
$$;

ALTER TABLE "LedgerEvent" ADD COLUMN "nextEnvelopeVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LedgerEvent" DROP COLUMN "envelopeVersion";
ALTER TABLE "LedgerEvent" RENAME COLUMN "nextEnvelopeVersion" TO "envelopeVersion";
ALTER TABLE "LedgerEvent" ALTER COLUMN "envelopeVersion" DROP DEFAULT;
ALTER TABLE "LedgerEvent" ADD CONSTRAINT "LedgerEvent_envelopeVersion_current_chk"
  CHECK ("envelopeVersion" = 1);

UPDATE "PortfolioSnapshot" SET "payloadVersion" = 1 WHERE "payloadVersion" = 2;
ALTER TABLE "PortfolioSnapshot" ALTER COLUMN "payloadVersion" SET DEFAULT 1;

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261124143000_named_v1_ledger_envelope', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;
COMMIT;
