BEGIN;
ALTER TABLE "FundValuationPoint" ADD COLUMN "lastValidEvidence" JSONB;
CREATE TABLE "FundDailyEstimateError" (
  "symbol" TEXT NOT NULL, "day" CHAR(10) NOT NULL, "method" TEXT NOT NULL,
  "minute" TIMESTAMP(3) NOT NULL, "estimate" JSONB NOT NULL, "evidence" JSONB NOT NULL,
  "official" JSONB, "errors" JSONB, "checkedAt" TIMESTAMP(3), "sourceAttemptAt" TIMESTAMP(3),
  "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("symbol","day","method"),
  CHECK (("official" IS NULL) = ("errors" IS NULL)),
  CHECK ("estimate"->>'symbol' = "symbol" AND "estimate"->>'method' = "method")
);
COMMIT;
