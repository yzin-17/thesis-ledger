-- 策略创建必须显式声明合同版本；保留所有已有版本与 JSON，不转换历史数据。
ALTER TABLE "Strategy" ALTER COLUMN "schemaVersion" DROP DEFAULT;
ALTER TABLE "StrategyVersion" ALTER COLUMN "schemaVersion" DROP DEFAULT;
