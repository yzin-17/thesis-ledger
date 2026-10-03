# 159516 图表入口的目录身份阻断

## 目标观察

目标 Server 的 Catalog 状态为 generation 28、5920 条目录记录、`readinessState=stale`；`159516` 搜索返回空列表。数据库保留 `159516/SZ/ETF` 旧记录，但 `active=false`，没有相应 `Asset`。`MarketDetailService.resolveIdentity` 只接受资产、已确认且活跃的关联或活跃目录记录，因此当前标的被识别为 `UNKNOWN`。对目标 Server 请求 `/api/v2/market/159516.SZ/chart-options?barsLimit=59&planEnd=2026-08-07` 返回 HTTP 400、`assetType、timeframe 或 adjustment 不支持`；这不代表 HiThink 精确回测路由失效。

目标目录 Job `93e14fc7-f23c-48ac-8e5c-27cc5ed62b55` 在 2026-09-28 15:19:59 UTC 失败，稳定错误码 `catalog_all_providers_unavailable`，未被 Server 确认；目标 DSA 日志显示 AKShare 与 Efinance 目录提供方失败。目录构造要求每个 Provider 的全目录完整成功，两个 Provider 都没有可提交的 snapshot。当前状态的最近尝试时间晚于该 Job；同前提反复发起同步不会提供新的身份依据。

2026-09-29 复核目标现状：Catalog 仍为 generation 28、`stale`，最近尝试时间为 `2026-09-28T16:50:27.992Z`。新的目标 Job `adffd916-9fea-4a72-af27-07eac0ee67ad` 已终态 `failed`、`acknowledged=false`，错误仍为 `catalog_all_providers_unavailable`；同次 DSA 日志分别记录 AKShare 与 Efinance Provider 请求失败。本次只读核对既有 Job，没有再触发同步。

定向诊断进一步确认失败发生在外部目录请求：目标 DSA 容器无代理环境变量，直接调用安装版 AKShare `fund_etf_spot_em()` 得到 `ConnectionError`，远端在响应前断开连接；Efinance `stock.get_realtime_quotes()` 得到 `JSONDecodeError`，没有可解析的目录响应。宿主隔离调用中，AKShare 股票代码名称目录返回 5,569 行，但 ETF 调用经宿主 `127.0.0.1:7890` 代理失败，Efinance 股票仍为 `JSONDecodeError`。宿主股票成功不能替代目标容器的 ETF、股票与基金完整目录。两组探针只返回行数、列名或异常类型，没有保存上游正文，也未写入目标目录；本次没有再次触发 Catalog Job。

## 边界与后续

已有真实 Run、HiThink ETF 前复权 RouteAdmission 和 Data V3 读取不为目录中的旧 ETF 行重新签发 `active` 身份；不通过直接确认旧行、手工改库或放宽 `resolveIdentity` 活跃条件绕过目录门禁。恢复需取得完整可信的目标目录快照并由正式同步流程写入，随后重新验证搜索、chart-options、图表读取及目标浏览器/Electron 交互。U04/G-UI 父项继续开放，本证据只记录该标的当前无法从目录进入图表的根因。
