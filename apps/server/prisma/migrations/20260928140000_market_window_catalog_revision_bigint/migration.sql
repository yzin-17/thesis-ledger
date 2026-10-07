-- DSA Catalog revision 是不超过 JavaScript 安全整数上限的稳定摘要，可能超过 32 位。
-- 保留既有窗口证据及索引，仅扩大精确存储列。
ALTER TABLE "MarketBarWindowEvidenceV3"
  ALTER COLUMN "catalogRevision" TYPE BIGINT;
