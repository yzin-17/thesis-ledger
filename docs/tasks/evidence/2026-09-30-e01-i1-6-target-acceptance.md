# E01-I1.6 目标部署与业务验收

日期：2026-09-30。当前状态：用户完成更新后恢复验收，I1.6 所属目标门禁通过。

## 环境与部署入口

本轮开始时，目标 `thesis-ledger-dev` 的 Server、Worker、DSA、PostgreSQL、Redis 均为停止状态，因此选择官方 `thesis-ledger-infra/scripts/update.sh all` 完整更新。使用默认数据库检查模式，保留现有数据库与全部业务卷。HiThink Key 只在更新进程环境中传入，未写入日志或说明文档。

首次沙箱执行因 Docker Buildx 状态目录写入受限退出；经授权执行官方入口后，DSA Python 包下载发生 `SSLEOFError`，脚本内重试也失败。随后使用相同 Python 3.11 基础镜像核对相同 SQLAlchemy 包的下载，成功后再次执行官方入口。

本次构建首次已到镜像导出阶段，但层解压发生空间不足；官方脚本按既有策略清理 BuildKit 缓存后自动重试。缓存清理使固定 Longbridge SDK 需要重新编译，更新窗口延长。没有手工替换应用容器、放宽准入或删除业务卷。

随后 DSA 镜像完成，但 Server 构建在安装 `electron-winstaller` 时出现 `ERR_PNPM_ENOSPC`。核查发现 infra 临时 Dockerfile 引入全部 workspace manifest，并执行全 workspace 安装，导致 Desktop/Mobile 的 Electron、Hermes 等依赖进入 Server 构建。

已修改主仓 Server Dockerfile 与 infra 精确变换映射，安装范围限定为 `thesis-ledger` 根构建工具及 `@thesis-ledger/server...` 递归依赖，保留冻结 lockfile、必要 manifest、源码补丁和正式运行时打包。`update-server-dockerfile.test.sh`、DSA Dockerfile 合同测试及 `bash -n update.sh` 通过；主仓依赖闭包查询仅包含 Server、Domain、Shared、Schemas。未修改依赖版本或 lockfile。

进一步读取容器文件系统容量，Docker 虚拟磁盘仅 32GB，满时可用空间为 0；官方缓存清理与重试后仍只剩约 3GB。已请求用户将 Docker Disk usage limit 扩大到至少 64GB。用户回复“我来处理，你先暂停”后，停止本轮更新及构建子进程，同时关闭本轮客户端验收服务和临时页面。修改与检查点保留；静态构建修复没有记作目标镜像或业务验收通过。

上述为暂停前的检查点。用户随后确认“已经更新了”，本轮检查发现目标应用已更换镜像并恢复健康，直接验收现有更新结果，没有重复构建或手工替换容器。本轮没有取得用户更新进程的退出日志，因此不补写脚本退出码；以下结论依据实际目标镜像、源码、数据库与业务执行。

## 部署与数据库

- [x] 更新后的 Server、Worker、DSA、PostgreSQL、Redis 均健康。Server/Worker 使用相同镜像 `sha256:5106eaea916719ae178d28aad94afa89aec3e88ec21d97a39336d93e8b2dd145`；DSA 镜像 `sha256:d931c86f282c6279b9e2a8bc5886546d7cbb0cf6ea3c20dcf36f4da6d3f7e158`。
- [x] 通过 `docker exec ... cat` 读取目标文件并与宿主文件 SHA-256 比较：Server 的 `backtest-snapshot-v3-tradability.js`、Server/Worker 的 `backtest-v3-runner.js`，DSA 的 `api/thesis_ledger.py`、`thesis_ledger_v2_tradability.py`、`thesis_ledger_market_daily_tradability.py`、`thesis_ledger_v2_dependencies.py` 全部一致。
- [x] 目标 Prisma 读取确认结构 head 为 `20260930100000_rebase_legacy_market_policy`，与运行包按目录派生的 24 项 migration head 相同；59 个 Prisma model、11 个 raw-owned 表均存在，应用角色的 SELECT/INSERT/UPDATE/DELETE 权限无缺项。运行日志未发现缺表错误。现有 36 条 Run 保留，本轮新增 1 条验收 Run。
- [x] 当前 Policy HTTP 200，revision=31，`effectiveStale=false`。Docker 文件系统仍显示 32GB，可用约 20GB；本轮未验证上限扩大，容量已足够现有运行态验收。

## 真实来源、Worker 与冻结重放

通过 `/tmp/i16-realrun.mjs` 调用目标 Server 的现行 HTTP，复用既有失败 Run 的策略、日期、初始资金和显式执行模型，仅为本次采集设置新的 `dataAsOf`。没有重试或覆盖原失败 Run。

| 项目 | 实际结果 |
| --- | --- |
| 精确来源 | `159516.SZ`，CN/ETF/DAILY_BAR/1d/qfq，`hithink/fund-market-historical`，routeIndex=0，Policy revision=31 |
| 采集范围 | 2026-04-30 至 2026-08-09，沿用既有精确准入 |
| 执行区间 | 2026-05-16 至 2026-08-09 |
| 准备 | `prepared`，executionPreflight=`ready` |
| 新 Run | `4a8694de-f8b4-4d47-b0db-5ec16b29666e`，创建后 `queued`，独立 Worker 终态 `succeeded`，attempt=1 |
| Snapshot | `314c84a093e80765a1362e8e06d68f1d55e661ac9380071ea23f4531bdd77c55`，finalized/complete |
| 结果 | 22 笔成交，11 笔已平仓交易，59 个日历估值点，0 笔拒单 |
| 权益 | 首日 2026-05-18 CNY 100000；末日 2026-08-07 CNY 104739.030543694179…；区间收益约 4.7390% |
| 结果校验值 | `733135b633176f64` |

目标证券事实 Parquet 保留 `historicalTradabilityWindows`，本次 68 个日级状态均为 `observed-traded`。这个真实窗口没有缺 Bar；缺日行为由 I1.1 的真实停牌来源探针及 I1.5 的稀疏输入/生产 Worker 集成证明，本次不宣称执行了真实缺日成交场景。沿用固定供应商快照、归一化数量与零费用研究基线，不构成严格历史 PIT 或真实费用验收。

- [x] 在目标 Server 容器通过生产 `LocalSnapshotV3RunnerV2` 和 `LocalSnapshotStore` 重放同一 Run，读取其数据库 Snapshot 引用和完整产物清单；`globalThis.fetch` 改为抛错，禁止重放脚本在线取数。结果校验值、22 笔成交及 59 个估值点与已存结果一致。

## 缺路由与准入撤销负例

使用 `/tmp/i16-negative.py` 在目标 DSA 调用实际 `execute_market_window_v3` 及带现有 Bearer Token 的 HTTP。Token 不输出。

- [x] 请求未配置的 ETF `adjustment=none` 精确路由：生产路由层 `NO_ELIGIBLE_PROVIDER`，HTTP 503/`upstream_failure`，没有 Bar 数据。
- [x] 通过正式 `revoke_route_admission_v3` 撤销唯一已准入的 `hithink/fund-market-historical` qfq 行，同一请求在路由层与 HTTP 均拒绝。
- [x] `finally` 核对本次版本增量和专属撤销原因后恢复原四个状态字段；完整准入行摘要与操作前一致。未改变准入范围、凭证或 Policy。
- [x] 恢复后同一成功 Run 仍为 `succeeded`，再次冻结重放校验值仍为 `733135b633176f64`。

首次验收脚本预期 HTTP 422/准入码，实际取得 503 后停止，尚未执行撤销。核对当前共享 `market-data-wire-v3` 错误枚举与 DSA HTTP 映射后，确认现行协议将路由不可用包装成 `upstream_failure`；修正验收脚本，增加生产路由层明确拒绝断言，没有改产品错误合同或把网络失败当成准入拒绝。

## 实际客户端界面

- [x] 使用 Browser skill 打开宿主当前 Desktop Web 客户端 `http://localhost:5173/strategy`，通过策略列表中的成功任务链接进入同一 Run。
- [x] 结果概览显示已完成、收益 4.74%、期末资产 ¥104739.03、11 笔已平仓交易、22 笔成交与 59 个权益时点。
- [x] 打开“交易与订单”，核对真实成交日期、标的、方向、数量和价格；打开权益明细分页，核对 2026-05-18 16:00 首日及 2026-08-07 16:00 末日，时区 Asia/Shanghai。
- [x] 诊断页的运行 ID 与当前页面链接指向同一 Run。该验证覆盖真实浏览器客户端/API 消费，未测试 Electron 专属能力；I1 没有修改原生桥接功能。

## 一致性复核

I1.1–I1.5 的既有本地与隔离证据继续适用，本轮只补目标运行态和业务门禁。I1.6 及 E01-I1 可勾选；E01、C02、D02 和多来源回测 M1/M2/M3 的其他断言仍由原任务独立验收。本轮没有修改产品源码、扩大来源授权、清理数据库或提交 Git。
