# 数据源功能与准入记录核查

> 核查时间：2026-10-07T11:56:30.042774+08:00（Asia/Shanghai）
> 范围：ThesisLedger 当前 V3 路由及同级 DSA 的 Provider 适配器。
> 方式：源码、只读 SQLite、Docker 只读盘点；未调用外部 Provider，未修改业务配置或准入记录。

## 结论

当前源码登记 **16 个数据源、49 条精确能力组合**。同一功能按资产、复权口径和上游来源拆分，所以 49 条不表示 49 个不同功能。

当前 Docker Desktop 的 `desktop-linux` 上下文中容器和持久卷均为空，Server HTTP 入口连接被拒绝。用户确认没有备份；上一轮容器内的五条准入记录已无法核实或恢复，不能视为当前记录。现存宿主机数据库 `daily-stock-analysis/data/stock_analysis.db` 的准入、页面凭证配置、V3 策略、健康状态等 12 张控制表全部为 0 条。

本机环境仍能解析 HiThink API Key；其他需要凭证的来源没有当前有效凭证配置。只读目录计算得到 **10 条 ready、39 条 not_admitted，目录完整**。这证明本机代码与配置的候选判定，不证明已部署服务、外部接口在线可用或业务读取成功；当前也没有已保存的 V3 主备路由策略。

## 逐源功能与当前状态

“声明功能”来自宽 Provider manifest；“精确接入”来自 V3 已登记、实际有执行路径的适配器组合。底层 DSA Fetcher 存在，不等于已接入当前前端路由。

| 数据源 | 声明功能 | 当前 V3 精确接入 | 组合数 | 本机只读目录判定 | 凭证情况 |
| --- | --- | --- | ---: | --- | --- |
| 官方公开规则（本地）（`official-rules`） | 中国内地股票历史公共收费 | 公共收费两个来源 | 2 | 2 条就绪；本地包，不需准入 | 内置 |
| 发行人停复牌公告（本地）（`official-states`） | 中国内地股票历史停复牌 | 日级停复牌 | 1 | 1 条就绪；本地包，不需准入 | 内置 |
| 管理人现金分红公告（本地）（`official-dividends`） | ETF 现金分红公告 | ETF 现金分红 | 1 | 1 条缺准入记录 | 内置 |
| AKShare（`akshare`） | 股票/ETF 日线与报价，公募净值、净值历史、持仓，股票筹码 | 股票日线三来源×三口径、ETF 日线三口径；股票报价三来源；公募净值/历史/持仓、筹码；ETF 分红/拆分 | 21 | 21 条缺准入记录 | 内置，无需密钥 |
| efinance（`efinance`） | 股票/ETF 日线与报价，公募净值及历史 | 股票/ETF 报价、公募净值及历史；日线未接入 V3 | 4 | 4 条缺准入记录 | 内置，无需密钥 |
| 腾讯财经（`tencent`） | 股票/ETF 日线，ETF 报价 | 股票 none/qfq；ETF none/qfq/hfq；ETF 报价 | 6 | 6 条就绪，不需准入 | 内置，无需密钥 |
| Tushare Pro（`tushare`） | 股票/ETF 日线、股票报价和筹码 | ETF none 日线、ETF 现金分红；其他声明项未接入 V3 | 2 | 2 条缺记录，且缺凭证 | Token；本机未配置 |
| TickFlow（`tickflow`） | 中国内地股票日线和报价 | 无精确 V3 路由 | 0 | 未接入 V3，且缺凭证 | API Key；本机未配置 |
| 通达信（pytdx）（`pytdx`） | 中国内地股票日线和报价 | 中国内地股票报价；日线未接入 V3 | 1 | 1 条缺准入记录 | 内置，无需密钥 |
| BaoStock（`baostock`） | 中国内地股票日线 | 无精确 V3 路由 | 0 | 未接入 V3 | 内置，无需密钥 |
| Yahoo Finance（`yfinance`） | 多市场股票/ETF/指数日线和报价 | 中国内地股票/ETF 报价；日线及其他市场未接入 V3 | 2 | 2 条缺准入记录 | 内置，无需密钥 |
| Longbridge（`longbridge`） | 香港/美国股票/ETF 日线和报价 | 无精确 V3 路由 | 0 | 未接入 V3，且缺凭证 | OAuth 或三项密钥；本机未配置 |
| Finnhub（`finnhub`） | 美国股票日线和报价 | 无精确 V3 路由 | 0 | 未接入 V3，且缺凭证 | API Key；本机未配置 |
| Alpha Vantage（`alphavantage`） | 美国股票日线和报价 | 无精确 V3 路由 | 0 | 未接入 V3，且缺凭证 | API Key；本机未配置 |
| HiThink（`hithink`） | 中国内地股票/ETF 日线和报价、ETF 现金分红 | ETF qfq、股票 none/qfq/hfq、股票/ETF 报价、ETF 分红 | 7 | ETF qfq 1 条就绪；其他 6 条缺准入记录 | API Key；环境凭证存在，页面记录为空 |
| RQData（`rqdata`） | 宽 manifest 未声明数据能力；页面账号 schema 已登记 | ETF 现金分红与份额拆分两个独立适配器 | 2 | 2 条缺记录，且缺凭证 | 用户名/密码；本机未配置 |

`none/qfq/hfq` 分别是不复权、前复权、后复权。以上“内置”只说明无需页面密钥；准入、网络、来源身份与覆盖仍分别核验。

## 当前实际可开放的十条组合

| 来源 | 组合 | 前置及边界 |
| --- | --- | --- |
| 腾讯 | 股票日线 none/qfq；ETF 日线 none/qfq/hfq；ETF 实时行情，共 6 条 | 已有基础价格/报价分支按配置开放，不依赖人工 RouteAdmission。当前未做在线请求。股票 hfq 没有适配库存。 |
| HiThink | ETF 日线 qfq，共 1 条 | 需要有效 API Key；本机环境凭证已存在，前端 API Key schema 已登记。基础价格不要求人工窗口准入，不能据此开放股票、报价或分红。 |
| 官方规则 | 当前包与备份包的历史公共收费，共 2 条 | 本地包存在；主包标签范围为 2023-08-23～29、备份包为 2023-08-22～29，按实际读取的证券身份与日期范围检查。 |
| 发行人停复牌 | 皇台酒业日级停复牌，共 1 条 | 本地数据包针对 `000995.SZ`、2023-08-16～21；未披露日期仍为未知。不能推广为全市场历史交易状态。 |

管理人现金分红公告的本地包针对 `510300.SH`、2023 年 1 月，已登记来源和校验器，但仍需要独立准入；不属于上述十条。

## 准入记录核实

### 当前记录

- `thesis_ledger_route_admission_v3`：0 条。
- `thesis_ledger_provider_config`：0 条，表示页面配置为空；不排除环境凭证。
- `thesis_ledger_policy_state_v3` 和 `thesis_ledger_policy_history_v3`：均为 0 条，没有当前持久化主备策略。
- `thesis_ledger_provider_health`：0 条，没有可用的当前健康历史。
- 其他七张控制表也为 0 条；用户确认没有旧容器记录备份。

SQLite 使用 URI `mode=ro`、`PRAGMA query_only=ON`；目录计算通过只读连接调用现有 Registry 和 Catalog 判定，没有运行 store 初始化或数据库迁移。没有打印、复制或发送 API Key。

### 上一轮五条记录的历史事实

下表仅引用[上一轮只读诊断](../tasks/evidence/2026-10-07-market-route-admission-diagnosis.md)，本轮无法重新读取原记录或核验其当前凭证/适配器修订。**它们不是当前有效准入证据。**

| 历史记录 | 上一轮可读时的状态 | 当时的实际作用 |
| --- | --- | --- |
| HiThink ETF qfq 日线 | 记录 status 为 admitted，但有效期已到 2026-10-05 21:28 | 基础价格已取消人工窗口准入前置，旧记录过期不影响该基础能力 |
| HiThink 股票实时行情 | revoked，原因 `bounded_target_probe_finished` | 只读有界目标验收结束后已撤销 |
| HiThink ETF 实时行情 | revoked，同上 | 不能据历史测试成功开放生产路由 |
| efinance 公募净值历史 | 记录 status 为 admitted，但有效期已到 2026-10-01 21:22 | 当时已过期，因此目录不就绪 |
| 腾讯 ETF hfq 日线 | 上一轮仍在有效期内，截至 2026-10-10 01:17 | 基础价格按配置开放，不依赖该记录 |

其余来源在上一轮也没有对应记录。旧 status、有效期或测试报告都不能重建“当前已准入”的事实；重新建立记录须遵循实际来源、标的/日期范围、证据、适配器与凭证修订核验。

## 核查发现

1. **五个来源完全没有 V3 适配库存**：TickFlow、BaoStock、Longbridge、Finnhub、Alpha Vantage。它们在 DSA 底层有 Fetcher，但仅配置凭证或补准入记录不会使它们成为当前 V3 路由候选。
2. **部分来源只有局部接入**：efinance、pytdx、yfinance 的日线虽在宽声明/底层 Fetcher 中存在，当前 V3 没有登记这些日线；Tushare 当前只接入 ETF 不复权日线和 ETF 分红。
3. **宽能力卡片与精确库存不完全一致**：AKShare、Tushare 的事件来源存在精确库存但未合并进宽能力卡片；RQData 宽能力字典为空，但已有两个独立事件适配器。应以精确目录和执行路径判断当前可配置范围。
4. **凭证问题和记录问题不同**：HiThink 现有环境 API Key 足以开放 ETF 基础 qfq；股票日线、股票/ETF 报价和 ETF 分红的六条组合均缺独立准入。Tushare、RQData 同时缺凭证和记录。
5. **“尚未准入”文案无法完整说明原因**：目录在 Provider 未配置时会先返回 `not_admitted`；缺凭证或历史失效也可能被合并为该状态。不能仅凭这句文案推断上游无能力。
6. **ready 也有覆盖边界**：本地公共收费和停复牌仅支持当前有界数据包；腾讯/HiThink 的配置就绪并不等于当次网络和权限验证成功。

## 底层 DSA 功能补充

本次还核对了 Fetcher 的公共方法及继承链：大部分日线由 `BaseFetcher.get_daily_data` 调用各来源的 `_fetch_raw_data`，再经过标准化、清理和指标计算，所以不能因子类没有同名公共方法就判定没有实现。

- AKShare 还实现指数、市场统计、板块/概念排名、热门股票、涨停池和增强分析数据。
- efinance 还实现指数、市场统计、板块排名、基础信息、所属板块和增强分析数据。
- Tushare 还实现股票名称/目录、指数与市场统计、交易日时点、板块及筹码指标；另有精确基金因子/分红读取 mixin。
- TickFlow 还实现行情预取、股票名称/目录、指数、市场统计和板块排名。
- pytdx、BaoStock、Longbridge、Finnhub、Alpha Vantage 分别有股票名称或目录等辅助方法；yfinance 有指数与基本面适配器。

这些是 DSA 自有分析与 Fetcher 功能，当前没有对应 ThesisLedger V3 精确路由。未用方法存在、SDK 全量文档或旧测试推定真实账号和外部权限。

## 精确接入明细

以下完整列出当前 49 条组合的分组；同一行的复权口径分别算一条。未列出的资产、市场、分钟周期或上游来源不属于当前 V3 接入范围。

### 官方公开规则（本地）

- `CN / STOCK / HISTORICAL_PUBLIC_FEES / cn-stock-auction-fees`。
- `CN / STOCK / HISTORICAL_PUBLIC_FEES / cn-stock-auction-fees-archive`。

### 发行人停复牌公告（本地）

- `CN / STOCK / HISTORICAL_TRADING_STATUS / cn-stock-daily-suspension`。

### 管理人现金分红公告（本地）

- `CN / ETF / CASH_DISTRIBUTION / cn-etf-cash-notices`。

### AKShare

- `CN / ETF / DAILY_BAR / eastmoney`：`none / qfq / hfq`。
- `CN / STOCK / DAILY_BAR / eastmoney`：`none / qfq / hfq`。
- `CN / STOCK / DAILY_BAR / sina`：`none / qfq / hfq`。
- `CN / STOCK / DAILY_BAR / tencent`：`none / qfq / hfq`。
- `CN / ETF / CASH_DISTRIBUTION / eastmoney`。
- `CN / ETF / SPLIT_EVENT / eastmoney`。
- `CN / MUTUAL_FUND / FUND_HOLDINGS / eastmoney`。
- `CN / MUTUAL_FUND / FUND_NAV / eastmoney`。
- `CN / MUTUAL_FUND / FUND_NAV_HISTORY / eastmoney`。
- `CN / STOCK / CHIP_SUMMARY / eastmoney`。
- `CN / STOCK / REALTIME_QUOTE / eastmoney`。
- `CN / STOCK / REALTIME_QUOTE / sina`。
- `CN / STOCK / REALTIME_QUOTE / tencent`。

### efinance

- `CN / ETF / REALTIME_QUOTE / eastmoney`。
- `CN / MUTUAL_FUND / FUND_NAV / eastmoney`。
- `CN / MUTUAL_FUND / FUND_NAV_HISTORY / eastmoney`。
- `CN / STOCK / REALTIME_QUOTE / eastmoney`。

### 腾讯财经

- `CN / ETF / DAILY_BAR / tencent`：`none / qfq / hfq`。
- `CN / STOCK / DAILY_BAR / tencent`：`none / qfq`。
- `CN / ETF / REALTIME_QUOTE / tencent`。

### Tushare Pro

- `CN / ETF / DAILY_BAR / tushare`：`none`。
- `CN / ETF / CASH_DISTRIBUTION / tushare`。

### 通达信（pytdx）

- `CN / STOCK / REALTIME_QUOTE / pytdx`。

### Yahoo Finance

- `CN / ETF / REALTIME_QUOTE / yfinance`。
- `CN / STOCK / REALTIME_QUOTE / yfinance`。

### HiThink

- `CN / ETF / DAILY_BAR / fund-market-historical`：`qfq`。
- `CN / STOCK / DAILY_BAR / hithink-financial-api`：`none / qfq / hfq`。
- `CN / ETF / CASH_DISTRIBUTION / fund-corporate-actions-dividends`。
- `CN / ETF / REALTIME_QUOTE / fund-market-snapshot`。
- `CN / STOCK / REALTIME_QUOTE / a-share-prices-snapshot`。

### RQData

- `CN / ETF / CASH_DISTRIBUTION / rqdata`。
- `CN / ETF / SPLIT_EVENT / rqdata`。

## 建议处理顺序

1. 在需要继续目标运行态验收时，先通过 infra 的正式入口重新建立环境，重新配置必需凭证和主备策略；当前 Docker 数据已不存在，不将历史记录默认为恢复目标。
2. 先验证现有腾讯基础行情与 HiThink ETF qfq 的真实只读数据路径，再逐项核验无密钥来源的目标接口和实际范围。当前没有外部调用证据，不批量授予准入。
3. 对已接入但需要准入的能力，按真实范围建立新记录；对未接入的来源，先补精确适配再谈准入。这两条工作路径分开验收。
4. Tushare、RQData、Longbridge 等账号/权限前置独立处理；本轮没有购买服务、申请账号或调用收费接口。

本轮仅核查并生成报告，没有改代码、保存凭证、创建/恢复准入、启动 Docker 或修改原有任务完成状态。

## 核查依据与可复现边界

主要入口：DSA `thesis_ledger_provider_manifests.py`、`thesis_ledger_market_v3_adapters.py`、`thesis_ledger_current_data_route.py`、`thesis_ledger_event_v3_adapters.py`、`thesis_ledger_hithink_quote_admission.py`、`thesis_ledger_price_route_access.py` 及 `thesis_ledger_provider_runtime.py`。

执行的只读过程：`docker context ls`、`docker info`、`docker ps -a`、`docker volume ls`，宿主 SQLite 只读 SELECT，静态 Provider/适配器库存枚举，现有目录判定的只读投影，以及 Fetcher 方法 AST 核对。未运行单元测试或构建，因为本轮没有代码变更；未进行外部服务在线验收。

以下 SHA-256 固定本轮主要判定输入，均为 DSA 仓库相对路径；工作区有并行未提交修改，结论只适用于这一输入快照。

| 输入 | SHA-256 |
| --- | --- |
| `src/services/thesis_ledger_provider_manifests.py` | `3c1148b05435e6e27f0d846ab1fa8901ebad7f2fa00f1e43387666a7910ef46c` |
| `src/services/thesis_ledger_route_catalog.py` | `25ca8fb9845a004ffafca1c1ceb184888b9c8e7a3e60dd07ffb1f00c1edf852e` |
| `src/services/thesis_ledger_market_v3_adapters.py` | `3f2f4d47afe2827296b4c452658bb147ea0b681290b6bbcf9089d31c55410444` |
| `src/services/thesis_ledger_current_data_route.py` | `8f4bc24254d2b62b4728e7a06a20914d6e506f4319ad15feb80121753de0772b` |
| `src/services/thesis_ledger_event_v3_adapters.py` | `e6cd3e7436fa3d181a181f63dff854452c10d67fd2f7a0cf656759c619674fc0` |
| `src/services/thesis_ledger_hithink_quote_admission.py` | `1bcc15554ede52d8305afd6aa4f5236ba679f62b22e08f465ba371dac58e9ef1` |
| `src/services/thesis_ledger_price_route_access.py` | `266983a2caf0a12e7c26639099c13e148e5f1941797c6264ed54e2f617cfeba6` |
| `src/services/thesis_ledger_provider_runtime.py` | `66ef34f60505da81abb76977339d279aa75d631c0c8ce70eaee5542d52e77491` |
| `src/services/provider_credentials.py` | `63f69dc3e8436bf2e13e89c65af0f73d17d6860937f02153899418720777c6d6` |
