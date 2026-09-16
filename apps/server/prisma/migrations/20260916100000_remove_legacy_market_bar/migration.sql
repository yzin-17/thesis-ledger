BEGIN;

-- 旧 MarketBar 事实不迁移；MarketBarSeriesFact/覆盖记录是新的事实存储。
DROP TABLE IF EXISTS "MarketBar";
-- 旧回填队列只服务于已删除的 MarketStorageService。
DROP TABLE IF EXISTS "BackfillJob";

COMMIT;
