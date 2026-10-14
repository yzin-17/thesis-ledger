CREATE TABLE "IdentityUser" (
  "id" UUID PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "IdentitySession" (
  "tokenDigest" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "IdentityUser"("id") ON DELETE RESTRICT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IdentitySession_userId_expiresAt_idx" ON "IdentitySession"("userId", "expiresAt");
UPDATE "SchemaVersion" SET "version" = '20261005130000_identity_sessions' WHERE "id" = 1;
