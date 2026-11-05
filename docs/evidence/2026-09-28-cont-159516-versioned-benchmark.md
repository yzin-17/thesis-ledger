# 159516 日线基准交易日对齐与版本化重放

## 真实问题

旧界面 Run `72c72b2f-d53d-4a2a-ab0e-a5527538c04c` 的执行 Snapshot 完整、11 笔交易与 22 次成交均可重放，但基准计算返回 `BENCHMARK_ALIGNMENT_INCOMPLETE`。冻结的 HiThink 日线 Bar `occurredAt` 为 `2026-05-18T00:00:00+00:00` 等 UTC 午夜时点；权益曲线使用上海 16:00 估值时点。旧基准要求 Bar 与权益的 `occurredAt` 字符串完全相等，故同一交易日无法配对；成本假设不可用是基准未进入计算的后续表现。

## 实施边界

新增 `trading-date-v2` 基准对齐：同一冻结市场日历的交易日配对，仍要求 Bar 的可决策时刻不晚于权益估值时刻；同交易日重复 Bar 继续发出诊断。新基准约定和 Runner ID 分别为 `v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2` 与 `thesis-ledger-v3-local-runner-v2`。Server 与 Worker 的依赖注入只给新创建的 Run 选择 v2；原 `LocalSnapshotV3Runner` 和 `instant-v1` 计算路径保留，可对既有 Snapshot 复现原结果。已完成 Run 的持久化结果未改写。

## 定向与目标运行态证据

- 定向测试先对 UTC 午夜 Bar 与 16:00 估值重现旧版基准不可用，版本化修复后旧版仍不可用、新版基准可用且兼容；已有 PIT 晚一微秒拒绝与成本场景保持通过。Benchmark/Runner 两文件 17 项通过，Server typecheck/build、受影响 ESLint/Prettier、import 边界检查通过。
- 首次目标验证经官方 `./scripts/sync-code.sh thesis-ledger` 快更完成。随后官方 `./scripts/update.sh all` 保留数据完整更新成功，Server 镜像 `sha256:4e4df1a1e73bac5807210795ccb74d1851668134baeadc52ca08cde438d63f8e`、DSA 镜像 `sha256:2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543`；Server、Worker、DSA、PostgreSQL、Redis 均 healthy。新镜像内 Server 与 Worker 的 Runner、Benchmark JS SHA-256 分别为 `287276e7165e763d80f454774fcd9d74a9fbc8dfc6cf3562570b9552211ab550`、`9061efa6b91071833dd054d37ccbe808e1f011d3edcee2a67cbc43f94258a510`，与宿主构建一致；DSA `thesis_ledger_hithink_etf_units.py` 镜像与源码同为 `e460f929c3c207f362714cbbb6b65336e605fda23ed4c4f6ef28bbb5df162ceb`。
- 完整更新后目标数据库结构 head 仍为 `20260928140000_market_window_catalog_revision_bigint`，`MarketBarWindowEvidenceV3.catalogRevision` 为 PostgreSQL `bigint`。DSA Control HTTP 的 V3 Catalog `integrity=complete`、revision `936288043164777`，HiThink ETF qfq 精确路由 `ready`，Effective Policy revision 29 且仅 1 条路由。同镜像经真实 Data V3 HTTP 再读目标与预热范围，返回 68 条 Bar、`fund-unit/CNY`，本次采集指纹 `f2c49769b0c3bdb759bfd54f1695e827ca61ff4d5177c4ee2094e6f0a2da59ea`；这是更新后的独立读取，不改写已冻结 Run 的输入指纹。
- 同一旧 Snapshot 通过旧 Runner 重放仍为 `b3de2de34a049911`、`partial`；显式试算新 Runner 为 `complete`，原 Run 未改写。
- 目标 Web 对相同策略 v2、区间与执行模型再次预检通过，创建新 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83`，`succeeded`、attempt 1、`engineVersion=thesis-ledger-v3-local-runner-v2`。Snapshot `4a021a6297a8395f944c5e8e23808d221fc3a7e45dbae502e3afbb0e8539ee1a`，8 个 Artifact，结果校验值 `9a3601bd4fb550a1`，11 笔已平仓交易、22 次成交、59 个权益时点。
- 新 Run 真实输入指纹 `1bae50e35828e0eb10abaaf43934ba0cf9cc5eea560302604ea14c69933762ba`。业务结果 `complete`；基准总收益 `0.2218543046357615894`，超额收益 `-0.17446399919881979503`，比较 `compatible`，成本假设为显式零成本。目标 Worker 用 v2 从同一冻结 Snapshot 独立重放，再得 `9a3601bd4fb550a1`。旧 Run 用旧 Runner 再次重放仍为原校验值。
- 目标页面显示“已完成”、真实 HiThink 来源、固定供应商快照、结果完整度“完整”、基准比较协议兼容与显式零成本、重放版本 v2。[界面截图](2026-09-28-cont-159516-complete-run-ui.png)。
- 完整更新后数据库中旧 Run `72c72b2f-d53d-4a2a-ab0e-a5527538c04c` 仍为 `succeeded/partial/unverified`、校验值 `b3de2de34a049911`；新 Run `e2195b91-4cff-4dc5-9db2-0df01cf43d83` 仍为 `succeeded/complete/compatible`、校验值 `9a3601bd4fb550a1`。新镜像 Worker 再分别用旧 Runner 和 v2 Runner 只读重放各自冻结 Snapshot，校验值、`partial`/`complete`、11 笔交易和 22 笔成交均与原结果一致。目标 Web 在服务重建后重新加载新 Run 详情，显示已完成、4.74% 累计收益、CNY 104739.03 期末权益、11 笔已平仓交易、22 笔成交。
- 在同一页面切换“严格历史时点”后，缺重建证据引用时“准备并核对配置”保持禁用。直接向同环境准备 API 提交 `point-in-time` 加未核实重建引用，HTTP 201 但业务 `blocked/DATA_UNAVAILABLE`，不返回可创建的 RunConfig；取消对话框后仍停留在完整结果页。

以上基准是冻结前复权价格上的同标的买入持有比较，零成本是明确研究假设；不代表实际收费、真实份额或严格历史时点。目标 68 日仍为单窗口，完整多来源、长窗口、AI 与严格 PIT 总验收继续开放。
