-- 旧行情缓存已无运行时消费者；保留现有行供保数据升级校验与后续审计。
CREATE TABLE "MarketBarSeriesCoverageArchive" AS TABLE "MarketBarSeriesCoverage";
CREATE TABLE "MarketBarSeriesFactArchive" AS TABLE "MarketBarSeriesFact";

DROP TABLE "MarketBarSeriesCoverage";
DROP TABLE "MarketBarSeriesFact";
