# 目标环境旧策略状态显式转换

## 阻断与范围

2026-09-30，当前 V3 Run 准备请求返回 `blocked/DATA_UNAVAILABLE`，原因是目标 Server 的 `DesiredProviderPolicy.routes` 仍为 `storageVersion=3` 但包含 `routesV3`、`legacyV2Routes` 的旧双字段格式。`GET /api/market-data/policy` 返回 409。目标 DSA SQLite 的当前策略为 revision 30，`routes_json` 仍是旧对象，生效投影的合同版本为 2；鉴权 V3 Effective 读取返回 500。现行 Server 与 DSA 均按设计拒绝隐式解释这些旧行。

## 显式修复

- 主仓新增 `20260930100000_rebase_legacy_market_policy` 迁移：先把升级前的当前策略及修订历史复制到只读归档，再仅在检测到精确旧双字段格式时，将 `routesV3` 作为新修订的现行 `routes`，清空旧生效投影并将状态设为 `rejected/policy_requires_reapply`。未知格式直接失败。新修订仍须经过目录和准入门禁，迁移不会自行宣称生效。
- DSA 新增 `scripts/rebase_legacy_thesis_ledger_policy.py` 显式开发修复入口，要求绝对数据库路径、消费者和当前 revision 的完整确认，并先制作 SQLite 全库备份。它只退役一条旧当前策略行；历史、RouteAdmission 和 Provider 配置保留。目标确认值为 `/app/data/stock_analysis.db:thesis-ledger:30`，备份留在 DSA 持久卷 `/app/data/policy-rebase-backups/stock_analysis-before-v3-20260930.db`。
- 目标 DSA 执行后，V3 Effective HTTP 200，`projection=null`；策略历史仍为 27 行、RouteAdmission 3 行、Provider 配置 5 行。此状态只说明旧阻断已移除，尚未重新 Apply 路由。

## 验证与后续门禁

- DSA 修复脚本定向测试 2 项、`py_compile` 和 `flake8` 通过；错误 revision 在备份之前拒绝。
- 首次官方更新在隔离演练的“旧数据保留校验”阶段停止：原见证要求当前 Policy 与修订表逐行相同，而本迁移有意改变当前行并新增修订。Server/Worker 保持停止；随后加入两张只读归档，并让见证以升级前表名核对归档内容。隔离 PostgreSQL 升级 6/6、结构/计划定向 23/23、Server typecheck/build、migration matrix 均通过；矩阵为 24 migration、70 表、59 Prisma model、11 raw-owned 表。
- 第二次官方 `update.sh thesis-ledger` 完成。目标结构 head 为 `20260930100000_rebase_legacy_market_policy`，升级前当前策略与修订归档分别为 1 行、3 行，现行策略 revision 30、`rejected`、一条 ETF qfq 路由、生效投影为空；`GET /api/market-data/policy` 返回 200 且 `effectiveStale=true`。Server/Worker 健康。此阶段尚未 Apply，不能将路由标为可执行。
- 主仓更新还重建了 DSA 容器：先前可写层中的 `api/app.py` 旧 URL 补丁消失，进程中的 HiThink Key 为空。随后官方 `update.sh dsa` 首次构建遇到空间不足并按脚本自动清理后重试；第二次在 `pip install -r requirements.txt` 解析 `sqlalchemy>=2.0.0` 时报告无可用版本。脚本明确不再重试，官方 DSA 更新未完成。构建期间 PostgreSQL 短暂进入 recovery mode，Server 的 Automation Scheduler 查询报错而退出；Worker、DSA、PostgreSQL 和 Redis 仍健康。随后通过官方 `update.sh thesis-ledger` 恢复服务，结果见下节。

## 恢复、重新 Apply 与当前 Run 结果

- 以携带 HiThink Key 的宿主进程环境执行官方 `update.sh thesis-ledger` 后，Server、Worker、DSA、PostgreSQL、Redis 均健康。Server/Worker 共用镜像 `sha256:efb18594c2d058bea70b238f373e8d1a408373034d50ccc3a63d4f2e4b987b9b`；DSA 容器使用本次构建中已导出的镜像 `sha256:30e16995c8ed9b9358308095d7f4d1779884c48a461067790ba77cb13e067215`，`api/app.py` 与宿主 SHA-256 一致且无该文件的可写层差异，Key 在进程中非空。由于 `update.sh dsa` 最终退出 1，不能把镜像存在及后续服务健康记作 DSA 官方完整更新通过。
- 目标 DSA V3 Effective 读取 HTTP 200、旧 V1 ThesisLedger POST 404，精确 HiThink ETF qfq Catalog 条目 `ready`。经 Server `PUT /api/market-data/policy` 显式提交 revision 31，响应 `applied`、`effectiveStale=false`、DSA revision 31；同修订 Effective 的该目标 `eligible=true`。旧双字段策略未被隐式恢复。
- `159516.SZ`、原区间、固定供应商快照的当前 V3 Run 准备返回 `prepared` 且执行预检 `ready`；随后正式创建 Run `94ac657c-2283-412a-9b26-dd48b736ec6f`，立即收敛为 `failed/DATA_UNAVAILABLE`、attempt 0、无 Snapshot。DSA 日志说明 `historicalTradability` 固定请求 `adjustment=none` 的 Gateway BarSeries，而当前 Policy 只授权 ETF `qfq`，因此“当前 Control 未配置对应能力路由”。对同一 Run 的一次显式 retry 返回 HTTP 409“Snapshot V3 依赖闭包不完整”，状态未变。按重试一次后记录跳过的约定，不扩张 raw RouteAdmission，不伪造历史可交易性或创建替代 Run。
- 下一叶需先明确 Instrument Facts 的历史可交易性事实与执行价格口径的独立合同，并为实际查询路线取得来源/窗口/时间准入；通过后再创建新的当前 Run，独立验收 Snapshot、Worker 终态、结果、交易和重放。当前 C02/E01/D02 与关联 G-Deploy 父项继续开放。
- 主仓目标官方 `update.sh thesis-ledger`、目录重审、真实 Run 准备与 Worker 终态另行记录；本文件中的局部验证不代表部署或业务验收。
