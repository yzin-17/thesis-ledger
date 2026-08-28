BEGIN;

ALTER TABLE "LedgerEvent" DROP COLUMN "correctionOf";

COMMIT;
