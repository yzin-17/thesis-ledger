# 腾讯 ETF 后复权适配与其他来源可行性

## 结论与范围

用户要求核对能否改造，以及其他来源是否可以适配现有接口。结论是可以：来源的响应格式由 DSA 适配，来源身份、数据口径和缺失能力仍分别表达。此前旧腾讯接口缺成交额的停止点只表示当时无法直接接入，不能外推成腾讯 HFQ 不可实现。

本轮新增验证发现，现有 `newfqkline/get` 已返回带原生成交额的 ETF `hfqday`。选择只扩展腾讯 ETF 精确适配器、能力库存和独立修订，沿用共享 Bar 合同。对应主仓 [Spec §4.1](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) 与 [Task 的 M2-tencent-native-hfq-* 叶](../2026-09-25-multi-source-adjustment-aware-backtest.md)。

## 接口与消费边界

- [DSA 原生读取器](../../../../daily-stock-analysis/data_provider/tencent_native_daily.py)已有年度分段、范围筛选和至少九列的原生成交额读取；当前样本为十列，不需要从旧六列响应估算金额。
- [共享 Bar Schema](../../../packages/schemas/src/market-bar-series.ts)要求 amount 为有限非负数，并把它纳入指纹；[DSA 校验](../../../../daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py)、[V3 wire](../../../../daily-stock-analysis/api/thesis_ledger.py)和[Snapshot 构建](../../../apps/server/src/backtest/backtest-snapshot-v3-builder.ts)也消费它。若未来接入确实缺额的来源，不能只删除解析器检查，必须另立公共合同演进任务。
- 纯价格 normalized-series 的[信号/执行消费](../../../apps/server/src/backtest/backtest-v2-execution-exchange.ts)和[模拟成交计算](../../../packages/domain/src/backtest-exchange.ts)不依赖原生 Bar amount。因此缺额不是所有价格回测在原理上的阻塞；当前仍须满足已有传输与冻结合同。成交量、VWAP、容量等功能按各自实际依赖判断，不能统一推断。
- 实际上游继续为 `tencent`，不新增 a-stock-data Provider；HFQ 不借用 none/qfq 的准入，未知单位和复权基准不因增加解析能力而自动变成已核实。
- 主仓 [复权枚举](../../../packages/schemas/src/market-price-protocol.ts)、[路由目录投影](../../../apps/server/src/market/market-policy-catalog.ts)和 [Desktop 路由消费](../../../apps/desktop/src/features/market-data/market-data-routes-v3.ts)已通用支持 HFQ，没有腾讯 ETF 专属的 none/qfq 限制。新能力可由 DSA 目录发现；只有精确目标状态为 `ready` 才能选择并执行，未准入时继续显示不可用。

## 目标匿名实测

环境为目标 `thesis-ledger-dev-dsa-1`，Linux aarch64；观察时镜像 `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725`，状态 running/healthy。

固定请求：

```text
GET https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get
_var=kline_dayhfq2026
param=sz159516,day,2026-04-30,2026-08-09,640,hfq
```

两次请求均匿名直连，关闭环境代理，无自动重试、重定向或来源轮换。每次总期限 25 秒、响应上限 1 MiB。第二次是修正探针窗口筛选后的唯一补验，不是来源失败重试；未写业务数据或准入。

| 项目 | 首次探针 | 修正后补验 |
| --- | --- | --- |
| UTC 观察时间 | 2026-10-02T16:26:37.147522Z | 2026-10-02T16:27:40.930017Z |
| HTTP / 字节数 | 200 / 55,640 | 200 / 55,640 |
| 响应 SHA-256 | `85f33fcc5c1e5c9aae16927f06030e832aade7fe1c26365d4ec9dfb215151bb2` | `2bf38e239aabd3896de293ce98ddfd53a3c8d9dd17d1c7283c6643338acf91bd` |
| 探针 SHA-256 | `333569f627488d379bd2fd0731e175c43112f33430276cd574233191a9f447ae` | `b559357e4a4266993f0908a0d849ec6d5de1f8b3f2c50d012c7a9d2de6713852` |
| 结果 | 对窗外行过严，检查提前结束 | 按现有解析器先筛窗口，检查通过 |

执行入口为 `docker exec -i thesis-ledger-dev-dsa-1 python - < /private/tmp/tencent-native-hfq-probe-20261003.py`，两版探针均先通过 AST 检查。原始响应没有保存，因此首次不能事后重放；结果不据首次范围检查判定源故障。原生响应含实时附属字段，两个整体摘要不同不单独说明历史行情发生修订。

补验为业务码 0，证券身份匹配，原生节点 `hfqday`；原始返回 640 行，其中窗外 572 行、窗内 68 个唯一日期，首末日期为 2026-04-30 与 2026-08-07。窗内每行十列，第 9 列（`raw[8]`）均为有限非负数，OHLC 检查通过。

| 日期 | 开 / 高 / 低 / 收 | 原始成交量字段 | 原始成交额字段 |
| --- | --- | --- | --- |
| 2026-07-09 | 3.610 / 3.890 / 3.554 / 3.890 | 51677053.00 | 957065.64 |
| 2026-07-10 | 3.892 / 4.016 / 3.612 / 3.620 | 128053264.00 | 1233856.07 |

这两日 HFQ 价格与[旧腾讯接口取样](2026-10-02-astockdata-free-path-validation.md)一致。现有解析器的量额换算约定仍需独立单位证据；本次字段存在性验证不替代交易日全集、长窗截断、跨窗口复权基准、使用条件和真实 Route admission 验收。

## 其他来源如何适配

| 来源 | 可实施的接口适配 | 仍需解决的事实或条件 |
| --- | --- | --- |
| 腾讯 / a-stock-data 中的腾讯路径 | 复用现有腾讯 Provider，原生 `newfqkline/get` 增加 ETF HFQ | 单位、覆盖、基准和独立准入；本叶先实现适配与拒绝门禁 |
| 通达信官网盘后包 | 可另写文件读取器，把已验证的二进制记录投影成 raw Bar；不依赖付费 SDK | [两日样本](2026-10-02-tdx-free-access-validation.md)尚缺逐行日期、量额单位和完整历史证明，也未提供已验证的复权与事件合同 |
| 新浪因子路径 | 格式可以解析，但本次固定版算法只有 `raw × f` | 159516 拆分前后 `f=1`，该算法未表达拆分；不能靠改列名或接口包装恢复缺失语义，不外推所有新浪接口 |
| Tushare / RQData | 已有适配基础，可接统一接口 | Tushare 当前三个基金接口权限拒绝；RQData 缺凭据。编码不能替代账号权限，维持用户要求的暂停状态 |
| AKShare / EastMoney | 已有行情与事件适配基础 | 当前用户指定暂不可用并跳过，保留已完成实现，不因此继续请求或授予准入 |

复权行情、复权因子、拆分和分红是不同能力。返回 HFQ Bar 不自动等于能提供完整事件表，也不自动完成原始价格加事件的回测路径。

## 实施与验证状态

DSA 最小适配与目标读取验证已完成。`TencentFetcher` 新增可选 `asset_type` 参数，仅 HFQ 要求其为 ETF；runtime 在腾讯精确入口传入实际资产类型。旧直接调用可省略该参数，none/qfq 既有适配修订不变；股票 HFQ 不登记。HFQ 独立修订为 `dsa-v3-etf-tencent-hfq-newfqkline-adapter-v1`。未改共享 Schema、Server、客户端或数据库结构；runtime 文件净减少 2 行，未扩大存量文件。

### 本地验证

- 七个定向文件共 120 项通过：`test_tencent_native_daily.py`、`test_tencent_fetcher.py`、`test_thesis_ledger_market_v3.py`、`test_thesis_ledger_market_v3_pagination.py`、`test_thesis_ledger_admission_v3.py`、`test_thesis_ledger_market_v3_admission_runtime.py`、`test_thesis_ledger_control_v3.py`，均位于 DSA `tests/`。使用 `.venv/bin/python -m pytest -q`，覆盖原生 HFQ 参数与键、量额、错口径与缺额拒绝、ETF 限制、分页口径、库存/修订一致以及 none/qfq 准入不能满足 HFQ。
- `.venv` 的 `py_compile`、局部 critical `flake8` 通过；官方 `./scripts/ci_gate.sh all` 完整通过：7732 passed、1 skipped、4 deselected，626 subtests passed。首次启动因 PATH 未包含 `.venv/bin` 在 flake8 前停止，补入该目录后完整通过，未安装依赖。完整日志 `/private/tmp/tencent-hfq-ci-gate-20261003.log`，最终测试阶段耗时 188.70 秒。
- 主仓独立消费者审查确认通用 HFQ 合同和目录投影已覆盖新增精确能力，未更改前端或接口字段，无受影响客户端构建输入。后续只改说明文档，不重复运行全量门禁。
- 收尾检查：两仓 `git diff --check` 通过；相关文档 415 个本地链接均存在，未发现尾随空白，两个新增 Task 叶 ID 各出现一次。定向文件清单另作仅收集核对，确认为 120 项，未重复执行测试。

### 目标同步与执行

相邻 infra 执行 `./scripts/sync-code.sh dsa`，兼容性预检与同步退出码为 0；日志 `/private/tmp/tencent-hfq-sync-20261003.log`。目标 `running/healthy`，本次启动时间 `2026-10-02T16:48:12.812492167Z`。镜像仍为上文同一 ID；仅更新容器可写层，未构建新镜像或执行数据库升级，重建容器后该同步会消失。

五个生产文件的宿主/容器 SHA-256 完全一致：

| 文件（DSA 根目录下） | SHA-256 |
| --- | --- |
| `data_provider/tencent_native_daily.py` | `8790c1334ca399c4b6d0fe351b6d3ae5ec2bd6afd647e3af88d4d1a88739bf5e` |
| `data_provider/tencent_fetcher.py` | `6dd7d9195423b1e4b074c8a53425bd0447070745402419ffdb56d92e95070788` |
| `src/services/thesis_ledger_market_v3_adapters.py` | `53e17804f1c3542ab0081bac6e0670c66b16b6ef7b8aef1104c7064372c05644` |
| `src/services/thesis_ledger_market_v3_revisions.py` | `134faa00d0d5039c9c95ec94d5585d2db48f9cc6b863301bfffbd776410bff07` |
| `src/services/thesis_ledger_provider_runtime.py` | `1d450695edd0920c66db870eefdaed8d95c83542d1b7167d0719fb7b39970cb9` |

目标验证于 `2026-10-02T16:49:00.868455Z` 开始，耗时 0.953 秒，进程退出码为 0。脚本 `/private/tmp/tencent-hfq-target-validation-20261003.py` 的 SHA-256 为 `c0d6329c4c971217c296001279e8bd633445c645bb78dccfeb569420fc699606`，AST 检查通过。

1. 已运行服务的 Control route catalog 返回 HTTP 200、`integrity=complete`；唯一 `CN/ETF/DAILY_BAR/1d/hfq + tencent/tencent` 条目为 `not_admitted`。验证使用容器已有 Control 凭据，未输出或复制凭据。
2. 当前实际 store 配合内存哨兵适配器调用 runtime，因未配置精确 HFQ 路由而返回 `NO_ELIGIBLE_PROVIDER`，来源调用次数为 0。此目标证据证明当前未就绪目标的拒绝；独立准入拒绝的更细反例由离线测试覆盖，不能把更早的路由拒绝说成目标已走到 admission 检查。
3. 新版本精确 `TencentFetcher` 独立进行一次 25 秒预算的真实 HFQ 读取，返回 68 行，首末日期与匿名探针一致，来源为 `tencent`、金额归一化标记为 `provider`。7 月 9/10 日收盘为 3.89/3.62；沿用当前换算后的量分别为 5,167,705,300 / 12,805,326,400，金额为 9,570,656,400 / 12,338,560,700。这里只核对原字段投影，单位仍未授予准入。
4. 传输证明为 `newfqkline/get`、hfq、一个年度分段，分段 68 行、响应摘要 `b60b95e67973118833e820d49db31c9daa9e66331b625cfccb2d1ec1f26fde50`，整窗传输修订 `8c571ebc23e657826602127e6a1e5d86528aaa7336b6dadd78df57282086fd0f`。`partitionComplete` 只表示分段传输完成，不代替交易日全集验收。

### 剩余范围与回滚

适配器能读取已得到真实验证；尚未新增 Desired/Effective 路由或 Route admission，也未运行该来源的 Server 回测正向验收。后续按 `EX-TX-ETF-H` 核对单位、日期全集、窗口基准与使用条件，再做独立准入和冻结回测。HFQ Bar 不代替拆分、分红事件能力。

若需回滚，只撤回本叶的 HFQ 映射、独立库存/修订与资产类型参数传递，再通过官方 DSA 更新入口同步；保留既有 none/qfq 和其他工作区改动。专题文档无独立英文版。未提交、推送或发布。

## 2026-10-03 价格研究准入接续

本页上文的 not_admitted 为适配刚完成时的状态。随后目标窗口和重叠窗验证通过，已取得限标的、限窗口、限期限的价格研究准入，正式 Data V3 返回 68 行；Server/DSA 版本 33 对齐，目录 HFQ 为 ready。正式 Server 准备因尚缺日级可交易性元数据被阻断，未创建 Run，回测和重放仍开放。当前状态及限制以[价格研究准入与目标验收](2026-10-03-tencent-hfq-price-research.md)为准。
