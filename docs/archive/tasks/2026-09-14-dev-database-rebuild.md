# 开发数据库重建实施任务

> 任务标识：DEV-DB-REBUILD
> 对应规格：[开发数据库重建规格](../specs/2026-09-14-dev-database-rebuild.md)
> 状态：T0/T1/T2/G1/G2 全部完成，归档；改动未提交

## 任务与依赖

- [x] T0：盘点并冻结执行契约。
  - 覆盖：AC1、AC3、AC4、AC5 的实施前提。
  - 依赖：无。
  - 范围：主仓结构 SQL、权限脚本与版本消费；infra Compose/update 与适用规则。
  - 完成条件：明确开发开关、精确目标、SQL 事务边界、消费者停启和 head 计算接口，关闭实施 Blocking。
  - 验证：只读源码与运行环境盘点，形成下节契约记录；主代理完成规划预检。
- [x] T1：实现可独立验证的结构重建执行器。
  - 覆盖：AC1、AC2、AC3，AC7 的历史输入保留。
  - 依赖：T0。
  - 范围：主仓数据库执行器、完整性检查及定向测试。
  - 完成条件：输入发现、显式拒绝、执行顺序、版本与权限发布及失败停止测试通过。
  - 验证：定向脚本测试；关联 G1 验证真实 SQL 语义。
  - 阶段证据：主代理运行 `pnpm --filter @thesis-ledger/server test test/platform/database-structure.test.ts test/platform/schema-version.test.ts`，2 文件、13 项通过；仅覆盖当前输入发现、事务边界规范化、表清单、marker 与 SQL 装配，不覆盖完整授权和真实执行。
  - 最终证据：扩展后的平台与 worker 定向测试共 42 项通过，包含开发环境、数据丢失开关、错误确认及 CLI 目标冲突拒绝；typecheck、build 通过，真实执行见 G1。
  - 最终复核：PrismaService 的 `require-await` 问题已修复，主代理定向 ESLint、最终源码 build 与打包输入复核通过；G1 的数据语义证据仍有效。
- [x] T2：接入部署启动与结构就绪门禁。
  - 覆盖：AC4、AC5，AC7 的部署隔离及操作说明。
  - 依赖：T1。
  - 范围：infra Compose/update、主仓必要版本消费和迁移矩阵检查。
  - 完成条件：启动顺序、失败不启动和非重建结构拒绝的定向测试通过，维护运维说明。
  - 验证：Shell 语法、定向编排测试、相关仓库门禁与 diff 检查；不修改无关业务。
  - 证据：infra Compose 契约与编排行为测试通过；动态迁移矩阵、独立 tarball 输入与执行器检查、模块边界检查、两仓 diff 检查通过。数据库编排提取至 `scripts/dev-database.sh`，既有 `update.sh` 未增加规模。详见[验证记录](../../reviews/2026-09-14-dev-database-rebuild.md)。
- [x] G1：隔离 PostgreSQL 验收。
  - 覆盖：AC2、AC3、AC6 的数据库场景。
  - 依赖：T1；执行器就绪后尽早验证，不等现有环境部署。
  - 范围：本任务新建容器及临时数据，不使用当前 external volume。
  - 完成条件：空库、旧 baseline、重复重建、raw-owned 覆盖、应用权限及 SQL 故障行为均有实际证据。
  - 验证：复用同一 PostgreSQL 镜像与隔离环境，完成后仅清理本任务资源。
  - 证据：主代理独立执行 `python3 scripts/test-dev-database-rebuild.py`，7 个场景通过；故障注入后原测试记录仍在，错误目标 B 的记录保留，证明数据语义而非仅比较 marker/表数。见[验证记录](../../reviews/2026-09-14-dev-database-rebuild.md)。
- [x] G2：现有开发库与应用部署验收。
  - 覆盖：AC4、AC6 的目标运行态，AC7 的真实状态报告。
  - 依赖：T2、G1，以及精确目标和数据丢失开关确认。
  - 范围：确认后的当前开发库、server 与已配置 worker。
  - 完成条件：一次实际重建成功，当前 head 和缺失表恢复，NotificationDispatcher 不再因缺表退出，server/worker 健康。
  - 验证：记录目标项目/数据库、源码与镜像身份、结构检查及健康结果；禁止记录凭证。
  - 授权：2026-09-14 用户明确回复“确认”，授权重建 `thesis-ledger-dev/thesis_ledger` 的 `public` 数据并启动 Server/Worker，保留现有 volume。
  - 验证结果：镜像构建成功，实际 rebuild 仅执行一次；主代理于 `2026-09-14T06:18:12Z` 独立确认当前 head、65 张表全部存在、迁移历史表不存在、Server/Worker/PostgreSQL healthy、API 依赖全部 healthy、worker 心跳探针退出码 0，本次启动日志无缺表异常。volume 保留。

## 契约与规划预检

- 2026-09-14 盘点：7 个 migration，head 为 `20260912163000_automation_durable_occurrence`；Prisma model 58 个，raw-owned 表 7 个。现有 runtime marker 常量与 Compose 初始化输入仍停留旧版本，源码检查确认需要同步消费契约。
- 接口：`DEV_DATABASE_MODE` 默认保留数据的检查模式，显式 `rebuild` 才重建；另需 `DEV_DATABASE_ALLOW_DATA_LOSS=true` 和 `DEV_DATABASE_CONFIRM=<Compose 项目>/<数据库名>`，执行器核对目标并限制开发环境。具体命令入口由执行器负责，infra 传入经解析的目标；不输出凭证。
- 事务：规范化已知 SQL 首尾 `BEGIN/COMMIT`，拒绝无法纳入原子执行的事务控制；权限脚本使用 psql 元命令，执行通道必须支持它。结构、权限、版本、完整性校验一起提交。
- 消费面：`thesis-ledger` 与已配置的 `backtest-worker` 均须纳入停启；版本自动发现来自主仓结构输入，运行时和更新入口同时避免 marker-only 检查。
- 规划预检历史结论：Ready。AC 均已映射，T1/T2 为独立本地验收，G1 为实际 SQL 验收，G2 为现有环境门禁；无循环依赖。G2 的目标确认与执行现已完成。

## 验收映射

| 验收断言 | 实现责任 | 验证责任 |
| --- | --- | --- |
| AC1 显式拒绝 | T1、T2 | T1、T2 |
| AC2 完整结构构建 | T1 | T1、G1 |
| AC3 原子发布与重复执行 | T1 | T1、G1 |
| AC4 启动门禁 | T2 | T2、G2 |
| AC5 自动结构输入与版本 | T1、T2 | T2、G1 |
| AC6 隔离与现有环境 | T1、T2 | G1、G2，分别记录 |
| AC7 边界与状态真实性 | T1、T2 | 最终审查、G2 |

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证责任
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：本主题 T1/T2/G1/G2 全部通过；当前开发库与 Server/Worker 已恢复。
- 目标绑定与 worker 生命周期缺陷均已修复，主代理审查最终代码并独立复核失败场景通过。授权、启动失败行为及结构输入证据已补齐。
- 验证命令、输入范围、镜像身份及证据边界统一见[验证记录](../../reviews/2026-09-14-dev-database-rebuild.md)。
- 尚未通过的必要门禁：无。正式发布的保留数据升级不在本主题验收范围内。
- 保留既有工作区修改，未创建提交。
