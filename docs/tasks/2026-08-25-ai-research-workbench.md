# 研究助手任务工作台实施任务

<a id="priority"></a>
> 排期（2026-10-30）：**P1｜目标在途重启、外部来源长任务**。当前默认 Provider 的真实研究 smoke 已按 D59/D60 复用验收；剩余两项继续等待准确故障范围、目标样本/来源和当次调用授权，不重做视觉、模式及隔离恢复。
> [全局优先级与接续规则](README.md#priority-policy)。本次仅调整文档，不改变下列原任务编号、checkbox、验收条件或执行授权。

> 首次日期：2026-08-25；文档精简：2026-10-15。
> 当前检查点（2026-10-30）：T1～T10 及视觉/键盘、R1 隔离恢复复用；D59/D60 已通过现行 V2 的真实 Provider smoke。仅剩在途重启与外部来源长任务两项，均保持未勾选。版本归属与证据见[本次对账](evidence/2026-10-30-nonmobile-evidence-reconciliation.md)。
> [现行 Spec](../specs/2026-08-25-ai-research-workbench.md) · [原步骤、23 项 AC 映射与完整验证记录](../archive/tasks/2026-08-25-ai-research-workbench-history.md)

## 现在做什么

只补下方两项未过的真实运行时条件；D59 默认研究与 D60 阅读/来源/历史证据复用，10-16 视觉/键盘不重做。隔离恢复、受控执行或未知费用样本仅覆盖其自身断言。

真实请求沿用[AI SDK Task](2026-09-19-vercel-ai-sdk-integration.md)的既有预算/受控生成规则和[配置 Task](2026-09-21-ai-provider-model-usage-configuration.md)的用途、默认选择与冻结规则，不为验收自行切换收费模型、重置预算或修改默认选择。历史环境失败仅属于原观察时点，不作为当前连接状态。

10-17 原账本额度与暂停决定保留；D58/D59 的研究调用来自各自独立授权。研究 smoke 已按下列证据关闭，但目标在途恢复和外部来源长任务仍需各自当次授权，不由配置可启动或历史未用次数放行。

10-18 全局模式接续已完成：新研究明确固定 context.mode，账户/持仓选择与服务端只读 Tool 消费同一范围，旧 context 保持兼容。定向回归、IAB 草稿/返回及正式快更后的只读 Tool 调用通过，目标数据和 AI 任务数未变；实际活跃账户为空，未据此证明实际范围正向业务。见[全局模式回执](evidence/2026-10-18-global-account-mode.md)。下方在途重启和外部来源长任务仍开放，不重做已过的界面/上下文差集。

## 运行时验收门禁（未完成）

- [x] 真实 OpenAI-compatible Provider smoke：D59 使用已保存且显式选择的默认 openrouter/free、现有 api_key 完成正式研究 e55cf8da-a0db-4617-80ff-350111e804e6；请求/实际模型、默认修订、9125/9155 Token、上游实际 0 费用及 11 条真实 Tool 绑定可追溯，D60 的正文/来源/刷新/历史与模式隔离通过。按现行 V2 后继合同验收，原 V1 兼容读取不重生成。[生成与重建](evidence/2026-10-29-g3-openrouter-formal-retest.md)／[真实 Web](evidence/2026-10-30-g3-frontend-closeout.md)。
- [ ] 服务进程重启 smoke：在任务处于 `queued/running` 时重启服务，确认租约恢复和终态收敛符合设计。
- [ ] 外部来源长任务 smoke：连接实际新闻/财务等来源，确认 Tool 部分失败、超时和 citation 关联在真实链路下可解释。
- [x] 浏览器视觉/键盘 smoke：工作台宽窄、新建 Sheet、现行详情内来源审计、焦点返回、长内容与完整阅读通过。独立来源链 Sheet 已由[后继容器](../specs/2026-09-18-research-assistant-table-drawer.md)取代，不重新创建；[本轮修复与验收](evidence/2026-10-16-research-workbench-browser.md)区分真实实体读取、受控演示与零生成请求。

这些条件相互独立：本地 fixture、单元测试、源码 CI、能力探针或服务 healthy 不能代替真实业务。重启需覆盖目标服务内实际在途任务与终态收敛，不只重复隔离库 R1；已通过视觉或一次真实研究不能关闭其余两项。全部完成并核对 Spec 后才能归档整个 Task。

### R1：隔离数据库中的独立服务进程恢复（2026-10-04）

- [x] 独立进程领取 queued 研究并持久化 prepared 或 dispatched 请求；强制结束后由新进程恢复，验证未发送请求的新代次领取、已发送未知结果终态及旧代次提交拒绝。
- 输入：AiRunService、AiExecutionStateStore、全部 migration 和恢复状态机；使用专用临时数据库，不操作目标任务，不请求真实 Provider。
- [生命周期与提交证据](evidence/2026-10-04-ai-lifecycle-and-submission.md)：三个独立进程场景通过。该结果只证明其代码/数据库输入，不是目标实际模型请求中途重启的替代证据；输入未变不重跑。
- 10-20 后继：[研究 G2b](evidence/2026-10-20-research-execution-recovery.md)以当前目标 C1 镜像、保留基线、实际数据库和本地 SDK 传输通过 9 个场景/22 个进程/4 次强制结束，补齐当前产物的恢复、取消与结算证据。原真实 Provider 在途/长任务条件继续暂停，本轮客户端仅验 Web。

## 现行边界与证据

保留 `/ai-chat`、主导航“研究助手”和 AI 只读边界；不写入 Ledger、Position、Order、风险规则或策略版本。服务端选择 Provider/模型/Prompt 并持久化研究问题与真实上下文；客户端不得伪造 Token、成本、耗时、Tool、来源链或 fallback 等审计事实。结果按[版本化研究产物合同](../specs/2026-10-18-research-evidence-evolution.md)分别校验：V1 保持旧解析，现行新功能使用 V2；各自结果及 citation/Tool 关联通过才可成功，失败与未知项不补零，演示结果明确标记。

创建接口、持久化队列、专用执行器、领取/租约/恢复、上下文授权、Tool 审计、稳定分页、能力预检及 Desktop Query/交互均已有完成记录，查[原任务清单](../archive/tasks/2026-08-25-ai-research-workbench-history.md#任务清单)。原测试计数、旧环境描述与依赖图只作追溯，不恢复为当前实现计划；UI/请求和工程约束继续遵守 Spec 与 AGENTS。

[实现后验证](../archive/tasks/2026-08-25-ai-research-workbench-history.md#本轮验证记录实现后)、[23 项 AC 映射](../archive/tasks/2026-08-25-ai-research-workbench-history.md#验收标准映射)及[原 Review 结论](../archive/tasks/2026-08-25-ai-research-workbench-history.md#review-结论)完整保留；当前源码 CI 可复用[任务索引的固定基线](README.md#verified-source-baseline)，不能替代上述运行时门禁。
