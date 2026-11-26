# 深市 ETF 当前状态接入验收

日期：2026-11-23。归属：[T06.2a0-SZ](../tasks/2026-11-12-autonomous-model-arena.md)。本记录补充[前序采样政策本地整改](2026-11-23-arena-sampled-policy-local.md)，不改写其当时仅接入上交所 ETF 的事实。

## 原因与实现

原通用日级状态合同仅接受股票，既有 ETF 停复牌解析只覆盖上交所。本轮前序新增 `current_trading` 时，把非 `.SH` ETF 直接返回 `unknown`，没有向深市状态来源发起读取；该结果不能用于判断所有 Provider 的能力。

现保留同花顺 `fund-market-snapshot` 报价，以已启用富途的 `get_market_snapshot(['SZ.159915'])` 补充当前停牌状态。仅消费快照中的 `suspension` 和 `sec_status`，不申请完整费率、结算制度或静态股数，不用成交量、价格变化或申赎暂停推断可交易性。富途官方[快照合同](https://openapi.futunn.com/futu-api-doc/quote/get-market-snapshot.html)定义了这两个状态字段，并明确 `update_time` 是价格更新时间。

- [SDK 状态读取](../../../daily-stock-analysis/data_provider/futu_trading_state.py)：规范代码与响应代码对应；明确停牌返回 `suspended`，明确未停牌且证券状态正常返回 `normal`，字段未知、无效／未来时刻、来源失败保留未知。价格较久没有更新本身不撤销 Provider 明示的当前状态；原始价格时刻随证据保留，实际成交另受报价时效和当前会话检查。
- [状态来源接入](../../../daily-stock-analysis/src/services/thesis_ledger_sz_etf_trading.py)：复用已配置富途账号和原四点五秒隔离进程，只有来源已启用才调用；读取期间配置版本变化拒绝结果。超时不重试，来源关闭和缺凭据保留具体原因。
- [Data API](../../../daily-stock-analysis/api/thesis_ledger_current_trading.py)：复用 Data Token、CN ETF 报价总开关及资产功能开关，新增深市分支实际调用状态读取器。股票／基金代码错配先拒绝；总策略变化继续拒绝发布。

没有修改报价路由、启用来源或办理新准入。HK／US 报价执行观察合同及原上交所状态路径保持。

## 实际来源读取

北京时间 22:00:50，经现有 OpenD 只读获取一次 `159915.SZ` 快照，返回：

| 字段 | 实际值 |
| --- | --- |
| 证券 | `SZ.159915`，创业板ETF易方达 |
| 停牌标志 | `False` |
| 证券状态 | `NORMAL` |
| 来源价格时刻 | `2026-11-23 15:00:00` |
| 每手／价格 | `100`／`2.295` |

该次结果可以映射为 `normal`，证明实际账号能够取得深市 ETF 状态；不认证收市时点之外的盘中成交资格。来源控制表在读取前后摘要相同，数据库连接强制 `mode=ro` 与 `PRAGMA query_only=ON`。没有读取或修改真实比赛、账户、模型请求；模型、资格探针、比赛操作、来源／路由变更、同步、重启、提交和推送均为零。

[实际字段与摘要记录](2026-11-23-arena-sz-etf-state.json)保留来源时刻、字段文本和控制未变结果。私有原观察保存于 `.recovery-artifacts/arena-sz-etf-current-20261123/source-observed.json`；它是读取字段文本，不宣称为 SDK 原始网络报文。

## 来源核对与失败保留

已保存的同花顺官方完整文档、当前适配器和本轮核对的[基金快照文档](https://fuyao.aicubes.cn/docs/api-reference/fund-market/)均未列出交易状态字段；本轮没有为重复取价格调用该收费接口，也没有据此认定同花顺全部产品不支持状态。

曾只读检查深交所公开候选端点：候选快照地址返回 HTTP 404，候选报表地址虽为 HTTP 200，但封套明确报错且目录身份为空，均未当成有效空列表。另有公开导航页面检查未取得可用目录。没有用这些失败认证 Provider 普遍不可用，也没有自动重试。相关原文及元数据保留在 `/var/folders/v1/gvgmk4cx1mz59vj63jj8_9m80000gn/T/arena-sz-etf-status-20261123-2tnouh4e/`。首次宿主 Python 缺少 `requests`，尚未发出请求；改用仓库虚拟环境后执行实际读取。

## 隔离消费与检查

[跨语言输入](../../apps/server/test/market/fixtures/current-execution-offline.py)以受控 SDK 运行原 worker 分发、来源开关、实际 Data HTTP，并从实际身份 API 取得 `159915.SZ` 的 CNY／100 股／0.001 价位事实；不手工补造完整执行制度。子进程审计禁止外部网络及 SQLite，实际拒绝尝试列表为空。

[Server 业务检查](../../apps/server/test/market/sz-etf-offline-business.ts)消费上述 HTTP 响应，经过真实 `MarketLiveExecutionReader`、`LiveExecutionContext`、`arenaSubmitDecision` 和 `arenaMatchOrders`：提交时不倒填，后续受控报价以 2.295 成交 100 股，按零配置费扣款后现金 9770.5，份额 11-24 可卖；重复处理不重复扣款。停牌和未知状态均正确拒绝。报价仍来自同花顺，没有调用每日限价或公共费用。

盘中时刻属于明确标记的受控变体；真实收市观察的 15:00 时钟没有被改成盘中原始证据。原模型样本及其他市场、账户政策、事务和历史追平证据复用前序结果。

| 执行目录 | 实际命令及范围 | 结果 |
| --- | --- | --- |
| `daily-stock-analysis` | `rtk proxy .venv/bin/python -m pytest -q tests/test_futu_trading_state.py tests/test_current_trading.py tests/test_futu_market.py tests/test_futu_quote_execution.py tests/test_futu_static_info.py` | 106 项通过，退出 0。 |
| `thesis-ledger` | 设置 `ARENA_G03_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis` 与镜像 registry，`rtk proxy env ... pnpm --filter @thesis-ledger/server exec vitest run test/market/current-execution-offline.test.ts test/market/sampled-execution-business.test.ts test/model-arena/live-execution-scope.test.ts` | 15 项通过，退出 0，含跨语言深市提交／撮合。 |
| `daily-stock-analysis` | 新状态读取器、来源接入、API、worker 及测试的定向 flake8 | 通过；首次缩进报告修正后退出 0。 |
| `daily-stock-analysis` | `rtk proxy .venv/bin/python scripts/check_data_service_boundary.py --syntax`；`check_thesis_ledger_capability_boundaries.py` | 511 个数据闭包文件、语法及统一能力边界通过，退出 0。 |
| `thesis-ledger` | Server `typecheck`，本次两个 TS 测试文件的 ESLint | 通过，退出 0。Server 生产源码未在本叶改变，前序 build 继续复用。 |

## 一致性审查与交付边界

本地 T06.2a0-SZ 的成功路径、来源启停、配置变化、身份、时钟、未知／停牌拒绝和实际业务消费已核对。此前“深市无覆盖”的本地兜底已经替换为真实读取，不再把尚未实现描述成所有来源返回未知。

本记录完成时目标尚未同步；随后 T06.2d 已完成正式同步及目标新入口实读，另见[目标验收](2026-11-23-arena-sampled-deployment.md)，不改写本记录原本地验证的时间边界。真实模型准入、完整历史追平及远端 CI 沿原所有权保持独立状态。
