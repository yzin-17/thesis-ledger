ALTER TABLE "NotificationDelivery"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "responseSummary" TEXT;
