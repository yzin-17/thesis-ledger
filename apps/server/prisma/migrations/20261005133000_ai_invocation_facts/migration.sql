CREATE TABLE "AiInvocation" (
  "requestId" UUID PRIMARY KEY,
  "consumer" TEXT NOT NULL,
  "referenceId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "executionAttempt" INTEGER NOT NULL CHECK ("executionAttempt" > 0),
  "providerId" TEXT NOT NULL,
  "requestedModel" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AiInvocation_consumer_referenceId_executionAttempt_key"
  ON "AiInvocation" ("consumer", "referenceId", "executionAttempt");
CREATE INDEX "AiInvocation_ownerId_preparedAt_idx" ON "AiInvocation" ("ownerId", "preparedAt");
CREATE TABLE "AiInvocationFact" (
  "requestId" UUID NOT NULL REFERENCES "AiInvocation"("requestId") ON DELETE RESTRICT,
  "eventKey" UUID NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('dispatching', 'not_sent', 'unknown', 'received')),
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("requestId", "eventKey")
);
CREATE UNIQUE INDEX "AiInvocationFact_requestId_sequence_key" ON "AiInvocationFact" ("requestId", "sequence");
INSERT INTO "SchemaVersion" ("id", "version", "updatedAt")
VALUES (1, '20261005133000_ai_invocation_facts', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "version"=EXCLUDED."version", "updatedAt"=EXCLUDED."updatedAt";
