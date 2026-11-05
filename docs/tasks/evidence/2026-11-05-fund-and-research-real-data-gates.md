# 基金盘中估值与研究复核真实数据门禁核对

核对日期：2026-11-05，北京时间 15:57 起，16:10 汇总。对应[基金任务](../2026-11-04-fund-intraday-valuation.md) G2.2 / AC6，以及[研究任务](../2026-10-18-research-evidence-evolution.md) T13c / G4b.3。本文保存本次观察，当前执行状态仍由各 Task 所有。

后续接续：用户随后仅授权补充基金持仓路由，已于16:20保存修订188；执行与披露候选准备见[后续记录](2026-11-05-fund-holdings-route-and-disclosure.md)。本文的修订187、路由未选及未授权事实属于上述较早核对时点；研究门槛保持。

## 执行范围与证据输入

复用当前脏工作区、原 Spec、Review 与[研究历史验收](2026-10-31-research-comparison-and-ui-closeout.md)。北京时间 15:57 已过研究窗口终点和基金交易时段；未沿用凌晨的“零行”快照判断今日事实。只读查询目标 PostgreSQL、Redis、DSA 控制数据库与现有 API；四次缓存控制上下文读取不调用外部来源。没有提交新的研究观察、模型请求、来源探针、通知或估值回填，没有修改 Provider、路由、准入、凭据、任务启用值或暂停状态。

机器证据目录：`.recovery-artifacts/two-gates-20261105/`。包括 `fund-points.json`、`fund-nav.json`、`api-0.json`～`api-3.json`、`schema.json`、`jobs.json`、`report-list.json`、`report-detail.json`、`observation-current.json`、`observations.json`、`observation-versions.json`、`price-basis-inventory.json`、`qualified-price-candidates.json`。正文保留关键事实，不依赖临时文件才能理解门禁结论。

Server 镜像仍为 `sha256:5495bb265402d8d5ab2f738a9f2639927a9b94cf57c53c5f4444dbed907f6e3f`；本次读取时 Server、Backtest Worker、DSA 均健康。结构 head 仍为 `20261104010000_fund_intraday_valuation`。这些只证明运行与结构状态，不证明来源或估值成功。本次没有源码、依赖、数据库结构或启动入口变更，不执行 Docker 更新，也不重跑输入未变的构建、受控测试或隔离数据库验收。

## G2.2：已积累真实分钟事实，但有效估值为零

目标 `FundValuationPoint` 已有 **240 行**，全部属于 `000001.OF / disclosed-holdings-qfq-v1`，覆盖北京时间 **09:30–11:29、13:00–14:59**。记录并非零行，但全部 `quality=unavailable`、`reasons=[source_unavailable]`，`lastValidAt` 和 `lastValidSnapshot` 均为空。

| 真实分钟（北京时间） | 观察记录时间 | 价格时间 / 估值计算时间 | 估算净值 / 涨跌 | 披露 / 定价覆盖率 | 记录证据 |
| --- | --- | --- | --- | --- | --- |
| 11-05 09:30 | 对应 01:30 UTC | 均为 null | 均为 null | 0 / 0 | `source_unavailable` |
| 11-05 09:31 | 对应 01:31 UTC | 均为 null | 均为 null | 0 / 0 | `source_unavailable` |
| 11-05 14:59 | 对应 06:59 UTC | 均为 null | 均为 null | 0 / 0 | `source_unavailable` |

观察记录时间是失败采样的记录时刻，不能解释成成功估值计算时间。没有两条有效价格和估值可比较，因此没有可报告的估值变化。

北京时间 16:00 的真实接口读取：

- 两只基金当前接口均 HTTP 200，`marketState=closed`、`quality=unavailable`、`reasons=[market_closed]`，估算值及价格/估值时间均为 null。闭市未造点。
- `000001.OF` 今日接口 HTTP 200，日期 `2026-11-05`、时区 `Asia/Shanghai`、240 个真实失败点，与表中数量一致。
- `161725.OF` 今日接口 HTTP 200、0 点；本次没有为补齐数量主动生成盘中点，不能声称该基金已经采样成功。
- 既有“盘中估值采样”任务保持启用，cron 为 `* * * * *`；最后交易时段执行时刻为 14:59。分钟任务成功运行与估值来源成功是两项不同断言。

### 来源阻塞与最小解除条件

实际保存策略当前为修订 **187**；`FUND_NAV` 与 `FUND_NAV_HISTORY` 已选择 `akshare / eastmoney`，但 **没有 `FUND_HOLDINGS` 路由**。两只基金的目标 DSA 缓存控制接口均返回：

```json
{"capability":"FUND_HOLDINGS","policyRevision":187,"ready":false,"reason":"not_selected"}
```

同一检查中的 `FUND_NAV` 为 `ready=true / reason=null`。只读政策历史显示 183、184、185、186、187 均未包含 `FUND_HOLDINGS`；185 于 11-05 00:41:47 北京时间形成，186/187 于当日 12:55/12:57 形成。因而当前“未选择持仓来源”有明确控制事实，并与全天失败相符；旧分钟证据只保存了通用 `source_unavailable`，不能追溯声称每次失败均已记录了具体来源阶段。

AKShare 当前来源登记支持的最小候选配置差异为：

```json
{
  "key":{"kind":"data","market":"CN","assetType":"MUTUAL_FUND","capability":"FUND_HOLDINGS"},
  "targets":[{"providerId":"akshare","upstreamSource":"eastmoney"}]
}
```

**该差异仅供审查，未保存或应用。** 用户要求保持 Provider／路由配置，本轮不能自动新增此路由。改变路由还会影响已启用的采样消费者，不能将“加一条配置”解释成只授权一次上游请求。后续若授权此变更，应先复核届时最新策略、实际来源请求预算及消费者影响，再执行；本次修订187不能作为覆盖后续配置的固定写入基线。

来源用途为取得披露持仓，候选端点为 `akshare/eastmoney:fund_portfolio_hold_em`。源码每个基金先查当年，只有空结果才查上一年，最多两次年度来源查询；取得非空坏合同或错年即停止。此清单不构成本轮调用授权，也不把现有股票报价/复权路由的后续消耗包含在内。本轮未发起这些来源请求，没有新增付费请求或使用旧模型实验额度。

路由可用后仍须逐项满足真实披露、CNY、同一复权口径和五分钟报价时效，不能因控制门槛解除就宣布估算成功；无合格披露或有效覆盖时继续记录实际原因。下一有效交易日须取得至少两个实际分钟的价格、计算时间、覆盖率和来源证据。

### 正式净值与误差

本次 PostgreSQL 中两只基金自 11-03 起没有 `FundNavPoint` 行；这不等于宣称来源没有正式净值。只读 Redis 已有 `000001.OF` 当前正式净值缓存，最新读取记录的 `fetchedAt=2026-11-05T08:00:15.859370Z`，但实际 **`navDate=2026-11-04`、`unitNav=0.982`、provider=akshare、freshness=delayed**。该记录来自既有运行消费者，本轮未通过刷新接口额外请求来源。抓取时间不能代替净值日期。

本地尚未读到 11-05 正式净值，而且本日最后有效估算不存在。因此绝对误差 `abs(最后有效估算净值 - 同日正式净值)` 和相对误差 `(最后有效估算净值 - 同日正式净值) / 同日正式净值` 均为**不可计算**；不以零、11-04 锚点或旧误差样本代填。即使稍后公布 11-05 净值，也无法补造今天缺失的有效估算。

## T13c / G4b.3：窗口已到期，经济价格资格未解除

目标正式报告列表 HTTP 200，共18条、`hasMore=false`，仍为原3份 `available / V2`；10-23旧报告仍为 `invalid`。最早可用报告 `898c9071-9c70-4cb8-9887-cd73971e8eac` 的正式详情 HTTP 200，冻结 `result.createdAt=2026-10-29T04:06:31.607Z`，即北京时间12:06:31；没有将任务创建时刻误当报告生成时刻。固定第0日10-29、第5交易日11-05，终点 `2026-11-05T07:00:00Z`，本次核对时已到期。

只读 `MarketBarWindowEvidenceV3` 有127个全市场窗口；境内仍是 **HiThink68、腾讯31、TickFlow1，共100个**，均为 `basisScope=provider-defined / dividendMeaning=provider-defined`。筛选境内不同口径候选为0，没有新增固定复权锚点和已验证分红经济含义材料。该输入未变，复用原拒绝资格结论；不重复请求已知不合格来源，不把 qfq、已收盘或 elapsed time 等同于经济价格合格。

观察 GET HTTP 200，`asOf=2026-11-05T08:02:49.931Z`。统计为 `samples=1 / dueSamples=1 / calculatedSamples=0 / notDueSamples=0 / directionMatchRate=null / sampleStatus=insufficient`。保存的当前版本仍为 `3e276d22-dd56-4a05-9d7a-68722cb1f806`，输入截止仍为 `2026-10-31T15:35:36.757Z`，评价仍为当时的 `not_due`，起止经济价格和收益均为 null。当前时钟的到期统计与旧冻结版本的未到期评价不矛盾，读取接口按合同不自动刷新或覆盖旧版本。

本次没有 POST 新观察：价格输入未变且已知不合格，真实重新提交会沿现行 Market Reader 请求来源，不能为取得一条拒绝回执重复请求。未到期、幂等、历史及模式隔离复用原验收；未将本次 GET 或原浏览器证据计作正向经济价格验收。

最小解除条件：同一报告及固定窗口的合格经济价格材料，包含固定复权锚点、已验证分红经济含义、完整端点覆盖和合格可见时钟。材料具备后，通过原显式按需接口、全新 submissionId 和实际截止时点追加版本，核对起止价格、收益、去重统计及目标浏览器；旧版本必须仍可读。用户此前确认“暂无，保留现行门槛”，本次保持该决定。P3已结案，T16a/T16b/G5不适用，不重开模型实验。

## 复核结论与保全

本次结果为**真实数据验收阻塞**：G2.2 缺可用持仓路由及真实有效分钟/同日误差；T13c/G4b.3 的时间条件已满足，但仍缺合格经济价格。两份 Task 保持活动正文、原未勾选状态，不转入 TODO、不归档，也不建立归档跳转壳。

本轮实际写集限于验收文档、关联入口和忽略目录内的只读证据；不修改应用源码或运行配置。`protected-before.json` / `protected-after.json` 的16张表计数和逐行聚合摘要全部一致，覆盖账户、持仓、交易、账本、Journal、AiRun/Tool/Invocation、模型配置、路由及三张研究观察表；这一保全区间起于本轮只读诊断中途，不冒充全天无变化证明。最终 `source-control-readonly.json` 仍为修订187、无持仓路由，`final-protection.json` 记录三容器健康、暂存文件0及本轮请求计量。并发任务及正常调度产生的变化独立记录，不能把本轮未发起来源请求写成整个系统没有来源请求。Git 不暂存、提交、推送、reset或清理。

本轮修改的六份文档共300个相对链接路径核对无缺失，`git diff --check` 通过；未跟踪文档另核对尾随空白。该检查不等同于所有历史锚点或业务验收通过。Spec稳定合同没有变化，不因两项均受真实输入阻塞而降低门槛。最终一致性结论：本轮事实与当前Task已对账；总体验收仍阻塞，不符合归档条件。没有启动自有服务、浏览器或临时容器，无此类资源需要清理；机器证据留在被忽略的恢复目录，不作为源码产物加入索引。

前置诊断中一次使用默认 `postgres` role 被拒绝（目标实际 owner 为 `thesis_ledger`），一次复杂 Shell SQL 引号错误及一次本地清单脚本括号错误均发生在查询执行前；随后改用明确只读事务及 stdin 执行，成功取得上述事实。初次研究请求遗漏 `/api/v1` 前缀返回404，按实际路由修正后正式读取200；没有把这些检查脚本问题判断为产品或 Provider 故障。
