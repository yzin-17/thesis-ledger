BEGIN;
CREATE TABLE "NotificationRoutingPreference" (
  "scope" TEXT PRIMARY KEY,
  "providers" TEXT[] NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
DROP INDEX "NotificationDelivery_dedupKey_channel_key";
CREATE UNIQUE INDEX "NotificationDelivery_dedupKey_channel_provider_key"
  ON "NotificationDelivery"("dedupKey", "channel", "provider");
COMMIT;
