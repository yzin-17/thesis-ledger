BEGIN;
ALTER TABLE "ArenaRound" ADD COLUMN "openingFacts" JSONB;
INSERT INTO "SchemaVersion" (id,version,"updatedAt") VALUES (1,'20261105060000_arena_opening_evidence',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
