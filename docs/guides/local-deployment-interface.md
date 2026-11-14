# 本地部署维护接口

本仓维护应用的宿主准备与兼容规则；实际部署使用[infra 指南](../../../thesis-ledger-infra/docs/guides/docker-update-workflow.md)。

## 命令

- `bash scripts/local-deployment.sh sync-preflight <容器ID> <工作目录>`：只读核对依赖 manifest、workspace 路径和全部 Prisma 结构输入。
- `bash scripts/local-deployment.sh sync-payload <新的绝对载荷目录>`：构建 Server 及 workspace，检查 Server/Worker 入口，装配载荷；目录已存在或构建失败时拒绝。
- `bash scripts/local-deployment.sh validate-image`：从标准输入接收工作目录、用户和 JSON 命令三行，验证 Server 镜像运行形态。

这些是正式入口使用的准备命令，不能替代更新或快更。`scripts/deployment/apply-code.sh` 只由 infra 持锁后传入目标容器执行，应用维护产物路径与替换方式；infra 维护目标选择、传输、重启、健康及失败同镜像回退。

应用需要持有部署维护锁的工具在 `scripts/deployment/maintenance.json` 登记，通过 `node ../thesis-ledger-infra/scripts/infra.mjs locked -- node <已登记脚本> @update-lock <参数>` 调用。infra 固定本地 Docker context、获取锁并传入锁路径；工具继续核对祖先锁归属。不得 source infra 内部 Shell 函数或借此运行未登记命令。

研究恢复演练使用本仓 `scripts/local-runtime/research-state-restore.mjs` 和 `research-state-archive.py` 维护隔离资源、归档保护和回执；SQLite 副本由 DSA 的 `scripts/deployment/restore-sqlite.py` 恢复并检查完整性。业务工具的祖先锁判断从 infra 的 `scripts/runtime/lock.mjs` 消费，Docker 执行固定同一本地 context。

## 权限与验证

`infra/docker/bootstrap-app-role.sql` 维护应用角色初始化及业务表保护。infra 只绑定、传入并执行该输入；业务表权限随应用升级维护。

本地确定性验证使用 `node --test scripts/deployment/*.test.mjs`、`bash scripts/local-runtime/database-role-contract.test.sh --check-only` 和 `bash scripts/local-runtime/ai-deployment-contract.test.sh`。权限脚本省略 `--check-only` 时会按原验收脚本创建两个隔离 PostgreSQL 角色失败场景，属于独立运行验收，不修改目标开发数据库。

迁移合同和当前状态见[部署接口归属规格](../../../thesis-ledger-infra/docs/specs/2026-11-11-application-deployment-interfaces.md)。

## 研究 V2 写入发布开关

Server 的 `AI_RESEARCH_V2_WRITES_ENABLED` 默认 false；只有显式设为 true 才开放新的 V2 研究提交。该开关独立于研究执行和策略开关，不传给 Worker，不影响原双版本读取。对应主仓的[研究规格](../specs/2026-10-18-research-evidence-evolution.md)与[G3 证据](../evidence/2026-10-23-research-g3.md)。

开启前核对双读/恢复基线、严格匹配的研究生成 V2 用途和明确的业务调用预算，通过 `AI_RESEARCH_V2_WRITES_ENABLED=true DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh thesis-ledger` 受控部署，并核对目标 `/api/v1/research/capabilities`。单次验收结束后，按原授权通过同一正式入口显式恢复 false；其他已有开关、来源及业务数据保持。

定向合同检查为 `bash scripts/local-runtime/ai-deployment-contract.test.sh`，只渲染 Compose，覆盖默认关闭、显式关闭、独立开启及 Worker 配置隔离。源码通过不代表目标已部署或 G3 实源已通过，实际状态由上述证据维护。

