BEGIN;

ALTER TABLE "MarketBarWindowEvidenceV3" ADD COLUMN "completeResponse" JSONB;
ALTER TABLE "MarketBarWindowEvidenceV3" ADD COLUMN "completeResponseHash" CHAR(64);

ALTER TABLE "MarketBarWindowEvidenceV3"
ADD CONSTRAINT "MarketBarWindowEvidenceV3_response_check"
CHECK (
  ("completeResponse" IS NULL AND "completeResponseHash" IS NULL)
  OR COALESCE(
    jsonb_typeof("completeResponse") = 'object'
    AND "completeResponse"->>'contractVersion' = '3'
    AND jsonb_typeof("completeResponse"->'bars') = 'array'
    AND "completeResponseHash" ~ '^[a-f0-9]{64}$',
    FALSE
  )
);

COMMIT;
