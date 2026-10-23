# 统一数据能力适配层实施任务

<a id="priority"></a>

> 排期（2026-10-21 接续）：**P1｜核心消费者与来源剩余门禁**。Market Consumer 五类消费与当前精确 RouteTarget G1 已完成，H07 保留 Tushare 原权限条件；RQData 按用户决定延期至 TODO。涉及 IR02/IR03～IR06/IR09/IR10 的消费场景链接对应 [P0 修复](README.md#priority-p0)；外部权限缺口不阻塞无关已授权工作或引发重试。
> [全局优先级与接续规则](README.md#priority-policy)。原任务编号与验收条件保持，以下状态只按实际证据更新。

> 任务标识：`unified-data-capability-adapter`；首次日期：2026-10-09；文档精简：2026-10-15。
> 当前状态：框架、迁移、已选切片、Market Consumer 共同消费与当前精确 RouteTarget G1 完成；账号等级与本地权限记录已实现，分层结果见下方 TAP。当前账号 120 分，未包含接口不列为本轮强制实源验收；H07 的历史现金正向消费未通过记录保留，RQData 原实源验收已延期至 TODO。10-21 获准受控切源、恢复与实际 Web 已通过，政策/DSA 166、原路由恢复；独立来源与业务验收不由此代收。
> [现行 Spec](../specs/2026-10-09-unified-data-capability-adapter.md) · [来源合同](../specs/2026-10-09-unified-data-capability-source-contracts.md) · [来源与路由矩阵](../reviews/2026-10-10-provider-adaptation-and-route-matrix.md) · [完整历史](../archive/tasks/2026-10-09-unified-data-capability-adapter-history.md)

## 现在做什么

当前执行：按 [账号等级与本地权限保存规格](../specs/2026-10-09-unified-data-capability-adapter.md#account-access-persistence)完成下列独立阶段；[统一证据](evidence/2026-10-21-provider-account-level.md)记录命令、结果与限制。2026-10-22 已使用现有 Key 保存用户确认的120分，实际 daily 检查通过，其余五项零请求跳过，权限记录落盘；随后按用户授权启用，configVersion=3，实际页面仅显示当前可用的股票日线，原路由不变。未包含接口不强制验证；RQData TODO 维持。

| 阶段 | 状态与写入范围 | 完成条件与验证 |
| --- | --- | --- |
| TAP1：状态与本地存储 | 完成；DSA 权限记录、来源等级规则及共享 Schema | 26 项定向及 407 项扩展回归通过：等级过滤零请求、配置隔离、事务回滚、坏记录拒绝、预算边界及物理进程重启恢复 |
| TAP2：配置执行面 | 完成；DSA 配置 API、Server 与客户端合同 | 先检查后保存、同输入结果复用、并发变化拒绝和草稿不发布通过；120 分只检查 daily，其余五项零尝试 |
| TAP3：功能消费面 | 完成；现有凭证侧栏、功能说明和路由选择 | 前端 25 项及最终构建通过，实际页面保存/重开/重启恢复/重新检查与 390、768、1280 像素检查通过；显示等级、最近检查时间和更新入口 |
| TAP4：目标与页面验收 | 完成；正式更新与目标 API/页面 | 正式 update.sh all 退出0；新镜像/16文件摘要、API/真实页面、目标隔离权限落盘与双进程恢复通过；六卷及原业务/研究数据留存通过。完整调用参数、首次网络失败及最终结果见统一证据 |

| 范围                                           | 真正剩余工作                                         | 接续条件                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| H07/K37                                        | 保留 Tushare 原正向生产消费未通过记录                | 当前 120 分不要求验证 fund_div；升级后实际权限及原准入条件具备时接续，条件未变时不重复请求 |

[RouteTarget G1](#route-target-acceptance)已完成当前精确窗口的冷主源、成功备用延迟及 AC4/6/8 对应；[Market Consumer G1](#market-consumer-acceptance)已完成五类共同消费。输入未变时复用现有证据，不重复作为待办。

只执行所选范围。H07 的外部阻塞不作为其他消费面的统一前置，其他消费面通过也不关闭原 H07 正向义务。已完成 TF-F、TA、K37f-R、K37b-R、K37-C、K38 和 H08～H12 不重复执行；193 条已完成叶的原编号、条件与证据保留在完整历史，本页不再维护其摘要副本。

### 9.5 当前未完成执行包与阻塞

<a id="rqdata-deferred"></a>

RQData 原 `H07-K37c-live` 已按用户 2026-10-21 决定延期至 [TODO](../TODO.md#rqdata-live-consumption)，范围依据见 [Spec](../specs/2026-10-09-unified-data-capability-adapter.md#source-scope-20261021)。真实账号消费尚未通过；已过代码、合同、来源错误和目标 `credential_missing`/零尝试层保留。[原执行范围与证据](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-71)继续供后续立项追溯。

Tushare 适配实现与账号可用性分开：用户已提供现有 `TUSHARE_API_KEY`，同凭据 `daily` 单日成功；历史 `fund_div` 实际 HTTP200/40203 和 `fund_daily` 明确拒绝。权限采用 [Spec 的指定表格及逐接口规则](../specs/2026-10-09-unified-data-capability-adapter.md#source-scope-20261021)，`fund_div` 文档门槛为至少 400 积分；用户当前明确账号只有 120 分，故该接口不纳入本轮账号配置功能的强制验证。积分由用户填写，不声称从接口查得；有效期与独立权益以官网及范围内实际检查为准。2026-10-22 目标已加密保存凭据、120分与本地权限，daily 实际通过，五项未包含接口跳过；随后按用户授权启用、configVersion=3，实际页面仅显示可用股票日线，未选路由且无现金合法准入。只有 `fund_div` 权益事实变化、合法权限证据与原前置到位后才复验，条件未变时停止，不再询问 Key。

Tushare 的真实正向条件仍阻止 K37 父项完成；RQData 已转为后续范围。HiThink与东财普通研究切片已通过，不阻止H08–H12已通过机制。公告a-live、拆分d-live不重复；拆分两事实/真实信封/实际完成截止/离线消费已过，coverage=false/原完整冻结及Runner独立受阻保持。解除完整收益须原窗口覆盖证据，不能买账号、重复两事实、读全页面或改complete代替；不重开已取消全历史任务，覆盖与冻结合同保持。

## 未通过的原责任项

- [ ] H07-K37-event-batches：七事件实现/来源绑定及中央分派退役已齐；公告a-live、拆分d-live及普通研究新合同下的HiThink f-live、东财b正向层已过。Tushare e-live 仍受外部条件阻塞，父项保持开放；RQ c-live 已延期至 TODO，不记为验收通过。[东财证据](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37b-research-v2)。
  - 证据与原执行范围：[原§9.69](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。
- [ ] H07-K37e-live：Tushare真实现金消费；用户已提供现有 `TUSHARE_API_KEY`。既有独立 `fund_div` 实际 HTTP200/40203 拒绝，同凭据 `daily` 单日成功，`fund_daily` 亦明确拒绝。权限依据和至少 400 积分门槛见 [现行 Spec](../specs/2026-10-09-unified-data-capability-adapter.md#source-scope-20261021)，实际权益变化及原准入条件具备后才接续。目标已加密配置并启用120分账号，daily检查通过，fund_div本轮跳过；未选路由且无现金合法准入，现金正向生产消费未过。[精确核查](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)与[当前启用及页面证据](evidence/2026-10-21-provider-account-level.md#2026-10-22-启用与当前等级页面核对)。
  - 证据与原执行范围：[原§9.73](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-73)。

## 后续实施约束

执行前核对实际源码、现行范围与环境，只处理选定的精确切片；保留能力合同、冻结版本、用户路由、配置与凭据，不清库或改账户 Ledger。主仓拥有能力合同、产品读模型及消费者；DSA 拥有来源实现和运行机制；infra 负责必要部署。稳定合同以 Spec 为准，不在此复制。

验证按定向 → 受影响包 → 边界/依赖门禁 → 必要真实目标递进。旧命令和工作树数量只是原时点事实；输入未变的有效证据可复用，改造前结果不能冒充改造后通过，拒绝路径不能替代正向消费。没有新输入与明确执行范围时不自动启动来源、部署或已取消任务。

## 已完成范围与证据

| 范围                        | 可复用结果及边界                                                                                                                                                                               | 证据                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H07 实现、K38、H08～H12     | 原范围实现/逐能力、代码/合同/正式目标及有界机制已完成；不消除上述 K37 正向条件                                                                                                                 | [最终分层对账](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)                                                                                                                |
| HiThink K37f-R、东财 K37b-R | 普通现金研究、新 Run/快照、实际展示/导出、独立计算和离线重放已过；不再等待旧严格 live 或窗口人工审批。HiThink 原值 2 未知、东财缺公告日/状态、历史覆盖未知；未核对事件默认排除或按显式假设模拟 | [HiThink 执行包](../archive/tasks/2026-10-09-unified-data-capability-adapter-history.md#k37f-r普通-hithink-分红研究执行包) · [东财证据](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37b-research-v2)         |
| K37-C / C1～C6              | 新准备采用登记截止成交持有份额 v2，原模型仅供旧冻结重放；真实计算、页面/下载和新旧断网重放已过，正式镜像固化已完成                                                                             | [规则与验收](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-v2) · [镜像复验](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-image-solidified)  |
| TickFlow TF-F1～F4          | 免费历史三绑定、沪深六组有限口径、新消费/快照及重放、正式 `update.sh dsa` 与目标复验完成；原完整服务四绑定保持。库存 20/143；仅声明本范围历史日 K，单位/锚点与全历史可见性限制保留             | [实源及消费](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-tickflow-free-history) · [镜像复验](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-tickflow-free-image-solidified) |
| Tushare TA1～TA5            | 六接口账户功能控制、目标 API/页面、正式 `update.sh all` 和运行态复验通过，原空间阻塞解除；权限提示可用不表示现金接口成功消费                                                                   | [原任务与逐项结果](../archive/tasks/2026-10-09-unified-data-capability-adapter-history.md) · [精确权益核查](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)                     |

AC01～AC20 与来源专属断言由现行 Spec 维护。过程、真实写集/版本、原命令、失败与修正分别查[实施日志](../archive/reviews/2026-10-11-unified-data-capability-implementation-log.md)、[来源迁移证据](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md)及[运行证据](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md)，不维护第二套当前进度。

<a id="route-target-acceptance"></a>

## RouteTarget：现行路由接续验收

[原 Task 与历史证据](../archive/tasks/2026-09-16-market-data-route-target-v2.md)的 T1～T3、旧 Docker 与当时冷主源结果保留。稳定路由合同以本主题 [Spec](../specs/2026-10-09-unified-data-capability-adapter.md)及 [Canonical](../archive/specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)为准；[旧 V2 Spec](../specs/2026-09-16-market-data-route-target-v2.md)保留断言追溯，不恢复默认主备或 handshake。

- [x] G1：真实 Provider 与目标级性能/运行态门禁
  - 覆盖验收标准：AC4、AC6、AC8
  - 依赖：T1、T2、T3；需要当前 DSA、Server 源码和目标配置。
  - 当前适用范围：现行已启用、获准的精确来源路由及主备；旧 Tencent 默认主目标/强制 AkShare/EastMoney 分支已被替代，不恢复用户跳过的来源。
  - 完成条件：目标级调用、失败回退和真实 provenance 通过；冷主源 ≤5s、主源失败备用成功 ≤10s。
  - 验证方式：真实 Provider smoke 与目标运行态请求；fixture 不可替代。

Canonical E02/E04 和共同价格四条 Run/三口径已有路由、主备与 provenance 的接续证据。10-17 对当前选中绑定强制新鲜读取：`510300.SH` ETF/qfq/1d、`2024-07-15～19`、`refresh=true`，HTTP 200、5 个准确交易日、`servedFromCache=false`，HiThink / `fund-market-historical`、routeIndex 0、policy 154，耗时 370ms，满足该精确窗口主源 ≤5s。原始回执 `.recovery-artifacts/portfolio-pnl-2026-10-17/route-primary-fresh.json`；它不代表新建进程冷启动，也不替代其他绑定或失败回退。

10-21 新进程主源冷态已补：同一精确 HiThink ETF/qfq/1d 五日窗口，正式鉴权 ASGI、首次 Runtime/适配器，整个专用进程 1537.267ms、请求 303.489ms，HTTP 200/五日完整/真实来源，原保护不变。[回执](evidence/2026-10-21-route-cold-primary.md)明确不启动额外后台生命周期、不代表正常服务完整停启，也不扩大至其他来源。

10-17 时点剩余独立缺口是失败后成功备用 ≤10s 测量及其原 AC4/6/8 对应；两秒 Run 终态不等于请求延迟。当时维护入口的只读预案通过，ETF qfq 仅选 HiThink，腾讯候选就绪；用户选择“先保留该项未完成”，故未写临时 policy 或停用来源。该暂停记录保留为历史时点。AKShare/EastMoney 用户跳过保持有效，不要求启用、采购或强制恢复该分支。

2026-10-21 用户明确恢复后，正式入口的 16 项定向验证、受控切源、恢复后主源重读与实际 Web/数据保护均通过。三次真实五日非缓存请求分别为 HiThink 401.508041ms、腾讯备用 453.987167ms、恢复后 HiThink 307.090791ms；备用为第二目标，满足 ≤10s，冷主源复用上段 1537.267ms。政策 164→165→166、HiThink 配置 7→8→9，原 16 条路由与启用状态恢复；15 账户/13 表/57 个 V3、草稿/资产摘要相等，模型计数全 0。G1 按当前适用范围关闭，[完整回执及 AC4/6/8 对应](evidence/2026-10-21-route-failover-acceptance.md)保留受控停用与真实网络超时的证据边界。主线程执行、只验 Web、真实模型暂停、DG3 TODO、截图暂缓保持；其余 H07 正向权限条件仍未通过。

<a id="market-consumer-acceptance"></a>

## Market Consumer：真实消费接续验收

[原 Task 与历史证据](../archive/tasks/2026-09-16-market-data-consumer-consistency-v2.md)的 T1～T5、隔离事实读写、Redis 和目标结构结果保留；[原 Spec](../specs/2026-09-16-market-data-consumer-consistency-v2.md)继续提供消费断言。Reader、隔离账本及当前拒绝/读取已有 Canonical E01/U02/D02 和共同价格接续证据。

- [x] G1：消费者集成与当前 Docker 运行态门禁
  - 覆盖验收标准：AC6
  - 依赖：T1–T5；Phase 1/2 代码已进入同一运行版本且保留事实已恢复。
  - 涉及范围：Risk、Performance、Backtest、Portfolio、Automation 真实调用链；不替代单元和边界测试。
  - 完成条件：目标 Docker 版本、迁移状态、路由和 acceptance 证据一致；未通过项保留阻塞说明。
  - 验证方式：按验证阶梯匹配定向、包级、仓库与真实消费证据；需要目标更新时按 infra 规则选择最小适用入口，不因旧命令记录默认执行完整更新。
  - 10-17 当前执行叶已完成：Risk 最近收盘价格只取必要单日，最长持有期仍完整读取真实开仓窗口；修复实时读取的可得性上限和预览漏传持有周期需求。现有 `600000.SH` 已知上市事实/2026 日历/HiThink 主源真实消费通过，三条规则均正常求值。未启用规则、通知或故障切换；显式历史评价和自动扫描不因实时预览而放宽。正式快照冻结输入与幂等修复见 Portfolio R3.I1–I3。

10-17 目标已通过官方完整更新恢复，随后 Web 跳转修复通过正式快更同步；当时政策 revision 154、`applied`、`effectiveStale=false`。10-20 获准临时基金 NAV 接口实读后恢复原全部绑定，现行政策 156、`applied`、`effectiveStale=false`，原 11 张业务保护表与 57 个 V3 结果未变；[本次接口证据](evidence/2026-10-20-fund-nav-source-acceptance.md)不关闭下列业务父门禁。按消费者保留以下边界，不重复适配器探针或已过业务：

10-21 接续：[基金正式校准/Web 日线](evidence/2026-10-21-fund-calibration-acceptance.md)与[真实披露/维护分钟/Web](evidence/2026-10-21-fund-disclosure-acceptance.md)已补齐当前精确基金/季度的消费；后续[复权分钟与误差](evidence/2026-10-21-fund-adjusted-returns.md)补齐当前算法口径，政策 162、`applied`、非 stale，原 16 条路由恢复。三项新专用基金账户结清停用、审计/修订/点位保留，原 13 张表/57 个 V3/旧点位保护通过。原严格收尾的正常目录刷新及验收脚本失败均保留独立复核，不冒称原执行一次无误。

| 消费面      | 可复用的实际证据                                                                                                                                                                                                                                                                                                 | 仍未覆盖的条件                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backtest    | 自有 `600519.SH` V3 Run `3f3691ae-a025-40a9-8cc6-4ad1ee96ca81` 成功，执行/信号/基准均冻结 HiThink、policy 154；[回执与结果](evidence/2026-10-17-ui-runtime-closeout.md#策略启动与后台反馈)。                                                                                                                     | 该精确前复权固定序列窗口已过；不扩展为全部市场/来源或真实历史规则。其他绑定复用其现有证据。                                                                                                    |
| Risk        | 自有 100 股持仓、平均成本 10，HiThink 不复权完整日线收盘 9.73；止损/止盈值 -0.027、持有周期 1，三条均 `not_triggered`，价格与可得时点均有值。单日与完整开仓窗口均选中，账户已清仓停用，见[当前回执](evidence/2026-10-17-ui-runtime-closeout.md#股票正式校准与-risk-正向消费)。                                   | 本例已覆盖 Reader 正向消费；未创建风险应用、启用规则、写事件或发通知，不充作这些独立业务验收，也不代表全部市场/来源或历史评价通过。                                                            |
| Performance | [收益 G1](evidence/2026-10-17-portfolio-pnl-directory-consumers.md)含真实 FX、Trade Close Slice 和缺失降级；股票及[基金正式校准](evidence/2026-10-21-fund-calibration-acceptance.md)验证冻结输入、修订链及幂等；[基金披露和维护分钟](evidence/2026-10-21-fund-disclosure-acceptance.md)已有独立实源及 Web 证据。 | 当前精确基金/季度、qfq 与跨日误差通过；[原组合十九项 AC](evidence/2026-10-21-portfolio-final-acceptance.md)已对账归档。其他主题事实/日历条件继续由各自原任务承担，不扩大为全部基金或历史 PIT。 |
| Portfolio   | 同一收益记录覆盖真实行情/FX、清仓现金态和降级；Safari 真实触屏、股票点位、基金日线及两个维护分钟均有对应证据。                                                                                                                                                                                                   | [组合原十九项 AC 最终对账](evidence/2026-10-21-portfolio-final-acceptance.md)已通过并归档；维护采样不冒称现场开市调度，其他主题的历史事实仍按原任务保留。                                      |
| Automation  | Scheduler 真实进程、现金与受管快照证据复用；10-21 正常受管正式校准实际处理唯一自有基金估算，succeeded/attempt1、释放租约、真实 NAV、冻结输入及 Web 扫描1/正式化1/待补齐0通过。[回执](evidence/2026-10-21-automation-market-consumer.md)。                                                                        | 本项真实行情/正式快照组合已补；外部通知、现场开市采样和其他来源性能仍由各自原门禁持有。                                                                                                        |

10-21 共同 G1 收口：五类消费面的真实链均有逐项证据，当前两个容器的全部 Server 649 个及 Schema 164 个 JavaScript 产物与本地一致，边界门禁通过。自有新账户归零停用，原十二账户和业务保护保持，政策 164 恢复原十六条路由；[完整回执](evidence/2026-10-21-automation-market-consumer.md)。本门禁关闭不关闭上方 RouteTarget 的失败备用/冷态范围，也不关闭其他产品独有条件。

对应产品 Task 继续负责本产品独有条件，本节只维护共同消费门禁。没有把 RQ/Tushare 权限条件用作其他消费者统一前置，也没有因为端点成功或服务健康而批量关闭。

S05 严格历史 PIT 已按[10-08 范围决定](../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)取消，不是本门禁；不要求已跳过的 AKShare 成功，也不为验收再次删除 smoke 新产物。原 [AC 映射和最终条件](../archive/tasks/2026-09-16-market-data-consumer-consistency-v2.md#验收映射)仍有效，删除衍生数据的独立请求不在本轮范围。

下一步只按 H07 未覆盖权限条件接续；条件未变时不重复请求。RouteTarget 与 Market Consumer 的上述已过精确输入复用，AI 真实生成保持停止。
