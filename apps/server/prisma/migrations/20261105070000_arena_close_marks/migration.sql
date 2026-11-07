BEGIN;
ALTER TABLE "ArenaRound" ADD COLUMN "corporateActionCoverage" JSONB;
ALTER TABLE "ArenaResearchPacket" ADD COLUMN "closeMarks" JSONB;
INSERT INTO "SchemaVersion" (id,version,"updatedAt") VALUES (1,'20261105070000_arena_close_marks',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
