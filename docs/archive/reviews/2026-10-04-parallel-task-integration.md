# 主仓与并行任务聚合对账

> 归档说明（2026-10-14）：本文保留原日期、输入、命令、结果、失败与未覆盖条件，供历史追溯。下文“当前”与状态仅指原记录时点；本次归档不代表未通过验收已完成。现行义务由[当前 Task](../../tasks/README.md)及其 Spec 管理，发布外部门禁仍从[发布门禁记录](../../reviews/2026-08-18-v1.0-release-gate-review.md)进入。


## 聚合结论

2026-10-05 部署检查点更新：目标保数据升级与官方 `update.sh all` 已完成，28 项结构/76 表、Server/Worker/DSA 镜像及研究提示/新行情入口已部署；保护账户、Journal/AI 历史及配置保留。本报告下方的“未升级/未部署”段落是各交付时点的历史边界，当前部署事实以[新基线证据](../../tasks/evidence/2026-10-05-target-preserve-upgrade-baseline.md)为准。完整行情窗口/指纹、内容质量和故障门禁继续开放。

2026-10-04 父对话已将行情周期、真实来源前置核验和自然语言策略底层持久化的最小补丁合入主仓，保留全部既有未提交修改。行情此前快更后的 Journal 保护复验通过；自然语言新增结构只通过隔离保数据验证，未升级目标。投资复盘和各产品仍保留完整验收门禁。各主题的权威 Spec/Task 是唯一任务事实源，本报告汇总完成范围和下一步依赖。

## 当前工作线

| 工作线       | 已交付及集成                                                                                                                                                                              | 仍未完成                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 投资复盘     | decimal 正式对象/候选、单笔与周期分析、显式 Snapshot、冻结 AI 提交/执行/消费；核心浏览器操作及 legacy 歧义保留；OpenRouter 默认与单笔/周期结构化实际执行 | 分页/版本冲突/重试、离线及晚到响应、全页面矩阵；周期内容质量、新文本提示部署、目标在途恢复、设备及远端 CI |
| 行情周期聚合 | 公共合同、四周期纯计算、结构化降级、跨仓指标合同；Server 日历/窗口/缓存、派生 bars/指标/详情与独立周期能力本地公开接入；现行 Tencent ETF 真实日线及日历/路由前置核验 | 目标新公开入口、完整真实指标来源、输入/日历变化与缓存故障、T5 Desktop、完整运行态与产品验收 |
| 真实来源前置 | 官方公开材料与既有六份权威输入的有界调查；父对话复核部分官方页面与输入哈希，调查结论写回当前 Task                                                                                         | 全历史规则、逐日状态/资金/费用、严格 PIT、ETF 分红/可靠因子、Quote 单位与 revision、异地制品及恢复证据；调查没有形成新能力准入 |
| 自然语言策略 | T00/T01-C/R/O/P 底层合同与持久化已聚合，父修正微秒分页并通过 14 项隔离 PostgreSQL 测试 | 可信身份/API、专属模型执行、语义审核、正式保存、客户端和全部产品 AC/G1—G3；目标保数据升级 |

投资复盘依据：[当前对账](2026-10-04-journal-review-consistency.md)、[运行证据](../../tasks/evidence/2026-10-04-journal-review-contracts.md)、[用户说明](../../guides/2026-10-04-journal-review.md)。

行情依据：[原 Task](../tasks/2026-09-16-market-chart-period-aggregation.md)、[并行交付及主仓复验](../../tasks/evidence/2026-10-04-market-period-parallel.md)、[跨仓指标合同与计算](../../tasks/evidence/2026-10-04-market-period-indicator-contract.md)。公共原始来源身份仍只有 1m/1d；派生合同和受控日历 fixture 不证明真实来源完整性。

真实来源依据：[核验报告](../../tasks/evidence/2026-10-04-real-source-prerequisites-parallel.md)、[历史规则 Task](../tasks/2026-09-16-backtest-real-historical-market-rules.md)、[多源剩余门禁](../tasks/2026-10-03-multi-source-remaining-acceptance.md)。未调用收费来源或改变能力声明；正文和附件哈希的父复核范围由核验报告分别说明。

## 验证层次与当前结果

当前集成基线上，行情直接测试 48 项、Domain 全包 386 项、T1.2 后 Schema 全包 619 项、API Client 68 项通过，Server 行情特性 614 项通过（27 项默认条件跳过）；Server/API/Desktop 类型检查、新增代码 lint/格式、自动边界和依赖图通过。Journal 集成后定向消费 70 项通过、8 项默认条件跳过；其独立 PostgreSQL 17、全部 26 migration 与受限应用角色的 8 项验证此前通过。Server 2151 项完整回归及 Desktop 552 项完整回归属于 Journal 源码稳定时的证据；新增行情模块后按受影响输入复验，未将旧全包结果冒充再次运行。

T1.2 后最终 SDK 定向 20 项与 Desktop build 通过。浏览器额外 fixture 使用独立临时 tsconfig 显式编译通过；常规 Desktop typecheck 不覆盖该测试目录。浏览器固定页证明消费协议与交互，目标开发账户证明真实 Ledger/Journal 服务行为，二者分别记账。

T1.3/T4 后主仓定向 35 项、Schema 全包 635 项、API Client 全包 68 项、DSA 四文件 58 项通过，Server/API/Desktop 类型检查及 Python 编译、关键 lint、边界和尺寸门禁通过。两仓共享夹具字节一致，实际 Domain 输出可复现。官方 `sync-code.sh all` 后 DSA 能力声明、四周期计算、篡改拒绝与年度预热空值共 10 项检查通过；Journal 保护复验再次通过。目标只计算传入的合成序列，没有调用行情 Provider。

随后 T3.1 完成日历读取与 Session 投影，32 项新测试及 Server 行情 646 项通过，类型/build/工程门禁通过。实际 DSA 日历事实经宿主机新代码投影得到 38 日/76 Session；该新 Server 服务尚未同步目标，公开派生请求仍结构化拒绝。见[日历分层证据](../../tasks/evidence/2026-10-04-market-period-calendar.md)。T3.2/T3.3 保持开放。

T3.1b 修正年度计划与回测结算预算的职责：独立展示日历入口通过 Server 48 项、DSA 56 项及编译/工程门禁，官方快更后四项实际 HTTP 检查通过，真实年度日历与宿主机投影生成 242 日/484 Session。Server 日历服务已同步并健康；完整派生成功装配仍属 T3.2/T3.3。指标合同与 Journal 保护复验通过。

T3.2a 的完整桶/预热与双层预算规划已完成；最终 Server 行情及 DSA 客户端 684 项、Domain 386 项通过，类型与工程门禁通过，golden 字节未变。新规划模块未同步目标，也未发起行情读取；实际基础窗口/口径、派生缓存、公开成功响应仍开放。见[窗口证据](../../tasks/evidence/2026-10-04-market-period-window.md)。

T3.2b1 纯装配完成：装配 22 项、Server 行情/DSA 客户端 706 项、Schema 640 项、API Client 68 项及类型/build/工程门禁通过。宿主机新装配到目标 DSA 四周期受控计算通过，显示/计算分别绑定，微秒依据时刻保留。新 Server 代码未同步，真实来源读取、缓存与公开成功响应仍待后续叶。见[纯装配证据](../../tasks/evidence/2026-10-04-market-period-view.md)。

T3.2b2.1 读取编排合同已验证：13 项编排与装配/窗口回归共 51 项通过，类型/build/工程门禁通过。目标实际日历成功，但原生日线 HTTP 500；图表能力接口确认三种口径均为 route_not_configured，新 Reader 明确返回 source_unavailable，仅请求一次、不补造数据。T3.2b2.2 真实来源成功、T3 与完整产品门禁仍开放。见[读取证据](../../tasks/evidence/2026-10-04-market-period-reader.md)。

T3.2c1/c2 已完成本地缓存与指标消费：缓存 13 项、读取与注入 27 项、指标消费 11 项及类型/build/工程门禁通过；宿主机新代码到目标 DSA 四周期受控计算与缓存复用通过。该证据不证明真实 Provider、目标新 Server 或真实 Redis 故障。T3.2c3 与目标来源成功仍开放，公开消费按 T3.3a/b/c 分阶段接入。见[缓存与消费证据](../../tasks/evidence/2026-10-04-market-period-cache-and-indicators.md)。

目标通过官方快更入口同步，Server/Worker healthy，镜像保持原 ID。复用已创建的标记账户，正式对象 3 个、历史快照 2 份、旧快照仍为 STALE；分析得到收益 4.6/反事实 -4.4，周期统计为 1 Cycle/2 Slice。两个受保护账户及验收账户分析前后的 Ledger 哈希未变化。未重复创建验收账户、未清理数据库或卷。

上述快更时点真实 Provider 成功终态尚未取得；2026-10-05 现有 OpenRouter 的新单笔/周期运行已 succeeded，周期内容质量仍开放。目标在途 AI 恢复、Electron/原生设备、远端 CI、行情派生完整运行态继续未完成。快更是可写层更新，容器重建会恢复镜像代码，不能作为镜像构建/发布证据。

2026-10-05 T3.3b 详情/周期能力本地收尾：Schema 673 项、SDK 72 项、Server 受影响范围 784 项通过（27 项条件跳过），类型/build、lint/格式、边界/依赖图和尺寸 ratchet 通过。当前宿主机能力服务只读消费目标真实日历/价格路由，腾讯 ETF 四周期 bars 前置可用，年度指标分别降级；三账户语义摘要保持不变。目标 26 项 migration 尚未升级到主仓 28 项，新公开入口未部署，T3.3c/T3/T5 保持开放。见[详情与能力证据](../../tasks/evidence/2026-10-05-market-period-detail-and-options.md)。

## 前序已验证叶与保留门禁

基金定投、组合估值走势和 AI 生命周期/提交并发的已执行范围分别见[定投证据](../../tasks/evidence/2026-10-04-recurring-fund-runtime.md)、[估值证据](../../tasks/evidence/2026-10-04-portfolio-valuation-runtime.md)、[AI 生命周期](../../tasks/evidence/2026-10-04-ai-lifecycle-and-submission.md)、[AI PostgreSQL 并发](../../tasks/evidence/2026-10-04-ai-provider-postgres-concurrency.md)。本次没有机械重跑这些高成本输入未变的检查，也未把局部通过扩展为全项目验收。

## 下一步依赖

1. 投资复盘补剩余浏览器交互矩阵；2026-10-05 用户选定现有 OpenRouter，原生 Schema 研究用途验证及默认保存成功，revision 1。新单笔/周期实际请求均 succeeded；单笔有可追溯证据，周期仅通用结论且证据为空，内容质量仍开放。文本输出合同缺口已修复并通过本地 293 项回归，代码未部署。见[实际模型证据](../../tasks/evidence/2026-10-05-source-and-research-default.md)与[输出合同任务](../tasks/2026-10-05-research-json-prompt-contract.md)。目标在途恢复、设备和远端 CI 继续独立验收。
2. 行情 T1.1～T1.3、T2/T4、T3.3a/b 已完成；本地 bars/独立指标/详情与能力合同就绪，宿主机消费真实腾讯 ETF 四周期 bars 与 5d/周线 DSA 成功。月线长窗口来源 503、年度指标独立降级；T3.2b2.2/T3.2c3/T3.3c 的完整来源、缓存故障与目标公开成功仍开放。
3. 目标保数据结构升级与官方更新已完成；下一推荐为 T3.2b2.2，随后 T3.3c，再做 T3.2c3。T5 保留 T3 启动依赖，之后完成 T6/G1/P1/R1。当前六条工作线剩 32 项主任务/阶段义务，展开行情叶后为 34 项，详细剩余清单、并行边界与推荐顺序见[执行交接](2026-10-05-remaining-task-execution-order.md)。
4. 真实来源沿核验报告的有界叶补齐权威历史数据、单位/revision、授权和恢复输入；证据不足时保留降级及未勾选，不把当前验收义务转入未来 TODO。
5. 自然语言策略底层就绪后先解决可信身份/API 与正式策略归属，再按原 Task 补执行、转换和确认保存。两项新增 migration 的目标保数据升级独立验收，不能清空现有目标账户；行情目标更新也须重新通过该结构门禁。

## 工作区与提交处理

### 新批并行任务交接

自然语言策略 chat `01a1072b-ab40-7942-9d32-9dad87928e65` 已交付工作区 `/Users/yzin/.codex/worktrees/11ea/thesis-ledger` 的 T00/T01-C/R/O/P。父审阅并聚合新增文件、共享最小补丁、两项 migration，修正微秒分页与新增函数复杂度；主仓 Schema 667 项、repository 9 项、父专用 PostgreSQL 14 项及类型/build/结构输入/工程门禁通过。当前 Server 缺乏用户身份接口，正式策略缺乏用户归属；HTTP 或正式保存权限验收仍未完成。见[父聚合证据](../../tasks/evidence/2026-10-04-natural-language-strategy-integration.md)。

回测正式 chat `01a1072c-4236-7971-b9f1-0998a3401f45`（“回测当前 Run 独立进程恢复并行验收”）已 completed/idle。父对话复核并最小集成 8 个文件，按主仓当前 28 项 migration 重跑三个真实隔离场景成功，19 项定向、Backtest 585 项及必要门禁通过。旧“等待初始化”记录由本段取代；隔离叶已接受，目标故障注入、默认 Worker 心跳、429、Electron 与完整 T4 仍开放。见[主仓恢复证据](../../tasks/evidence/2026-10-05-backtest-recovery-integration.md)。

并行线保持各自工作区，不提交、不推送、不自行更新目标容器或数据库。自然语言策略如新增 migration，父对话评审合入后统一按当前结构门禁和 infra 官方入口验证；默认保留目标数据，不以开发重建替代迁移验收。目标 Journal 标记账户和受保护 Ledger 仍需保护。

两个用户 chat 的工作区分别为 `/Users/yzin/.codex/worktrees/604f/thesis-ledger`、`/Users/yzin/.codex/worktrees/18da/thesis-ledger`，保留以便追溯。聚合没有覆盖公共 index 或整目录；没有 reset、clean、stage、commit、push。DSA 原仓新增指标协议适配、测试、共享夹具和中文专题说明/变更记录；infra 源码未修改，仅调用官方快更。其他既有未提交修改保留。
