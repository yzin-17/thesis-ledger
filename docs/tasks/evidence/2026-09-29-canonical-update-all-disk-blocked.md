# 官方目标更新的磁盘阻塞

## 执行边界

2026-09-29 为同步三仓当前代码、运行时依赖与数据库结构，从相邻 infra 执行官方 `./scripts/update.sh all`，使用保留数据升级模式和精确目标确认；关闭构建失败时的自动缓存清理。首次在受限沙箱中被 Buildx activity 路径权限阻断；同一命令经允许的提权重试后进入镜像构建。完整构建日志位于 `/private/tmp/thesis-ledger-update-all-2026-09-29-escalated.log`，不含凭据值。

DSA 镜像完成构建并命名为 `daily-stock-analysis:thesisledger-dev`；随后主仓镜像在 pnpm 依赖层继续写盘，宿主可用空间从约 11 GiB 降至 262 MiB，并出现 `No space left on device`。为避免继续耗尽宿主磁盘，主动向仍存活的官方脚本会话发送中断；脚本最终返回 130，报告应用镜像构建失败且不再重试。Docker Desktop 随后无法启动，BuildKit cache 维护命令也失败。没有执行数据库准备或服务启动；既有 Server、Worker、DSA、PostgreSQL 和 Redis 容器仍为退出状态。DSA 镜像构建成功不能证明本次三仓运行态更新成功。

## 宿主恢复与后续门禁

只执行 `pnpm store prune` 清理可再生成、未引用的包缓存；命令报告清理 17,704 个文件、218 MB。之后观察到宿主可用空间约 6.1 GiB，Docker Desktop 同期释放的空间无法与 pnpm 清理量精确拆分。未删除 Docker volume、镜像、数据库或用户工作树，未手工改动 Docker 内部文件。

目标 D01/D02/D03 与多来源 Task 的 G-Deploy 保持未通过。恢复目标验证前须先确认 Docker daemon 可用、构建空间充足，再按官方入口完成完整更新、保留数据升级、结构 head/权限及全部服务健康检查；本次失败和此前已通过的隔离数据库测试均不能替代这些门禁。

空间恢复后 `docker system df` 与 `docker version` 的 daemon 查询未返回；`docker desktop start` 报告应用已经运行，但 `docker desktop status` 无法取得状态。经提权执行官方 `docker desktop restart`，它在等待残留 Helper/Backend/Build 进程退出时超过期限，返回 `Failed to stop Docker Desktop` 与 `context deadline exceeded`。当前 Docker daemon 仍不可用；未强制结束这些进程，后续宿主级恢复需单独确认对其他 Docker 工作负载的影响。
