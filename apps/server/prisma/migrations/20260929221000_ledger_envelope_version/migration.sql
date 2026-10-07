ALTER TABLE "LedgerEvent"
ADD COLUMN "envelopeVersion" INTEGER;

ALTER TABLE "LedgerEvent"
ADD CONSTRAINT "LedgerEvent_envelopeVersion_current_chk"
CHECK ("envelopeVersion" IS NULL OR "envelopeVersion" = 3);
