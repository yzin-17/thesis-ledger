ALTER TABLE "Strategy" ADD COLUMN "ownerId" UUID;
CREATE INDEX "Strategy_ownerId_idx" ON "Strategy" ("ownerId");
ALTER TABLE "StrategyVersion" ADD COLUMN source JSONB;

INSERT INTO "SchemaVersion" (id, version, "updatedAt")
VALUES (1, '20261006030000_strategy_authoring_save', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version, "updatedAt"=CURRENT_TIMESTAMP;
