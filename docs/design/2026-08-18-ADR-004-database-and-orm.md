# ADR-004：PostgreSQL 与 Prisma

## 背景

资金流水需要事务、精确数值、索引和可审计迁移。

## 决策

使用 PostgreSQL 与 Prisma；金额使用 Decimal；生产只执行经审核的 migration。

## 后果

开发 seed 可重复执行；破坏性变更必须采用扩展—迁移—收缩流程。

## 替代方案

SQLite 不满足目标部署并发；TypeORM 类型推导较弱，因此未选。
