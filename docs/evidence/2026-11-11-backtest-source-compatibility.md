# 回测日线来源适用性检查

本轮[规格](../archive/specs/2026-11-11-backtest-source-compatibility.md)与[任务](../archive/tasks/2026-11-11-backtest-source-compatibility.md)已完成归档；当前合同由 [DSA 市场日历设计](../../../daily-stock-analysis/docs/design/thesis-ledger-market-calendar-contract.md)维护。

后续 Yahoo 缺价已完成独立修复：同日原始字段核对及单日补取后，股票与 ETF 均通过同一完整窗口。下表保留本轮当时基线与失败记录，最新 Yahoo 状态见 [DSA 后续证据](../../../daily-stock-analysis/docs/evidence/2026-11-11-yahoo-daily-price-missing.md)。

后续富途已补齐沪深 ETF 日线绑定：当前账号的沪市前／后复权和深市前复权均通过完整窗口；最新来源口径矩阵及实际范围见 [DSA 富途证据](../../../daily-stock-analysis/docs/evidence/2026-11-11-futu-cn-etf-daily.md)。

## 输入与边界

后续非对称能力已继续核实：腾讯股票后复权、BaoStock ETF 日线的适配与实际结果，以及 HiThink／Yahoo 的接口口径、Tushare 权限限制见 [DSA 后续核实](../../../daily-stock-analysis/docs/evidence/2026-11-11-adjusted-daily-capability-audit.md)。以下数字保留本轮当时基线。

- 标的：`510300.SH`、`600519.SH`；完整准备窗口：`2026-09-24` 至 `2026-11-10`，主要口径为前复权。
- 最终复核能力目录完整，境内股票／ETF 前后复权共 26 个精确绑定。目录可用状态不代表完整窗口已通过。
- 不修改真实主备策略、凭证、准入或历史任务；不创建真实回测，不调用 AI。
- 股票和 ETF 的原始份额事件能力不在本轮扩展范围；普通提交继续采用前复权或后复权。

## 近期短窗口基线

既有精确检查入口 `POST /api/market-data/providers/:providerId/test`，请求指定完整 `route.key` 和 `route.target`，`purpose=capability_read`。采样窗口为 `2026-11-03` 至 `2026-11-10`，不作为完整回测窗口认证。

| 标的类型 | 提供方／上游 | 口径 | 实际结果 | 耗时 |
| --- | --- | --- | --- | --- |
| ETF | HiThink／fund-market-historical | 前复权 | 取数通过 | 707 ms |
| ETF | 腾讯／tencent | 前复权 | 取数通过 | 782 ms |
| ETF | AkShare／eastmoney | 前复权 | 已尝试，`network_failure` | — |
| ETF | EFinance／eastmoney | 前复权 | 取数通过 | 3115 ms |
| 股票 | HiThink／hithink-financial-api | 前复权 | 取数通过 | 806 ms |
| 股票 | 腾讯／tencent | 前复权 | 取数通过 | 810 ms |
| 股票 | AkShare／sina | 前复权 | 取数通过 | 1613 ms |
| 股票 | BaoStock／baostock | 前复权 | 取数通过 | 3161 ms |
| 股票 | EFinance／eastmoney | 前复权 | 取数通过 | 1974 ms |
| 股票 | 富途／futu | 前复权 | 取数通过 | 775 ms |
| 股票 | YFinance／yfinance | 前复权 | 平台 HTTP 429 拦截，未尝试上游 | — |

TickFlow 未启用且未配置；RQData 缺凭证。Tushare、Pytdx 虽已配置，但当前没有本轮需要的复权日线绑定。不能把这些情况归为上游故障，也不自动启用或假定支持。

## 完整窗口诊断入口

`daily-stock-analysis/scripts/probe_backtest_daily_sources.py` 在权限为 `0700` 的临时目录中生成 `0600` SQLite 副本，真实库以只读模式打开。仅在副本设置精确单目标路由，复用生产请求解析、来源选择、完整分页、交易日、日级可交易性、价格口径、单位及响应校验。结束后删除副本并核对真实控制状态指纹。

固定研究模式沿用生产 `assume-untradable-no-bar` 语义。诊断输出缺 Bar 的假设日期，不能把这些日期解释为已证实停牌或完整成交数据。未知上市日期保持未知。输出仅含来源、窗口、稳定原因码、统计和输入指纹，不输出凭证或原始配置。

宿主维护入口最终归属 DSA：`scripts/local-runtime/probe-backtest-daily-sources.sh`。工作区并行进行运维职责迁移时，入口及其测试随业务迁入该目录，本轮已适配并验证新路径。入口使用 `python -B -c` 执行脚本，避免 SDK 的 spawn 子进程读取不存在的 `/app/<stdin>`。

## 完整窗口的原因与修复

初次完整窗口中，HiThink、腾讯及 EFinance 的 ETF 均取得 28 条日线。EFinance、新浪、BaoStock、富途与 Yahoo 的股票请求均在请求上游前因 `listing_fact_missing` 被拒绝；它们缺少已存在的研究日历绑定。该现象与短窗口检查成功并不矛盾，短窗口检查没有执行完整覆盖准备。

修复将已有 CN 复权绑定接入共同的身份检查及研究日历语义。正常严格读取仍拒绝上市日期未知；研究读取保留 `listing.status=unknown`，不创建上市日期。HiThink／腾讯其余已支持的复权绑定一并补齐，多窗口调度改用覆盖上下文已验证的上市后会话集合，避免未知日期取值异常。

ETF 的一次 AkShare 诊断曾因启动器的 `<stdin>` 与 SDK spawn 不兼容而失败，未发出上游请求，该结果不作为来源网络失败证据。改正启动器后，完整 ETF 窗口实际通过；近期短窗口出现过的网络失败不代表来源永久不可用。

Yahoo 在接入研究日历后实际请求了上游，但仍返回 `invalid_response`。脱敏异常链定位为 `yfinance.read_frame → normalize_exact_daily`，在 `exact_daily_contract.py:35` 的缺失价格检查失败，即窗口内存在缺失的 OHLC 价格。保留拒绝结果，不删除无效行、不补造价格或将无效响应认证为停牌。其旧短窗口 HTTP 429 属于平台限流，与本次实际来源错误分别记录。

## 最终库存与实读矩阵

以下“通过”均指相同 `2026-09-24` 至 `2026-11-10` 完整窗口、28 条有效日线、28 个日历会话、缺 Bar 假设日期为空。后复权仅 BaoStock 做了独立完整实读；其他后复权合同测试通过，但不声明真实窗口成功。未实读组合保持未验证。

| 提供方／上游 | 资产 | 已注册口径 | 前复权完整窗口 | 后复权完整窗口 |
| --- | --- | --- | --- | --- |
| 腾讯／tencent | 股票 | qfq | 通过 | 未注册 |
| 腾讯／tencent | ETF | qfq、hfq | 通过 | 未实读 |
| AkShare／eastmoney | 股票 | qfq、hfq | 未实读 | 未实读 |
| AkShare／sina | 股票 | qfq、hfq | 修复后通过 | 未实读 |
| AkShare／tencent | 股票 | qfq、hfq | 未实读 | 未实读 |
| AkShare／eastmoney | ETF | qfq、hfq | 修正诊断入口后通过 | 未实读 |
| TickFlow／tickflow | 股票 | qfq、hfq | 未尝试：未启用、未配置，目录 `not_admitted` | 同左 |
| HiThink／hithink-financial-api | 股票 | qfq、hfq | 通过 | 未实读 |
| HiThink／fund-market-historical | ETF | qfq | 通过 | 未注册 |
| BaoStock／baostock | 股票 | qfq、hfq | 修复后通过 | 修复后通过 |
| EFinance／eastmoney | 股票 | qfq、hfq | 修复后通过 | 未实读 |
| EFinance／eastmoney | ETF | qfq、hfq | 通过 | 未实读 |
| Yahoo／yfinance | 股票 | qfq | 实读失败：缺失价格 | 未注册 |
| Yahoo／yfinance | ETF | qfq | 未实读 | 未注册 |
| 富途／futu | 股票 | qfq、hfq | 修复后通过 | 未实读 |

共有 6 个提供方、10 个前复权精确绑定通过本轮完整窗口，另有 BaoStock 后复权通过。股票的 EFinance、新浪、BaoStock、富途为修复后新增通过的 4 个精确绑定。股票使用 `600519.SH`，ETF 使用 `510300.SH`；不外推其他标的、时段、资产或口径。

新增通过及补充读取的输入指纹：

| 精确窗口 | 指纹 |
| --- | --- |
| 股票 EFinance 前复权 | `a04bd4c771ce2828477ddf0e86d3b0d73248cd6e96c46919dfb06e78a78a1cc1` |
| 股票 AkShare 新浪前复权 | `c9e120aed84e18626f63786969c49e6ea17571565c8469ee3687d38c64d0b7c3` |
| 股票 BaoStock 前复权 | `ec32303cf48e99e72d7981c4fba5b05fa55ac9783d4ada78e9a42a3ef5568a7b` |
| 股票富途前复权 | `b70bbbd18b1eb9dfcb4a8e9b2b9e59285499432519304a4d1e6b9b49e6b93a96` |
| ETF AkShare 东方财富前复权 | `867bd21841bd1b638c444260031a3728d93ee3035c1f8cf3c62aa656a09146c3` |
| 股票 BaoStock 后复权 | `afdf3f49304869d148003440f61fb779d27a2802003fa1fc36d294c42f998eff` |

部分来源的公开量额单位仍为未知，这是生产响应保留的真实语义，不因研究日历接入获得单位转换或原始份额记账资格。AkShare ETF 本次公开 `fieldUnits` 为 `unknown/unknown`，其归一化序列读取通过不等于完整权益回报或真实份额执行。

## 调用预算与控制状态

实际来源逻辑读取共 24 次：HiThink 4、腾讯 4、EFinance 4、AkShare 4、BaoStock 3、富途 2、Yahoo 3。Yahoo 后两次补充了阶段／异常链诊断输入；未进一步重读。平台 429、本地覆盖拒绝、迁移时旧入口不存在以及 spawn 未发送请求均不计上游调用。

全部隔离窗口运行结束输出 `productionControlUnchanged=true`；最终只读 API 对账真实策略修订仍为 `197`。原失败任务 `ed08b1ad-82b3-4769-82f7-095a1925b5b3` 仍为 `failed`，本轮未新建真实回测，未修改历史记录。

## 验证记录

- DSA 来源及合同回归覆盖 18 个文件、1192 项：首次 1188 通过，4 个旧绑定范围预期需要随本次合同扩展更新；对应文件 22 项复验全部通过。没有生产代码失败被忽略。
- 诊断异常链脱敏及停用来源拒绝补充后，最终定向 4 文件共 75 项通过；未知上市多窗口、价格／来源错误、严格请求拒绝、缺日假设均覆盖。
- DSA `scripts/ci_gate.sh syntax` 与 `deterministic` 通过；源码边界、运行时合同及数据测试清单通过。迁移后的宿主诊断入口 3 项测试通过。
- 正式更新：在 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，兼容预检通过，退出 0，DSA 恢复 `healthy`，随后完成上述独立真实窗口读取。仅代码更新，未调整 Schema、依赖、数据库或外部卷。
- 镜像保持 `sha256:cbe278c43f707c4ce6deb9ce78b613691cd3e29cb1bbb1f4bdcf66b75fa40899`；修复位于容器可写层，未构建或发布新镜像。未提交或推送本轮改动。
- 独立比较 9 个本轮生产输入文件的宿主／容器 SHA-256 全部一致；最终诊断脚本编译及数据测试登记通过。新增受维护脚本通过标准输入执行，不依赖修改镜像打包合同。
