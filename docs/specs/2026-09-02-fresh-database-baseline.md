# Fresh Database Baseline Spec

## 背景与问题

ThesisLedger 当前仍处于 `0.1.0` 阶段，开发栈通过四个 Compose 一次性数据库任务依次完成角色配置、Prisma migration 与权限收紧。该设计支持保留旧数据并逐版本升级，但当前产品不要求旧数据库兼容，继续维护完整升级链会增加启动拓扑、迁移验证和本地运行噪声。

当前数据库包含 Prisma Schema 无法完整表达的 `CHECK`、函数和触发器。Fresh-only 不能退化为只执行 `prisma db push`；新的 baseline 必须完整保存当前数据库结构与数据库级不变量。

## 目标

- 以一份经过审核的 current baseline 初始化空 PostgreSQL 数据卷，不执行旧 Schema 的数据升级。
- 由 PostgreSQL 容器自身完成 Schema、数据库不变量、app role 与权限初始化，常规启动只包含 PostgreSQL、Redis、DSA 和 ThesisLedger 四个长期服务。
- 保留 owner/app role 权限隔离；ThesisLedger 继续以非 root 用户运行，且只接收 app role 连接串。
- 使用稳定的数据库 Schema 版本标记阻止代码连接不兼容数据库。
- 保留 `LedgerEvent`、已提交 Import Revision 与 Baseline Batch 的数据库级不可变性。

## 非目标

- 不提供任意旧 Schema 或旧业务数据到 current baseline 的升级路径。
- 不自动删除、重建或重置现有 PostgreSQL 数据卷。
- 不改变 Redis 与 DSA SQLite 数据卷生命周期。
- 不拆分现有 NestJS Web、Scheduler 与 Worker 运行进程。
- 不在本任务中重新设计业务模型、API Contract 或客户端行为。

## 现状与约束

- PostgreSQL 与 Prisma 继续作为数据库和对象关系映射方案。
- `schema.prisma` 描述 Prisma 模型，但数据库级 `CHECK`、函数、触发器和权限必须由 baseline SQL 明确保存。
- `thesis-ledger-infra` 是 Compose、卷和启动兼容门禁的唯一编排入口。
- PostgreSQL 数据卷是 external volume；任何删除必须是用户明确触发的独立运维动作。
- 当前主仓存在与本任务无关的 Desktop 未提交修改，实施不得覆盖或清理。

## 设计方案

### Fresh-only 生命周期

空 PostgreSQL 数据卷首次启动时，官方 entrypoint 按固定顺序执行：

1. current baseline SQL 创建当前表、索引、外键、`CHECK`、函数和触发器；
2. 数据库访问初始化脚本创建或更新 app role，并授予当前业务表权限；
3. 权限收紧撤销 app role 对 `LedgerEvent` 的 `UPDATE` 与 `DELETE`；
4. baseline 写入唯一 Schema 版本标记。

已有数据卷不会重新执行初始化文件。PostgreSQL 健康检查必须同时验证连接与 Schema 版本；版本缺失或不匹配时保持非健康状态，ThesisLedger 不得启动。

### 权限 seam

PostgreSQL 容器拥有 owner 凭证和初始化职责。ThesisLedger 容器只获得 app role 的 `DATABASE_URL`，不安装数据库初始化能力，不接收 owner 连接串，并继续以 `thesis` 用户运行。

### Schema 版本 seam

baseline 在数据库中保存一个稳定版本。后端启动时使用 app role 读取并验证该版本，健康响应复用同一代码常量，不再手工维护与实际数据库脱节的字符串。

### 后续 Schema 变化

在 fresh-only 阶段，破坏性 Schema 变化通过更新 current baseline 与版本完成。已有数据卷会因版本不匹配而阻止启动，运维人员必须显式确认后重建 PostgreSQL 卷。系统不得在更新脚本或容器 entrypoint 中自动执行删除。

## 对外行为或接口变化

- `/api/v1/health` 的 `schemaVersion` 返回 current baseline 的真实版本。
- Schema 版本不匹配时，PostgreSQL 不通过 Compose 健康检查，ThesisLedger 不启动。
- 常规 Compose 状态只包含四个长期服务，不出现数据库初始化任务服务。

## 数据、状态或兼容性影响

- 当前 PostgreSQL 卷中的业务数据不提供迁移兼容；首次切换需要显式删除并重建该卷。
- Redis 与 DSA SQLite 卷保持不变。
- 活动 migration 历史收敛为 current baseline；旧迁移仍可从 Git 历史追溯，但不再属于运行时升级路径。

## 测试策略

### 关键可观察行为

- 空卷能直接得到 current Schema、版本标记与数据库级不变量。
- app role 能执行正常业务 `SELECT/INSERT`，不能 `UPDATE/DELETE LedgerEvent`。
- 不兼容卷不会被自动修改或删除，应用不会连接错误 Schema。
- 启动完成后只有四个长期服务且全部健康。

### 优先测试层级

1. baseline SQL fresh database 演练与数据库不变量断言；
2. Compose 配置、健康依赖和角色隔离断言；
3. Server Schema 版本守卫、健康响应与 shutdown hook 定向测试；
4. 实际 external PostgreSQL 卷重建后的开发栈健康验证。

### 可复用的现有测试入口

- Prisma Schema validation；
- Server platform tests；
- infra 角色与更新脚本测试；
- Compose `config`、`ps` 与健康接口。

### 需要新增的测试入口

- current baseline 的空库应用与关键触发器、`CHECK`、版本标记断言；
- Schema 版本匹配与不匹配的纯函数或 Server 单元测试；
- Compose 中不存在数据库初始化任务服务的静态断言。

### 关键边界与回归场景

- baseline 必须包含 `LedgerEvent_append_only`、`ImportDraftRevision_frozen` 和 `BaselineObservationBatch_submitted`。
- 版本标记缺失、重复或不匹配均必须 fail-fast。
- owner 与 app role 为空或同名时初始化失败。
- 应用容器不得出现 owner 连接串。

## 风险与备选方案

- 风险：从 `schema.prisma` 直接生成 SQL 会遗漏数据库不变量。baseline 必须通过当前最终 Schema 与显式 invariant 检查验证。
- 风险：fresh-only 不适用于已经承载不可丢弃数据的环境；进入持久化发布阶段前必须新增 ADR 恢复版本化 migration 策略。
- 备选：保留独立 migration job 可支持滚动升级和多副本部署，但不符合当前 fresh-only 与零附加启动容器目标。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：空 PostgreSQL 数据卷能由 PostgreSQL 服务自身安装 current baseline、数据库不变量和 app role，且无需任何数据库初始化任务容器。
- AC2：已有卷缺失或不匹配 current Schema 版本时不会被自动删除或修改，PostgreSQL 不健康且 ThesisLedger 不启动。
- AC3：ThesisLedger 继续以非 root 用户和 app role 运行，不接收 owner 连接串；app role 对 `LedgerEvent` 只有所需的读取与追加权限。
- AC4：Fresh database 中存在三项不可变触发器和 current baseline 定义的关键 `CHECK`，对应越权修改被 PostgreSQL 拒绝。
- AC5：Server 启动守卫与 `/api/v1/health.schemaVersion` 读取同一 baseline 版本，当前数据库版本与健康响应一致。
- AC6：开发栈完成启动后只有 PostgreSQL、Redis、DSA 和 ThesisLedger 四个长期服务，且均通过健康检查。
- AC7：NestJS 启用 shutdown hooks，现有 Prisma 与 Redis 销毁流程能够在容器终止信号下执行。
- AC8：Spec、Task、ADR、运行文档、Compose 说明与实际 fresh-only 行为一致，并记录确定性检查和真实容器验证边界。
