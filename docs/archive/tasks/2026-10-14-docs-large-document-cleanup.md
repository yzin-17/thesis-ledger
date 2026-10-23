# 巨型文档与重复证据精简实施记录

> 任务标识：`docs-large-document-cleanup`；日期：2026-10-14
> 状态：第二至第七轮精简、入口清理与 Task 接续均完成并归档；各轮数字及环境结论只属于其记录时点，无新增业务验收结论。
> [规格](../specs/2026-10-14-docs-large-document-cleanup.md)
> 第二轮开始基线：`main@3570ab24960da91c7988c195344e7e8ca36eb08a` 与当时远端一致；保留第一轮 64 份跟踪文档修改及 20 份未跟踪归档文档，暂存区为空。未合并 PR #41 为绩效目标合同，#46 为投资复盘，均不是本轮治理 PR。第三轮继续保留前两轮工作，远端前进情况见下文。

## 本轮任务

- [x] T1：六份重点文档已核对。统一 Spec 的来源特有约束仍是现行合同，按需附页保留原文；当前 Task 的未通过执行叶留在原路径。历史阶段、原始失败和已完成执行包留作归档记录。Base64 含 HTML/PDF 两份原件，须按原始摘要保留可解码载体；Android 两 XML SHA-256 相同且全仓无直接引用。
- [x] T2：完成当前 Spec/Task 精简。三份 Task 保留当前责任、未通过执行条件、已完成标识索引与证据；详细历史按主题归档。统一 Spec 原条款分成主文与来源附页，策略中心的决策和 AC 保留。覆盖 AC1、AC2。
- [x] T3：六份一次性报告归档，修正引用并保留必要旧路径/锚点跳转；S05 两份原件从正文提取至独立 Base64 载体。只删除一份无直接引用且字节相同的 XML，规范副本保留。覆盖 AC2、AC3。
- [x] T4：完成任务状态、合同条款、历史记录、原始字节、改动范围及链接检查，文档差异检查通过；本次治理 Spec/Task 一并归档。覆盖 AC1～AC4。

## 最终一致性 Review

本轮具体方式：统一 Spec 仅分离来源专属合同，不弱化任何条款；统一适配、历史按需与 AI SDK 三份 Task 保留当前责任和执行条件，详细历史按主题归档。策略中心保留决策、交互约束与 AC，原始问题/重复布局示意随既有归档任务保留。三个统一适配证据报告、两个一次性 benchmark 报告和旧状态对账 Review 归档；可重跑的 T13 基准继续留在 benchmarks。Base64 独立载体仍保存原字节，去重只删除慢速场景重复 XML，规范副本保留。

通过。本轮减少当前入口读取量，必要历史和来源附页仍按需保留，不以文件尺寸阈值裁剪合同。

## 当前正文大小变化

| 文件 | 整理前字节 | 整理后字节 | 内容归属 |
| --- | ---: | ---: | --- |
| [统一适配 Spec](../../specs/2026-10-09-unified-data-capability-adapter.md) | 128780 | 65046 | 通用合同/AC 保留；来源条款完整移入[现行附页](../../specs/2026-10-09-unified-data-capability-source-contracts.md) |
| [统一适配 Task](../../tasks/2026-10-09-unified-data-capability-adapter.md) | 195656 | 41700 | 三个未通过项保持开放；[执行历史](2026-10-09-unified-data-capability-adapter-history.md)保留原日期与范围 |
| [历史按需 Task](../../tasks/2026-10-09-history-data-on-demand.md) | 144629 | 21486 | 摘牌条件、当前执行边界及 D1～D5 完成索引保留；[历史记录](2026-10-09-history-data-on-demand-history.md)保留失败/修正与有界验收 |
| [AI SDK Task](../../tasks/2026-09-19-vercel-ai-sdk-integration.md) | 78419 | 14676 | G1、T13 后客户端条件、48 项 AC 映射及原预算保留；[历史记录](2026-09-19-vercel-ai-sdk-integration-history.md)保留旧失败与请求账本 |
| [策略中心 Spec](../../specs/2026-09-17-strategy-center-ux-consolidation.md) | 91039 | 79669 | 决策/AC 和交互语义保留；原问题和布局示意随[原归档任务](2026-09-17-strategy-center-ux-consolidation.md#strategy-original-problems-20261014)保存 |
| [S05 证据入口](../../tasks/evidence/2026-09-28-s05-venue-parser-discovery.md) | 614251 | 18926 | URL、响应元数据、长度、摘要和历史结论保留，原件独立存储 |

三份 Task 当前正文合计从 418704 降至 77862 字节，约减少 81%。统一 Spec 是分离通用和来源合同，不减少合同集合；历史正文归档后不作为另一套当前状态。

## 一次性报告与去重依据

- 三个统一适配阶段/来源/运行报告保留于[初始证据](../reviews/2026-10-11-unified-data-capability-initial-evidence.md)、[来源证据](../reviews/2026-10-11-unified-data-capability-source-evidence.md)、[运行证据](../reviews/2026-10-11-unified-data-capability-runtime-evidence.md)。原日期、输入、命令、失败、修正、实际结果和未覆盖条件均保留；正文只增加归档说明及修正链接。
- [历史规则来源矩阵](../reviews/2026-09-10-backtest-historical-execution-rule-source-matrix.md)、[图表一次性运行记录](../reviews/2026-09-13-market-chart-runtime.md)和[旧状态对账](../reviews/2026-10-03-task-state-reconciliation.md)按历史证据归档。可重复执行的 T13 基准继续留在 benchmarks。
- S05 HTML/PDF 原件分别存于 [HTML Base64](../../tasks/evidence/2026-09-28-s05-venue-parser-discovery.cb3aabff.html.b64)和 [PDF Base64](../../tasks/evidence/2026-09-28-s05-venue-parser-discovery.46af95b6.pdf.b64)。解码长度分别为 16126、430850 字节；SHA-256 分别为 `cb3aabff8709091d9e534b5979e14bcbe3d825a51826aabf87c3a265b17751dc`、`46af95b681fe58d9c409d2252be57404c5191fd2b678ba4a9781c588f852f2c3`，与原内嵌内容逐字节相同。载体未被 Git 忽略，不生成另一份有相同正文的 Markdown。
- 删除 `investment-os-mobile-slow-ready.xml`；全仓跟踪文本中两文件均无直接引用，删除前字节完全相同。[规范副本](../../reviews/evidence/mobile-android/investment-os-mobile-ready.xml)保留，SHA-256 为 `4d221d95cbbe8db31015fa1154e4e1a908d53cadb4b60e41973649a414da53a2`。慢速场景其他截图和记录保留，不把相同 UI XML 当作新的性能证明。

## 验证结果与边界

- 三份 Task 的原标识与状态分别核对 196、65、23 项，均保持；所有原未通过定义保留在当前 Task。RQ/Tushare 正向条件、摘牌消费、G1 三类业务结果及客户端复验没有转入 TODO 或被改为通过；其他 Portfolio、Cash、Scheduler、Market Consumer、RouteTarget 性能、富途验收没有修改。
- 统一 Spec 主文和来源附页合并后，原合同段落仅有导航路径变化；策略中心决策/AC 行与全部 11 份原流程/布局示意可定位。六份报告的原证据正文只变更归档说明与导航。
- 除本轮明确整理的 S05 入口和重复 XML，596 份 Task 配套/设备证据文件字节未改；两份原件的解码长度及摘要校验通过。忽略目录中的原恢复记录和截图没有搬入仓库或更改。
- 全仓 Markdown 相对链接及锚点与 HEAD 对照，没有新增失效项；既存临时绝对路径和根许可证生成清单缺失引用保留原事实。`git diff --check` 通过。只执行本轮临时只读分析与完整性脚本，没有新增门禁，也没有重跑应用测试、真实 Provider、数据库、Docker 或浏览器验收。
- 第一轮归档、状态和 TODO 修改继续保留；原工作树在本轮继续增量修改。应用源码、部署输入、暂存区和 HEAD 没有改变，没有提交、推送、创建分支或 PR。

## 结束时远端核对

结束时远端 main 前进至 `63c816bc27e86645cf43205dee9f129efa984876`，仅新增 PR #47 的 `.mts` 类型感知 lint 修复。只读 GitHub compare 显示变更限于 ESLint/包配置和验收脚本，没有 docs 或应用运行合同变更，不与本轮文件重叠。没有自动合并、拉取或重置当前工作树；本地 HEAD 仍为 `3570ab24960da91c7988c195344e7e8ca36eb08a`。本轮完整性检查以该本地基线和既有证据为准，不宣称已执行新增脚本或远端 CI。

## 第三轮：跳转与历史入口清理

后续授权：清掉已无引用的跳转文件，归档历史 Review 和被替代的 Spec，保留现行合同、必要历史证据和尚未通过的验收，不提交、不推送。本节记录同一治理主题的后续清理，不另建状态台账。

- [x] 检查本地 main、HEAD、全部既有修改与暂存区；远端可见 main 仍为 `63c816bc27e86645cf43205dee9f129efa984876`。开放 PR #41 与 #46 分别是绩效目标合同和投资复盘，均不是文档治理 PR；本轮不在这两项功能 PR 中扩大范围。
- [x] 扫描主仓全部跟踪及未忽略的未跟踪文本、Markdown 路径和两邻仓引用，先修正可维护导航，再删除 47 个无实际引用跳转；两份 archive 反向跳转由真实 Spec 正文替换。
- [x] 34 份历史 Review 完整归档，旧日期、成功、失败、命令、输入及未覆盖条件保留。当前仅保留发布外部门禁、DSA Fork 审计、来源路由矩阵和用户体验评审四份正文；归档报告仍供当前 Task 复用证据。
- [x] 8 份旧 Spec 归档，更新现行合同及历史任务之间的引用；未以配对 Task 完成作为批量归档产品合同的理由。
- [x] 当前入口、链接、原文、证据和未通过条件完成检查。应用、部署、原始证据、暂存区和 HEAD 保持原状；未执行新的 Provider、数据库、Docker 或浏览器验收。

### 退出当前入口的 Spec 与承接依据

| 历史 Spec | 真实状态与承接依据 |
| --- | --- |
| [巨型组件拆分](../specs/2026-08-23-large-component-split.md) | [原任务](2026-08-23-large-component-split.md)声明范围与本地最终 Review 已完成；旧路径与拆分计划保留历史。长期请求、复杂度和依赖方向由 [AGENTS.md](../../../AGENTS.md)及现行架构维护。 |
| [全仓架构加固](../specs/2026-09-02-full-repo-architecture-hardening.md) | [原任务](2026-09-02-full-repo-architecture-hardening.md)为 Completed；原 Draft 与分批改造顺序属于旧审查基线。长期规则由 AGENTS.md、边界门禁及 [Canonical](../../architecture/canonical-runtime.md)承接。 |
| [事实与研究模型](../specs/2026-09-10-backtest-historical-execution-rule-facts.md) | [原任务](2026-09-10-backtest-historical-execution-rule-facts.md)已完成；现行经济模型、复权与冻结由 [09-25 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)及 [V2 产品合同](../../specs/2026-08-28-unified-backtest-v2.md)维护，最新范围决定仍在 [10-03 Spec](../../specs/2026-10-03-multi-source-remaining-acceptance.md)。 |
| [V2 收敛补充](../specs/2026-09-11-backtest-v2-closure-follow-up.md) | [原收敛任务](2026-09-11-backtest-v2-closure-follow-up.md)已完成；仅保留当次责任边界与分层验收。产品及不可变冻结由上述 V2、09-25 合同承接。 |
| [BarSeries 缓存 V2](../specs/2026-09-16-market-bar-series-cache-v2.md) | [原 Task](2026-09-16-market-bar-series-cache-v2.md)的 T1–T3/G1、隔离存储、Docker 与性能验收完成；现行 V3 接线见 Canonical、09-25 与 [统一适配层](../../specs/2026-10-09-unified-data-capability-adapter.md)。`backtest-snapshot-v3-builder.ts`、`backtest-snapshot-v3-dependency-response-checks.ts`仍消费当前冻结与来源信封。 |
| [10-03 状态对账](../specs/2026-10-03-task-state-reconciliation.md) | [Task](2026-10-03-task-state-reconciliation.md)与 [Review](../reviews/2026-10-03-task-state-reconciliation.md)均已结案；不再保留第三份当前治理合同。 |
| [投资复盘收口](../specs/2026-10-05-journal-review-completion.md) | [J4–J8 Task](2026-10-05-journal-review-completion.md)及 [最终 Review](../reviews/2026-10-05-journal-review-completion.md)已完成；现行产品和契约仍由 [主 Spec](../../specs/2026-08-28-journal-review-trade-projection.md)与 [契约补充](../../specs/2026-10-04-journal-review-contracts.md)维护。 |
| [目标保数据升级基线](../specs/2026-10-05-target-preserve-upgrade-baseline.md) | [当次任务](2026-10-05-target-preserve-upgrade-baseline.md)执行范围已完成；当前升级要求继续由 [保数据合同](../../specs/2026-09-27-preserve-data-database-upgrade.md)及 infra 官方脚本维护，不把原部署 head 当作今天状态。 |

本轮修正此前将旧拆分计划、V2 阶段设计及一次性收口 Spec 一律留在 current 的处理；现行合同已有明确承接时，旧正文应退出当前入口。09-25、10-03 范围决定、统一适配主文/来源附页、历史按需、AI、Portfolio、Cash、Scheduler、Market Consumer 与其他未通过验收的 Spec/Task 继续保留，未恢复取消范围。

### 跳转保留依据与目录变化

原跳转扫描含当前目录与 archive 中的反向兼容入口。删除的是已经修正实际导航后无引用的壳；保留 18 个仍被原始证据、测试输入或邻仓引用的既有壳。迁移时另保留 6 个必要旧路径入口，共 24 个兼容文件，均无第二份合同或状态正文。

必要引用包括：09-25、Canonical、行情周期与自然语言策略的原始证据；旧模型 fixture 与验证脚本内的 provenance 路径；DSA 来源合同/适配记录和 infra 恢复规格。当前来源原件及邻仓不改写。归档文档内的原执行路径保留为历史输入，不能仅因出现过路径文字就新增兼容文件。

| 顶层目录 | 清理前 Markdown | 清理后 Markdown | 清理后正文与兼容入口 |
| --- | ---: | ---: | --- |
| tasks | 84 | 48 | 33 份当前 Task、14 个兼容入口、1 个 README |
| specs | 111 | 102 | 98 份当前 Spec、4 个兼容入口 |
| reviews | 43 | 10 | 4 份查阅正文、5 个兼容入口、1 个 README |
| benchmarks | 5 | 3 | 可复跑 T13、1 个 fixture 所需兼容入口、1 个 README |

数量只记录本次快照，不作为后续新增文档的门禁或第二套任务状态。

### 第三轮完整性验证

42 份迁移正文的内容校验通过：只增加归档说明及修改导航；全仓架构加固 Spec 额外补齐末尾换行，没有合同、验收或历史原文丢失。28 份含未勾选项的当前 Task 合计 145 条未勾选定义保持；没有把实现成功、来源不可用或用户取消改为验收通过。

原始证据 595 份文件的路径与 SHA-256 聚合校验保持一致，源代码及部署等 2398 份输入的聚合校验保持一致。全仓 879 份 Markdown、3287 处本地路径及锚点检查无新增失效项；58 个原有缺失项仍为临时绝对路径及根许可证生成清单，不补造证据。必要兼容文件逐一保留引用依据，没有新增持续审计流程或脚本。`git diff --check` 通过，所有修改留在未暂存工作树。

## 第四轮：当前 Task 承接

日期：2026-10-15。本轮继续处理第三轮之后的 33 份当前 Task，保留全部既有未提交工作。将重复父任务及同域待验收记录交给现有 Task，再归档原记录；当前任务入口不再为同一责任维护多份正文。该操作不表示任何真实验收已通过，不迁入 TODO，不修改当前功能合同或实现，也不新增当前 Task 文件。

| 归档原记录 | 当前责任入口 | 承接范围 |
| --- | --- | --- |
| [v1.2 父任务](2026-08-18-market-data-provider-v1-2.md)与 [closure-11 汇总](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md) | [Mobile 原生任务](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md#native-parent-review) | 原 T11 的两项原生叶及原 AC-09/10/11 最终映射继续开放；旧发布/回滚不重跑，退役协议由 Canonical 承接。 |
| [涨跌配色](2026-09-15-market-color-scheme.md) | [Mobile 配色剩余条件](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md#mobile-color-acceptance) | 原 I1 及未通过的产品门禁逐条保留，Desktop 已通过证据复用，Mobile 配色/持久化/状态边界未通过。 |
| [估值走势](2026-09-07-portfolio-valuation-series.md) | [投资组合的估值验收](../../tasks/2026-08-28-portfolio-snapshot-system.md#portfolio-series-acceptance) | T4/T5、T4.I1/I2、AC1–AC9 及原未勾选 Review 条件逐条保留；真实触屏、目标点位与来源条件不改为通过。 |
| [每日摘要](2026-09-09-portfolio-daily-summary.md) | [投资组合的摘要/窄屏验收](../../tasks/2026-08-28-portfolio-snapshot-system.md#portfolio-summary-acceptance) | T3/T4、AC6/AC9 的实际窄屏及原 Review 未通过条件保留。 |
| [收益指标](2026-09-09-portfolio-pnl-metrics.md) | [投资组合的收益验收](../../tasks/2026-08-28-portfolio-snapshot-system.md#portfolio-pnl-acceptance) | G1 的实际收益、无/部分/全部/多次卖出、Trade Close Slice、缺成本/FX 与账户/模式证据保留；原本地 T1–T3 不重做。 |
| [定期现金入账](2026-08-30-recurring-cash-deposit-plan.md) | [现金的定期入账验收](../../tasks/2026-08-30-cash-account-funding-and-transfer.md#recurring-cash-acceptance) | 原 T3 的到期/补期/并发/通知和 T4 的确认/跳过/恢复、宽窄屏及键盘条件保留；lease 基础设施仍归原独立 Task。 |

承接后的归档状态明确为“已被承接、验收仍开放”，原勾选、实施、命令、失败和 Scope 保留，不标 Completed。各 Spec 仍维护原行为/AC，当前 Task 按来源节区分原编号，避免 T4、G1 等跨主题混同。2026-10-03/04 记录里的设备或来源不可用只作当时事实，未据此断言今天仍阻塞；新的来源资格也不替代真实 Portfolio/Native 消费。

当前任务正文从 33 降为 26，`docs/tasks/` 顶层 Markdown 从 48 降为 41：26 份当前正文、14 个第三轮已核实的必要兼容入口及 README。本组主仓原始证据、源码和两邻仓扫描没有发现必须保留旧路径的引用，因此没有新增跳转文件。三个承接 Task 分别约 5KB、15KB、10KB，历史日志保留在原归档记录。

本轮同时修正定期现金入账 Spec 的“已实现并验证”摘要，明确其确定性验证与真实 Scheduler/通知/客户端验收的区别。其他 Portfolio、Cash、Scheduler、AI、Market Consumer、Provider 及富途的独立责任继续保留，不将功能无关的 Task 混为一份大任务。

最终核对包括七份归档原文、承接条件、其他当前 Task 的内容、现行 Spec 导航、全仓路径/锚点、源码及原始证据聚合和 Git 差异。仅有责任与导航调整，没有新增实现或业务通过结论；暂存区和 HEAD 保持原状，不提交、不推送。

第四轮验证通过：七份原文除归档说明与导航外完整保持；估值、摘要、收益与配色的原未勾选定义在当前承接页逐条可定位，T11 的原生叶与 AC 汇总责任保持开放。其他当前 Task 除导航外内容保持。879 份 Markdown、3321 处本地路径/锚点检查无新增失效，595 份原始证据及 2398 份源码/部署输入的聚合 SHA-256 未变，`git diff --check` 通过。未重新执行业务验收；本地 HEAD 仍为 `3570ab24960da91c7988c195344e7e8ca36eb08a`，2026-10-15 只读可见远端仍为 `63c816bc27e86645cf43205dee9f129efa984876`，暂存区为空。

## 第五轮：Task 精简与合并

2026-10-15 按用户授权，先精简三份大 Task，再合并四组同域任务、修正文档导航并清理不必要兼容文件。只读基线为本地与远端 `main@da002744bd317b7754832c6ac41d169bcf005e27`，起始工作树干净。没有创建分支、提交、推送或执行业务验收。

策略风险/AI 优化、交易 follow-up、AI 配置三份当前正文由 161,623 字节降至 25,501 字节；原步骤、AC、完成条件、失败、命令与证据分别完整保留在同名 `-history.md`。AI 的研究提交/冻结三项隔离竞争及本机 HTTP/SSE 生命周期已有 10-04 证据，修正了旧摘要和矩阵仍称未验证的状态；真实目标研究、认证、非零费用和 Electron 未关闭。

四组承接均使用现有 Task，不增加当前任务文件：

- AI 配置承接自动测试保存的 T6 及免费依据移除的条件性验收；原两份 Task 归档，原 Spec 和 AC 保留。
- AI SDK 承接 JSON Mode/Stream 的兼容、浏览器与真实 API 条件；不把用途探针当成三类完整业务生成。
- 图表指标 Task 同时精简完成日志，并承接图表更新 T4/G1；设置和导航组件已有实现，完整验证、G2/R2、跨日/双向/重试及截止日期降级保持开放。稳定盘中日线仍为既有 TODO，富途 1m 继续独立实施。
- 统一适配层承接旧 RouteTarget 的现行延迟缺口和 Market Consumer 的真实消费门禁；旧默认主备/握手、用户跳过来源、严格历史 PIT、清零烟测产物不恢复。RQ/Tushare 原正向义务与账号/权限停止条件继续保留。

六份被承接 Task 以“验收仍开放”归档，指标旧正文另保留为历史记录。原编号、全部完成条件及 AI 完整 AC-01～30 核心断言保持；所有现行合同只调整状态、范围适用性和任务/归档导航，不降低验收标准。

当前正文 26 → 20，总读取量 509,974 → 291,684 字节。顶层 Task Markdown 41 → 27：20 份正文、6 个兼容文件和 README。全目录删除 15 个仅需文档导航的跳转，留下 9 个测试输入、验收脚本或邻仓仍引用的兼容路径；证据 Markdown 的导航可直接指向归档，不为历史路径/哈希表、当时命令或执行清单长期保留无实际读取用途的文件。

[任务索引](../../tasks/README.md)说明每份为何保留及何时接续：默认只读索引和本次 Task 的剩余条件；Spec 在修改合同或确认边界时读取，历史/evidence 在验收和追溯时按需打开。当前停止的来源和摘牌范围不作为立即执行清单。

完整性核对：10 份新归档除归档说明和导航外与基线原文一致；595 份证据中 563 份字节未变，32 份仅调整 Markdown 导航和对应行尾空白，原请求、日志、命令、哈希和冻结输入未变；2399 份非 docs 输入聚合 SHA-256 未变。现行 Spec 的断言正文保持，仅同步状态/适用性与导航。路径/锚点检查保留既有 58 项缺陷，没有新增失效；`git diff --check` 通过，HEAD 与暂存区保持起始状态。

## 第六轮：证据状态纠正与验收接续

2026-10-15 按用户授权只改 docs。起始 `main@da002744bd317b7754832c6ac41d169bcf005e27` 与远端一致，保留前五轮已有的 86 项未提交 docs 修改；未执行新的 Provider、数据库、Docker、浏览器、原生或业务数据操作。

三处旧状态按现有证据纠正：

- 策略风险/AI T17 的探索三字段/约束、候选持久化及正式 v1 采纳已有后继隔离证据：策略中心 T03 的全部 13 条 migration 与 3/3 PostgreSQL 场景，SDK T5 的本机 HTTP/隔离库 discovery 持久化。T17/T18 的自身本地及隔离里程碑收口；T19 真实探索闭环和全部必要产品条件保持开放。
- Portfolio T4.I1 的粒度保留、SVG 坐标、旧激活清除及宽窄屏鼠标/键盘已在 10-04 验证。本节改为“仅剩真实触屏”，原 T4/T5、正式校准、摘要/收益与外部输入条件未关闭；触屏不再阻塞独立来源/点位对账。
- 当前源码 CI #38601670572 为成功：quality 的完整 lint/typecheck/test/build、contracts-and-guardrails 和 Android debug 编译通过。源码输入固定为上述 HEAD；desktop-packages 被跳过，本轮未提交 docs 没有宣称远端 CI 已检查。SDK/配置的旧 CI 等待描述及删除账户/Native 的 Android 编译状态同步纠正，iOS、模拟器、安装态和真实 Provider/费用条件仍未通过，原模拟器暂停决定保留。

两个历史 Task 的剩余条件由现有入口接续：

| 原任务 | 当前责任 | 保留的未通过条件 |
| --- | --- | --- |
| [目录聚合](2026-09-18-instrument-directory-server-read-aggregation.md) | [交易 follow-up 的目录消费验收](../../tasks/2026-08-26-trade-execution-ledger-system-follow-up.md#directory-consumer-acceptance) | DIR-AC6：Ledger effective/audit/replay、清仓后名称、Journal cycle/slice/分页、未知/失败回退、无额外目录请求及浏览器/安装态。原 AC1～AC6 与 Spec 全文保留。 |
| [策略实验一致性](2026-09-08-strategy-lab-execution-parity.md) | [策略风险/AI 的独立承接验收](../../tasks/2026-09-09-strategy-risk-ai-optimization.md#strategy-parity-acceptance) | PARITY-T06：原 AC-01～AC-13 当前适用性与完整覆盖、编辑/历史版本/JSON、单位/区间、结果/1024px、Console 和启动/失败边界；旧 V1 路径按有效后继判断，不恢复旧 jobs 或行情上传。 |

两份 Task 以“被承接、验收仍开放”归档，完整保存原步骤、编号、完成条件、命令和证据；没有新增兼容文件。承接验收与原 T19/T14-R1 各自收口，重合场景可共用有效证据，不将其他验收新增为全部功能的启动前置。

当前正文 20 → 18，合计 277,146 字节。Task 顶层 27 → 25：18 份正文、6 个必要兼容文件及 README。两份现行 Spec 只更新当前责任/导航，断言正文不改；任务入口同步解释剩余条件，未通过验收不迁入 TODO。原取消、来源跳过与暂停决定继续保留。

完整性核对：两份归档除说明和导航外与本轮起始原文一致，两份 Spec 的规范正文/AC 保持；595 份证据与 2399 份非 docs 输入的聚合 SHA-256 均未变，其他既有 docs 修改保留。868 份 Markdown 的路径/锚点检查无新增失效，既有 58 项缺陷保持；`git diff --check` 通过。HEAD 和暂存区未改变，无提交或推送。

## 第七轮：三份大 Task 精简

2026-10-15 按用户“继续”授权，只收敛当前阅读入口。起始 `main@da002744bd317b7754832c6ac41d169bcf005e27`，95 项既有 docs 修改、暂存区与非 docs 输入保留；未执行新的 Provider、数据库、Docker、浏览器或原生验收。

| 当前 Task | 精简前字节 | 精简后字节 | 现在需要打开的原因与历史归属 |
| --- | ---: | ---: | --- |
| [统一适配层](../../tasks/2026-10-09-unified-data-capability-adapter.md) | 45,799 | 11,990 | RQ/Tushare 原正向条件、RouteTarget 延迟和真实消费者门禁仍开放。193 条已完成 ID 均已有[完整历史](2026-10-09-unified-data-capability-adapter-history.md)，删除重复完成摘要，仅保留分组证据和有效边界。 |
| [研究助手](../../tasks/2026-08-25-ai-research-workbench.md) | 32,021 | 4,263 | 保留四类运行验收及已过 R1 的分层说明。T1～T10、23 项 AC 映射、原约束、命令和旧状态完整保存于[历史原文](2026-08-25-ai-research-workbench-history.md)，不作为当前实现计划。 |
| [历史按需](../../tasks/2026-10-09-history-data-on-demand.md) | 21,510 | 4,907 | 只留 L3 摘牌正向验收和停止/接续条件；旧 L3 父项与“摘牌边界”是同一缺口，不再维护重复 checkbox。原阶段定义、范围和接续原文补入[已有历史](2026-10-09-history-data-on-demand-history.md#2026-10-15-精简前范围阶段与接续原文)，64 条完成摘要的原 ID/执行记录均可追溯，不重复附加摘要表。 |

三份合计 99,330 → 21,160 字节，减少 78,170 字节（78.7%）。当前 Task 正文数量仍为 18，合计 277,146 → 198,976 字节；没有新增当前 Task 或兼容文件。Spec、来源附页与原始证据保持，暂停、取消、预算和未通过条件不变；任务索引及 docs 导航同步说明研究助手独立门禁，不再将全部 AI 验收表述为两个入口。

完整性核对：研究助手历史除说明与相对路径重定位外保留精简前完整原文；历史按需原历史字节前缀不变，补记保留阶段原文。三份原未通过义务可从当前条件与历史逐一对应，原现行合同未改；595 份证据、2399 份非 docs 输入的聚合 SHA-256 不变，其他既有 docs 修改保留。全仓 Markdown 路径/锚点无新增失效，既有 58 项旧缺陷保留；`git diff --check` 通过。HEAD 与暂存区不变，无暂存、提交、推送。
