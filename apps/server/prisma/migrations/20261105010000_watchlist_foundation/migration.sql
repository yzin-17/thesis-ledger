BEGIN;
CREATE TABLE "Watchlist" (
  "ownerId" UUID PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0)
);
CREATE TABLE "WatchlistGroup" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "Watchlist"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(60) NOT NULL CHECK (length(trim("name")) > 0)
);
CREATE UNIQUE INDEX "WatchlistGroup_ownerId_id_key" ON "WatchlistGroup"("ownerId", "id");
CREATE TABLE "WatchlistItem" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "Watchlist"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "instrumentId" UUID NOT NULL REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "groupId" UUID,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("ownerId","groupId") REFERENCES "WatchlistGroup"("ownerId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchlistItem_ownerId_instrumentId_key" ON "WatchlistItem"("ownerId","instrumentId");
CREATE INDEX "WatchlistItem_ownerId_groupId_pinned_order_idx" ON "WatchlistItem"("ownerId","groupId","pinned","order");
INSERT INTO "SchemaVersion" (id,version,"updatedAt")
VALUES (1,'20261105010000_watchlist_foundation',CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
