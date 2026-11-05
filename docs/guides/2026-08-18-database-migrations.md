# 数据库 Schema 与 current baseline 规范

## 选型

产品事实库使用 PostgreSQL，ORM 与迁移工具使用 Prisma。金额、数量和价格使用 `Decimal`，不得使用数据库浮点类型保存资产事实。

## 流程

1. 修改 `apps/server/prisma/schema.prisma`。
2. 以当前最终 schema 重新生成并人工审核 `apps/server/prisma/migrations/20260905000000_fresh_database_baseline/migration.sql`。
3. 确认 Prisma 无法表达的 `CHECK`、函数、触发器、扩展、部分索引、Schema marker 和角色权限仍在 baseline 中。
4. CI 对空 PostgreSQL 数据库执行 baseline，并运行 Prisma validate、Server 定向测试和数据库不变量演练。
5. Compose 由 PostgreSQL 官方 init 路径执行 baseline；ThesisLedger 不执行数据库初始化或 owner 连接串。

本阶段不提供旧 Schema 或旧业务数据升级链。baseline 版本变化后，已有 PostgreSQL external volume 必须由运维人员显式备份、删除并重建；应用、更新脚本和 entrypoint 均不得自动执行卷删除。

活动 migration 目录只保留一份 current baseline；旧 migration 不属于运行时输入。开发 seed 位于 `apps/server/prisma/seed.ts`，必须幂等且不得包含真实账户或凭证。
