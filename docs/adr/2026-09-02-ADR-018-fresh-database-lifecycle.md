# ADR-018：0.1 阶段采用 Fresh Database Baseline

## 状态

已接受；在 ThesisLedger `0.1.x` 尚未承载不可丢弃数据期间，取代 ADR-004 的渐进式数据升级要求。PostgreSQL、Prisma、受审核数据库变更和 owner/app role 隔离继续保留。

## 背景

当前开发栈维护多阶段历史 migration，并通过多个数据库初始化任务完成旧数据升级、角色配置和权限收紧。产品当前不要求保留旧 Schema 数据，继续维护旧数据转换路径的收益低于运行与验证复杂度。

数据库仍包含 Prisma Schema 无法完整表达的触发器和 `CHECK`，因此 fresh-only 不能只依赖 Prisma Client 模型同步。

## 决策

`0.1.x` 阶段使用一份 current baseline 作为空 PostgreSQL 数据卷的初始化输入。baseline 同时保存当前关系结构、索引、外键、数据库级不变量和 Schema 版本标记。

PostgreSQL 服务拥有初始化职责和 owner 凭证；ThesisLedger 只使用 app role。已有卷版本不匹配时阻止应用启动，任何卷删除与重建必须由运维人员显式执行，系统不自动丢弃数据。

Schema 发生破坏性变化时更新 current baseline 并提升版本；已有开发卷通过显式重建切换。进入承载不可丢弃数据或多副本滚动发布阶段前，必须新增 ADR 恢复受审核的版本化 migration 升级策略。

## 后果

正面后果：开发栈不再需要数据库初始化任务容器；空库初始化路径短且确定；owner 凭证不进入业务容器；旧数据转换逻辑不再占用活动维护面。

负面后果：现有 PostgreSQL 数据不兼容 current baseline；每次破坏性 Schema 变化都需要显式重建开发卷；baseline 生成和 Review 必须额外验证 Prisma 无法表达的数据库不变量。

## 替代方案

保留版本化 migration 与独立 migration job，适合不可丢弃数据和多副本部署，但当前阶段会继续承担无实际兼容需求的升级与运行复杂度。

在 ThesisLedger 容器 entrypoint 中以 owner 执行初始化，会把数据库管理能力和凭证带入业务容器，扩大运行时接口和安全面，因此不采用。
