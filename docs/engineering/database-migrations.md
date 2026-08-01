# 数据库迁移规范

## 选型

产品事实库使用 PostgreSQL，ORM 与迁移工具使用 Prisma。金额、数量和价格使用 `Decimal`，不得使用数据库浮点类型保存资产事实。

## 流程

1. 修改 `apps/server/prisma/schema.prisma`。
2. 在开发数据库执行 `prisma migrate dev --name <change>` 生成 SQL。
3. 人工审核 SQL、锁范围、索引和数据回填方案。
4. CI 从空库执行 `prisma migrate deploy`，再执行 seed 与集成测试。
5. 生产仅执行已经进入版本控制的 `prisma migrate deploy`，禁止 `db push`。

破坏性变更采用“扩展—迁移—收缩”：先新增兼容字段，发布回填和双读版本，确认完成后再单独删除旧字段。回滚优先回退应用版本；数据库使用前向修复 migration，不自动执行不可逆 SQL。

开发 seed 位于 `apps/server/prisma/seed.ts`，必须幂等且不得包含真实账户或凭证。
