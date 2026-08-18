# ThesisLedger 工作区与 DSA 集成迁移任务

关联规格：[ThesisLedger 工作区与 DSA 集成迁移规格](../specs/2026-08-18-thesis-ledger-workspace-migration.md)

## 执行约束

- 保留迁移前主仓库和 DSA 仓库的 Git 历史、分支和未提交改动。
- 不创建远程仓库、不提交 Git commit、不推送远程。
- 修改说明性文档时使用中文；历史证据文档不做批量品牌替换。
- 每项任务完成后记录验证命令和结果；遇到外部权限或网络阻塞时记录一次并停止重复尝试。

## 任务清单

- [x] T1 建立新工作区，迁移主仓和 DSA 为同级仓库，并核对 Git 边界。
- [x] T2 完成主仓 ThesisLedger 品牌、包 scope、应用 ID、环境变量、数据库和缓存标识迁移。
- [x] T3 完成安全的数据迁移脚本或操作说明：PostgreSQL 备份/恢复校验、Redis 缓存重建、回滚说明。
- [x] T4 在 DSA Fork 中增加 `/api/v1/thesis-ledger` Contract V1、token 认证、capabilities 和结构化错误。
- [x] T5 让 DSA Contract 正确映射 quote、日线 bars、可用 indicators 和 chip 摘要；对未支持能力显式返回，不伪造数据。
- [x] T6 为 DSA 增加 deterministic fixture mode、Contract Test、Docker/发布版本校验与上游 commit 元数据。
- [x] T7 创建独立 `thesis-ledger-infra` 仓库，提供固定镜像默认配置、`compose.dev.yml` 源码 override、幂等 bootstrap 和文档。
- [x] T8 保留并更新主仓 Stub Contract Test 栈，使主系统客户端使用新 Contract V1。
- [x] T9 执行主仓、DSA、thesis-ledger-infra 的定向验证和最终一致性 Review；运行时验证阻塞项已记录。

## 验证证据

| 任务 | 验证 | 结果 |
| --- | --- | --- |
| T1 | 三个仓库分别执行 `git status --short --branch`；父目录无 `.git`，嵌套 DSA 路径不存在 | 通过：`thesis-ledger`、`daily-stock-analysis`、`thesis-ledger-infra` 为同级独立仓库 |
| T2 | 活动代码旧品牌搜索、`pnpm install --frozen-lockfile --offline`、server/mobile typecheck、desktop build | 通过；旧入口仅保留在迁移脚本文件名和历史文档中 |
| T3 | `bash -n scripts/migrate-to-thesis-ledger.sh`；检查脚本的同库拒绝、非空目标拒绝、备份校验、计数校验和不删除旧库行为 | 通过；未连接真实数据库执行迁移演练，避免误操作用户数据 |
| T4-T6 | DSA Python `py_compile`、主仓 adapter 测试、发布 workflow/Dockerfile 静态检查 | 通过静态检查；DSA pytest/容器运行验证受本机依赖和 Docker 权限阻塞 |
| T7-T8 | 主仓和 thesis-ledger-infra `docker compose config -q`、主仓全量测试、Stub Contract Test 文件检查 | 通过；真实黑盒运行需 Docker daemon 可用 |
| T9 | `pnpm lint`、`pnpm -r test`、server typecheck/test、desktop test/build、三个仓库 `git diff --check` | 通过；桌面构建仅有既有的大 chunk warning |

## 已实现内容

- 工作区路径为 `/Users/yzin/code/thesis-ledger-workspace/`，包含三个同级目录：`thesis-ledger`、`daily-stock-analysis`、`thesis-ledger-infra`。
- 主仓已完成活动代码的 ThesisLedger 品牌迁移，统一包 scope、桌面/移动端应用 ID、数据库命名、Redis key 前缀和 DSA 配置键。
- 主仓 DSA 客户端改用 `/api/v1/thesis-ledger`、独立 Bearer Token、结构化错误和能力降级；根目录 Stub 与 DSA Contract 共用黑盒测试入口。
- DSA 已增加 Contract V1、fixture mode、日线/指标/筹码摘要映射、显式 unsupported 响应，以及镜像版本和上游 commit 元数据。
- `thesis-ledger-infra` 使用固定镜像变量作为默认路径，使用 `compose.dev.yml` 覆盖为同级源码构建；bootstrap 只在目录不存在时 clone，不覆盖现有工作树。
- 数据迁移脚本不会删除旧数据库；Redis 通过新的命名空间自然重建，回滚依靠保留旧服务和旧数据库完成。

## 遗留风险与外部阻塞

- 当前主机没有 DSA 所需的 `pytest`/`fastapi` Python 依赖，因此 DSA pytest 未运行；已完成 `py_compile` 静态验证。
- Docker daemon socket 当前返回权限错误，无法执行容器启动、真实 DSA Contract Test、镜像构建或 GHCR digest 解析；恢复 Docker Desktop 权限后再执行。
- 按执行约束未创建 GitHub remote、未发布镜像、未提交 commit、未推送分支；thesis-ledger-infra 的 GHCR digest 仍由发布流程注入。
- 未提供真实 PostgreSQL 源库和目标库，因此没有执行迁移演练；脚本默认要求显式传入两个不同数据库连接串，并拒绝非空目标。

## 最终一致性 Review

- [x] Spec 中的目标、非目标、接口和验收标准与实际实现一致。
- [x] 任务清单没有遗漏实现范围；未完成项均已说明原因和后续条件。
- [x] 主仓、DSA、thesis-ledger-infra 的路径、镜像、环境变量和 Contract 版本一致。
- [x] 没有把历史文档中的旧品牌误当作活动配置；没有遗漏活动代码中的旧入口。
- [x] 数据、回滚和外部发布风险已向用户报告。
