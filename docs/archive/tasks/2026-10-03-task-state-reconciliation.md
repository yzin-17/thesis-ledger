# 任务状态对账实施任务

> 任务标识：`task-state-reconciliation`
> 日期：2026-10-03
> 对应规格：[任务状态对账](../../specs/2026-10-03-task-state-reconciliation.md)
> 状态：文档对账完成；功能实施与验收义务仍由原 Task 拥有，未实施下一项。

## 执行边界与基线

三仓初始 `git status --short` 均为空。主仓 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，DSA 为 `d40549602d187da7bdd0e8bebb59d2a0fc271919`，infra 为 `dd3d92b5f46a780d10fdc3e66543b98471aa9bc2`。初始 `docs/tasks/` 有 65 个主题文件，其中 32 个包含未勾选项；这不是 32 个待实施功能，包含历史范围和已取消计划。

本轮遵循工作区/主仓 AGENTS、Codex/RTK 规则及文档生命周期指南。没有可调用的 Context Mode，使用 RTK 与脚本筛选。三仓源码只读，写集为主仓 `docs/`；应用测试、Provider、容器更新、业务写入和故障注入均不执行。

## 文档治理叶

- [x] R01：核对目录、历史证据与当前只读入口。覆盖 AC01；记录初始版本及四个 GET，不重做业务验收。
- [x] R02：修正权威 Task 的状态与旧阻塞，核对原断言及后继证据。覆盖 AC02、AC03；缺失证据保留开放，取消项不标通过。
- [x] R03：同步导航、TODO 和可归档条目。覆盖 AC04；不复制功能状态台账，不归档仍有义务的主题。
- [x] R04：执行链接、锚点、差异、写集及状态一致性检查，并交接剩余顺序。覆盖 AC04、AC05；只检查文档，不运行应用门禁。

依赖：R02 消费 R01 的证据；R03 消费 R02 的归属结论；R04 检查最终文档。规划预检通过，治理叶可执行；功能层面的运行门禁保持各自责任。

## 完成交付与证据

完整依据见[状态对账 Review](../../reviews/2026-10-03-task-state-reconciliation.md)，各原 Task 首段为当前结论，原始执行记录保留历史时点。主要修正：

- 定投与实际估值走势的旧 404/fresh-baseline 前置已解除，创建/调度/成交及真实点位交互仍未验收；新版复盘 Snapshot 列表/详情的实现缺口保留。
- 当前 Canonical、共同价格及后继镜像/恢复证据按原断言承接；旧默认路由、握手、jobs API 和条件性再次清理不再强制重做。延迟、进程故障、Electron/原生及其他未覆盖断言仍在原 Task。
- JSON Mode 的本地测试与构建已复用最新日志，补勾两项匹配的本地门禁；完整 CI、真实模型/费用、数据库竞争、新版超时与浏览器仍开放。T2.4 被 T2.5 替代后不重复维护视觉任务。
- RQData 注册取消，原 RQ02–RQ05 保留未执行事实；AKShare/EastMoney、Tushare ETF、TdxAiData 不列为必须恢复。其余来源的独立凭证与授权义务未被取消。
- 五份完成声明范围的功能 Task 与取消的 RQData Spec/Task 归档，原路径只保留链接；产品 Spec 保留。组合收益指标原 Spec 仍要求运行时验收，保留 active 并明确 G1。TODO 不新增任何当前义务，多源扩展直接归后继 Task。
- 修正旧归档链接/锚点；四处不可取回制品或退役代码位置保留文字历史定位，不伪造当前证据。

## 实际验证与范围

只读检查为三仓 `git status` / HEAD、六容器状态、四个本机 GET、当前 Controller/Schema/入口源码、原文档与既有日志筛选；本轮没有重新执行应用测试、构建、Provider、容器更新、故障注入、数据库写入、提交或推送。

文档验证命令：

```sh
rtk proxy python3 /private/tmp/check-task-state-reconciliation.py
rtk git diff --check
```

临时校验器输入为全部 `docs/**/*.md`、当前 diff/untracked 写集、Task 索引、五份归档/跳转、取消记录及相邻仓状态；检查本地文件链接与锚点、未勾选 Task 的导航、TODO/successor 归属、取消状态和写集仅含说明文档。校验通过，错误 0；`git diff --check` 退出 0。只检查文档一致性，不为未执行的功能门禁提供通过证据。应用及部署输入没有变化，因此未重复运行已有高成本检查。

## 剩余任务的建议实施顺序

以下是建议优先级与选择入口，不是新的功能状态表。每次只选一个主题或叶子，仍按原 Spec/Task 执行；依赖就绪的主题可独立选择，不要求全部串行。真实输入不足时先做该能力的有界前置核验，不自动请求被跳过来源。

1. **AI 新版超时与取消语义**：从[用途配置 AC-09/G2](../../tasks/2026-09-21-ai-provider-model-usage-configuration.md)开始，先核对各执行面与现有定向用例，确认非流式总超时、首输出/间隔、绝对期限及取消归因；完整 CI 与目标运行态另验，不重复已匹配的全包检查。
2. **AI 保存与默认引用的真实 PostgreSQL 竞争**：按[自动测试后保存 T6](../../tasks/2026-09-23-ai-provider-auto-test-save.md)及用途配置的默认事务断言验收；状态机的历史 PostgreSQL 结果不能代替保存 CAS。完成后再选[AI SDK G1](../../tasks/2026-09-19-vercel-ai-sdk-integration.md)的三类真实业务、认证/非零费用与客户端门禁；真实模型前置是相应凭证、模型及预算。
3. **基金定投最小运行闭环**：按[定投 T2](../../tasks/2026-09-08-recurring-fund-investment.md)验证创建→到期物化→确认成交，再补跳过/恢复及账户隔离。前置是当前合同的基金账户和可用标的；旧 404 不再阻塞。
4. **估值快照与走势真实点位**：先补[快照受管任务 AC6](../../tasks/2026-08-28-portfolio-snapshot-system.md)及有效点位，再做[估值走势 T4/T5](../../tasks/2026-09-07-portfolio-valuation-series.md)的鼠标/键盘/触屏和[组合收益指标 G1](../../tasks/2026-09-09-portfolio-pnl-metrics.md)。有数据及对应价格/NAV/FX 是验收前置，空响应不是通过；现金资金/定期入账按各自资金与调度断言独立验收。
5. **回测与自动化进程恢复**：分别选[BullMQ 当前 Run T4](../../tasks/2026-09-09-backtest-bullmq-lifecycle.md)或[Automation 目标 smoke](../../tasks/2026-09-05-automation-execution-lease-hardening.md)，先确认当前镜像/隔离环境再做 claimed 后中断、租约与唯一终态。不把二者合成一个故障叶，也不把恢复演练视为已执行硬杀。
6. **新版投资复盘实现**：从[Journal T1–T3](2026-08-28-journal-review-trade-projection.md)的对象/decimal/指纹与 Snapshot 保存、列表、详情开始，再做单笔/周期/AI 解耦。依赖当前 Trade Projection 合同，不依赖所有专业来源或交易规则 T18 全部完成。
7. **行情实现与浏览器缺口**：选[周期聚合 T1](../../tasks/2026-09-16-market-chart-period-aggregation.md)，按契约→聚合→指标→客户端推进；也可先补[刷新 T4/G1](../../tasks/2026-09-17-market-chart-refresh.md)截止日期降级、[指标交互](../../tasks/2026-09-10-market-chart-indicator-integration.md)及[详情状态矩阵](../../tasks/2026-08-21-market-detail-read-model.md)。分钟线/稳定盘中快照继续属于已明确延期的 TODO。
8. **真实交易规则来源与策略应用闭环**：先做[历史规则 T1](../../tasks/2026-09-16-backtest-real-historical-market-rules.md)的许可/版本/覆盖核实，合格输入就绪后补[交易 T18](../../tasks/2026-08-26-trade-execution-ledger-system-follow-up.md)；[策略风险 T17–T19](../../tasks/2026-09-09-strategy-risk-ai-optimization.md)分别按数据库/当前 Run/模型前置验收，不以参考规则或离线模型冒充真实来源。
9. **其他产品与原生验收**：按[任务分类入口](../../tasks/README.md)逐页选择全站 UI、窄屏摘要/Trade 名称、目录消费、账户删除、配色、录入模式和 Mobile；浏览器/Electron/Android/iOS 分别保留证据。截图导入、草稿与对账暂未开放，不自动开启。
10. **自然语言策略编写**：现行策略契约和 AI 模型用途就绪后，从[T00/T01](../../tasks/2026-09-18-natural-language-strategy-authoring.md)冻结所有权与草稿持久化，先建立最小纵向闭环，再扩展局部修改和恢复；不因既有 AI 生成就跳过实现。
11. **来源扩展与发布回退**：按[多源后继](2026-10-03-multi-source-remaining-acceptance.md)五个未完成项分别核实历史 PIT、事件、可靠因子、Quote 与异地制品/完整旧状态/合格候选。这些与前述独立功能没有统一串行依赖；合格输入和发布目的确定后再选叶子，本地恢复包与旧候选失败不重复执行。

## 最终一致性 Review

- [x] AC01–AC05 均有本轮文档交付与检查，不借历史功能证据宣称新业务验收。
- [x] 原 Spec、状态修正、后继责任、取消/跳过与索引一致，未覆盖断言继续有原 owner。
- [x] 相对文件链接、锚点、归档/跳转、中文说明及差异检查通过，无当前义务迁入 TODO。
- [x] 三仓原始状态与授权边界保留，主仓只修改说明文档，相邻两仓保持干净。
- [x] 剩余顺序已交接；第二项及其他应用工作未实施。

结论：本次文档对账完成，本治理 Task 已归档；功能任务的未实现、待验收与真实来源前置仍由对应权威 Task 管理。
