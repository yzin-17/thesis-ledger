# S03 隔离 PostgreSQL 版本缓存验证

## 本轮已证明

新增 `apps/server/test/market/market-bar-cache-postgres.integration.test.ts`，使用真实 Prisma 与 `PrismaMarketBarFactStore`，覆盖以下边界：

- 同证券同日期、不同来源基准/修订保留独立事实；存在两个版本时，未指定版本的旧读取接口返回未命中，不任取最新版本。
- 同证券不同来源分别读取各自价格；数据库读取保持完整原序列，调用端 limit 裁剪不重新定基或改变原版本。
- legacy 事实回读保留原价格，身份标记为 unknown，不冒充已识别价格基准。
- 同一版本不相交窗口可保留事实，但不将中间缺口扩大为完整覆盖，跨缺口请求未命中。

## 隔离环境与结果

使用本机已有 `postgres:17-alpine`，独立 `market_cache_fixture` 数据库、随机容器名称和专用标签、仅绑定 localhost 的临时端口、临时内存数据目录。按目录排序应用全部 **19 份 migration**，没有使用 `db push` 或目标业务库。

实际执行：`rtk proxy python3 /private/tmp/goal-s03-isolated-cache-20260927.py`。脚本内部设置专用 `MARKET_CACHE_TEST_DATABASE_URL` 并运行新增测试，**4 项通过**。测试同时核对连接 host、数据库名及实际 `current_database()`。日志：`/private/tmp/goal-s03-isolated-cache-20260927.log`。

脚本退出前核对专用标签并删除本轮临时容器；随后按该标签查询无残留。没有操作目标 PostgreSQL/Redis 或其卷。

现有序列身份及 Reader 回归 **13 项通过**，覆盖单位、基准窗口、本地观测身份、固定快照/PIT、单日和跨市场边界及局部刷新 TTL。命令为 Server `vitest run test/market/market-series-identity.test.ts test/market/market-reader-review-regressions.test.ts`；日志：`/private/tmp/goal-s03-cache-regression-20260927.log`。Server 类型检查和新增测试 ESLint 通过。

## 保留的门禁

本轮只验证现有版本事实缓存的数据库边界，没有修改生产源码。V3 完整响应 JSON 往返重算在 I01 的既有失败预算已耗尽，本轮没有重试，也不以本叶替代该门禁。S03 父项与依赖它的 S04/S05 保持开放；真实 Provider、目标普通回测与 UI/AI 验收状态不变。
