# E01-N2.1 净值来源与创建入口核查

## 结论

2026-09-30 完成当前源码、目标 DSA 和真实来源样本核查。现有基金行情显示接口可提供净值数值，但不能直接作为 N1 冻结合同要求的历史可见性证据。本叶仅完成核查和后续任务边界，N2 准备与写入保持未完成。

## 源码链路

| 层级 | 当前入口 | 已确认行为与缺口 |
| --- | --- | --- |
| 当前行情消费 | `apps/server/src/market/market.service.ts#getFundNavHistory` | 请求 `/api/v3/thesis-ledger/market/fund-nav/history`，使用行情缓存及可选 FundNavPoint 持久化；返回显示合同，不返回完整原文或逐条发布时间证据。 |
| 显示 Schema | `packages/schemas/src/market.ts#fundNavSchema` | 含 unitNav、navDate、provider、fetchedAt、freshness；unitNav 使用 number。没有 N1 所需完整来源修订、原文摘要、逐条发布时间或独立基金日历。 |
| DSA HTTP | 相邻 DSA `api/thesis_ledger.py#_real_fund_nav_history` | 路由到当前 gateway，筛选净值日期并生成 fetchedAt；日期超过七日标为 stale。这是显示新鲜度，不能直接解释为历史净值不可用或实际发布时间。 |
| 当前路由 | DSA `src/services/thesis_ledger_current_data_route.py` | 精确 `CN/MUTUAL_FUND/FUND_NAV_HISTORY` 可执行适配登记为 AkShare/eastmoney 和 efinance/eastmoney。没有登记 HiThink 场外基金净值执行能力；不能从 HiThink ETF 能力推导。 |
| 原始数据 | DSA `data_provider/eastmoney_fund_nav.py`、`efinance_fetcher.py`、`akshare_fetcher.py` | efinance 来源逐页校验后转换日期、单位净值等列；AkShare 使用单位净值走势。当前转换未保留发布时间原文和逐条发布证据。 |
| 现行准备 | `apps/server/src/backtest/backtest-run-preparation.ts` | 显式拒绝基金及非 exchange 策略，随后才创建 STOCK/ETF DAILY_BAR 请求；当前不是基金已经被成功映射成 ETF。 |
| 现行创建 | `apps/server/src/backtest/backtest-creation-guard.service.ts`、`backtest-configured-run.service.ts` | 守卫限制股票/ETF；配置解析与执行路由仍依赖场内价格合同。NAV 需要独立分支及准备证据，不能只修改 assetType 的三元映射。 |
| 当前日历 | DSA `/backtest/calendar` | CN 市场交易日历；没有绑定基金身份的估值日期和申赎处理日期合同。不能直接将市场交易日期当作基金完整日期事实。 |

本轮只读取相邻 DSA，不修改源码、Policy、准入或数据库；保留原有脏工作树。

## 目标运行态探针

在运行中的 `thesis-ledger-dev-dsa-1` 内调用本机 HTTP，Bearer Token 从进程环境读取，未输出凭证：

1. `GET /api/v3/thesis-ledger/capabilities`：HTTP 200；Data Contract 为 `[3]`、`serviceCapabilities.fundNav=true`。这个标志只声明服务接口存在，不证明精确路由已准入。
2. `GET /api/v3/thesis-ledger/control/policies/effective`：当前 revision=31；`projection.effective.routes` 没有 FUND_NAV_HISTORY 路由。
3. `GET /api/v3/thesis-ledger/control/routes/capabilities?contractVersion=3`：目录 integrity=complete，43 条 entries，catalogRevision=`4380298194303938`。净值历史候选如下：

   | Provider | upstreamSource | state |
   | --- | --- | --- |
   | akshare | eastmoney | not_admitted |
   | efinance | eastmoney | not_admitted |

4. `GET /api/v3/thesis-ledger/market/fund-nav/history?symbol=110011.OF&start=2026-09-08&end=2026-09-15&limit=20`：HTTP 503，code=`no_eligible_provider`，requestId=`32c02ed1-49cd-460f-96fa-9278639f2597`。未取得可冻结的 DSA 净值响应。

首次目录查询未携带 contractVersion，返回 422；按当前协议补上 `contractVersion=3` 后成功。最终结论读取的是 entries 和嵌套 effective projection，不能从顶层不存在的 rows/routes 判断来源数量。

## 真实来源样本

使用现有 efinance 适配器引用的东方财富 `FundMNHisNetList` 地址，按现有请求参数读取 `FCODE=110011` 的第一页 20 条。该请求仅作为来源核查，未绕过准入生成 Run 或冻结产物。

- HTTP 200、Success=true、TotalCount=4410，本页 20 条。
- 日期覆盖 2026-09-02 至 2026-09-30，包含目标窗口 2026-09-08 至 2026-09-15。
- 行字段：`DWJZ`、`FSRQ`、`JZZZL`、`LJJZ`、`MUI`、`NAVTYPE`、`RATE`、`SYI`。
- 样本：FSRQ=`2026-09-30`，DWJZ=`4.0054`，LJJZ=`5.7954`。单位净值原值是字符串，可为后续精确十进制读取保留。
- 该响应字节 SHA-256：`4a92bbff944487d927253a2fd18b7d12fe6493556dd7996bc6d17588639bedc7`。
- 本页字段没有明确声明逐条发布时间。本次未为未知字段赋予发布时间语义，也未把 FSRQ 或本次抓取时刻改写成发布时间。

这是单页实时观察，原始完整响应未归档，不是可重放 Snapshot、完整历史覆盖或 PIT 准入证据。它证明该样本可返回净值数值及当前字段边界；不证明所有可能的东方财富/基金公告接口都缺少发布时间。

## 后续责任与门禁

1. N2.2：真实证据取得方式。核验可明确说明发布时间/首次可见时刻的净值记录及独立基金日期来源，形成可复核原文样本和语义合同。现有显示数据不能满足该启动条件；若改变时间语义，先更新 Spec，不能隐式降级。
2. N2.3：精确净值证据生产合同与 DSA 生产者。绑定 RouteKey/Target、策略与来源修订、十进制净值、发布时间记录、原文和日期覆盖；未知/缺失/未来事实失败关闭。只在 N2.2 的语义与样本就绪后展开执行包。
3. N2.4：Server 精确 Reader 与配置准备。单向消费来源协议，核对 Desired/Effective/Catalog/Admission，并绑定完整 N1 计划。缺路由、撤销、来源不符和不完整记录拒绝；不调用显示缓存补齐冻结事实。
4. N2.5：当前 Run 创建守卫及冻结关联持久化。使用 NAV 配置/准备证据与当前状态机；公开投递需等待 N3 的最小 NAV 执行分支就绪。具体写入/队列边界在 N2.4 合同稳定后展开，不能投递给只支持场内的 Worker。
5. N2.6：隔离 PostgreSQL 创建与冻结验收。验证来源证据、原子关联、篡改拒绝及失败状态；目标部署、真实 Worker 和客户端由 N3/N4 验收。

N3 的离线执行分支可从已完成 N1 合同独立启动；其 Worker 闭环再依赖 N2.5 的创建/存储合同。不得将 N2 整组完成作为 N3 离线分支的启动前提，同时又要求 N3 就绪后才完成 N2，以免形成依赖环。

## 复核

本叶完成断言是来源与入口盘点、目标 HTTP/目录核验、真实来源样本及后续门禁划分。没有修改运行代码，因此不重跑测试、构建或 Docker 更新。真实数据数值可取、精确路由未准入、历史可见性证据未提供是三个独立结论；N2 及基金回测业务能力保持未完成。
