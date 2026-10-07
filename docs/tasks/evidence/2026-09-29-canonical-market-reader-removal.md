# 旧 BarSeries Reader 与 DSA 入口拆除

> 2026-09-29。本叶完成源码、包级和 DSA 隔离离线验证；目标 Docker、真实来源及数据库结构升级尚未验收。

## 调用链与变更

| 入口 | 当前行为 | 剩余边界 |
| --- | --- | --- |
| Automation 股票与 ETF 收盘同步 | 要求显式 `end`，以当日 `none` 日线精确 RouteKey 调用 `MarketBarReader.readV3()`；不可用窗口拒绝完成 | 目标策略、真实收盘数据及任务日志未验收 |
| Automation 场外基金同步 | 读取净值历史并拒绝陈旧或回退结果，不再把基金送入旧 BarSeries Reader | 基金净值仍使用 Data V1 合同，需归入后续单一合同迁移 |
| Server 旧 BarSeries Reader | 已删除旧策略 Port、远端 Port、内存/Redis/PostgreSQL 事实缓存、旧历史模式读取；`MarketBarReader` 只分派当前精确窗口和交互图表 | Prisma 旧事实表及清理清单尚在，须新增结构变更并按数据库门禁验收 |
| DSA 旧 BarSeries GET | `/api/v2/thesis-ledger/market/bars` 已删除，旧 URL 返回 404 | `api/v2` 的纯指标计算仍是当前图表消费者；Data V1 报价/净值等仍待替换 |
| DSA 生效策略读取 | 省略版本返回 V3；显式旧版本返回 `CONTROL_CONTRACT_UNSUPPORTED` | 旧 Control Store 投影和 Data V1 内部策略消费者仍待收敛 |

旧 Reader 专属的事实缓存、旧历史验收测试及辅助源码已删除；跨市场日期展开测试移至当前窗口测试。策略 PostgreSQL E2E 的外部行情改为 V3 形状夹具，测试仍验证策略持久化与风险服务，但不再宣称覆盖真实 V3 Reader/证据仓储；真实来源链路由独立目标门禁验证。

## 验证

- Server 定向 64 项、全包 1686 项通过且 81 项跳过；`tsc --noEmit`、`pnpm build`、`node scripts/check-boundaries.mjs` 通过。边界门禁已禁止 Server 源码重新引入旧 BarSeries HTTP 与旧事实表调用。
- Schemas 定向 7 项、全包 569 项通过，类型与构建通过。收盘同步合同缺少 `end` 或请求 `1m` 时拒绝。
- DSA 定向 41 项通过；官方 `offline-tests` 使用仓库 `.venv` 完成：7602 项通过、1 项跳过、4 项未选、626 项子测试通过。首次调用使用宿主 Python，因没有 pytest 退出；已改用 `.venv` 重跑成功。
- 主仓与 DSA 的 `git diff --check` 通过。当前变更未同步目标容器，以上结果不能替代真实 Server→DSA、基金净值、风险或回测业务验收。

## 未完成

`MarketBarSeriesFact`、`MarketBarSeriesCoverage` 仍在 Prisma Schema 与清理清单中；DSA 的指标计算、基金净值、报价和其他 ThesisLedger V1/V2 路由仍可达。C01/C03/E02/E04/U02/D01/D02/D03 与关联多来源 M1/M2/M3、AC01–AC20 均不因本叶勾选。
