# 研究助手任务工作台实施任务

<a id="priority"></a>
> 完成状态（2026-10-31）：**本Task全部实现与运行时门禁通过，完成归档**。真实Provider、目标在途重启、真实新闻成功研究、现行V2实源交付故障/准备截止与引用审计分别有证据。[所属来源验收](2026-10-31-research-source-fault-acceptance.md)真实Cloudflare1次、费用估算0 USD，旧账本、主配置/默认及原业务保持。
> [全局优先级与接续规则](../../tasks/README.md#priority-policy)。沿用原任务编号和验收条件，仅按匹配证据更新叶状态，不扩大各次授权。

> 首次日期：2026-08-25；文档精简：2026-10-15。
> 最终检查点（2026-10-31）：T1～T10及视觉/键盘、R1隔离恢复按相同输入复用；D59/D60的V2真实Provider/Web、目标真实请求在途重启、真实新闻成功研究及本次来源交付故障/准备截止全部通过。版本归属见[原对账](../../evidence/2026-10-30-nonmobile-evidence-reconciliation.md)，运行事实见[新闻/重启](../../evidence/2026-10-31-research-source-and-restart.md)及[实源故障/截止](../../evidence/2026-10-31-research-source-fault-acceptance.md)。
> [现行 Spec](../../specs/2026-08-25-ai-research-workbench.md) · [原步骤、23 项 AC 映射与完整验证记录](2026-08-25-ai-research-workbench-history.md)

## 完成范围与证据复用

现行V2在提交前准备并冻结资料，生成阶段只对usable材料记成功Tool。本次按准备阶段、冻结质量及最终引用三层完成来源故障验收，没有伪造失败Tool或退回旧V1；原外部失败义务通过对应V2事实关闭。已成功的真实新闻、目标在途重启、D58～D60与既有视觉/键盘按输入复用；未知费用和不完整trace不冒充完整证据。[先前接续及保护](../../evidence/2026-10-31-cloudflare-first-four-continuation.md)。

真实请求沿用[AI SDK Task](2026-09-19-vercel-ai-sdk-integration.md)的既有预算/受控生成规则和[配置 Task](2026-09-21-ai-provider-model-usage-configuration.md)的用途、默认选择与冻结规则，不为验收自行切换收费模型、重置预算或修改默认选择。历史环境失败仅属于原观察时点，不作为当前连接状态。

10-17原账本额度与暂停决定保留；D58/D59、目标在途恢复及本次实源/Cloudflare分别使用各自独立授权，不由配置可启动或历史未用次数放行。任务完成不延长一小时准入或恢复旧额度。

10-18全局模式接续已完成：新研究明确固定context.mode，账户/持仓选择与服务端只读Tool消费同一范围，旧context保持兼容。定向回归、IAB草稿/返回及正式快更后的只读Tool调用通过，目标数据和AI任务数未变；当时实际活跃账户为空，未据此证明该账户的正向业务。见[全局模式回执](../../evidence/2026-10-18-global-account-mode.md)。其后运行门禁分别按下方证据关闭，不重做已过的界面/上下文差集。

<a id="运行时验收门禁未完成"></a>

## 运行时验收门禁（已完成）

- [x] 真实 OpenAI-compatible Provider smoke：D59 使用已保存且显式选择的默认 openrouter/free、现有 api_key 完成正式研究 e55cf8da-a0db-4617-80ff-350111e804e6；请求/实际模型、默认修订、9125/9155 Token、上游实际 0 费用及 11 条真实 Tool 绑定可追溯，D60 的正文/来源/刷新/历史与模式隔离通过。按现行 V2 后继合同验收，原 V1 兼容读取不重生成。[生成与重建](../../evidence/2026-10-29-g3-openrouter-formal-retest.md)／[真实 Web](../../evidence/2026-10-30-g3-frontend-closeout.md)。
- [x] 服务进程重启 smoke：目标研究 running、真实请求已收 HTTP 200 且响应仍在途时，经维护入口重启 Server；旧请求 unknown、预留保留、任务 failed 终态，新进程不重放。原成功研究、配置、密文、默认及两空字段保持。[证据](../../evidence/2026-10-31-research-source-and-restart.md)。
- [x] 外部来源长任务 smoke：连接实际新闻来源，按现行V2确认准备部分失败、超时、冻结质量和citation关联在真实链路下可解释。
  - [x] 真实新闻研究、长时间生成与 citation：同花顺十条新闻和行情形成 11 份来源，V2 报告成功、2 条断言/5 条数字，全部引用可反读；重启后报告完全相同，上游实报 0 USD。质量缺口保留；响应 trace 制品保存失败，不作为完整取证。11 条 Tool 均成功，不能代替失败/超时子场景。[证据](../../evidence/2026-10-31-research-source-and-restart.md)。
  - [x] 实际外部来源失败与超时：按现行V2映射为准备阶段失败/截止、冻结材料质量以及生成后合法引用；没有放宽准入、切换来源、伪造失败Tool或复写已成功研究。[本次完整证据](../../evidence/2026-10-31-research-source-fault-acceptance.md)。
  - 2026-10-30 前置已通过：按用户新授权只实读原同花顺单页十条元数据，目标精确续验 3→4、2026-10-23～10-30，有效至北京时间次日 00:36:39；其他八条准入及政策/凭据保持。[子任务已归档](2026-10-30-news-admission-recent-window.md)，[证据](../../evidence/2026-10-30-news-admission-recent-window.md)。模型仍使用当前免费 Provider/费用 0；真实研究结果继续独立验收。
  - 本次前置通过：用户授权原同花顺、600519.SH、2026-10-24～10-31元数据；先实读1页10条，再经维护入口准入4→5，有效至北京时间2026-10-31 12:13:51。其他8条准入及政策/凭据/默认保持，生效后未再次延长。
  - V2样本A通过：实际新闻10条返回后只断本地交付，价格正常。隔离研究7349919c-b735-4018-b905-e15f659a4fb0、真实Cloudflare1次成功，原V2合同、partial质量、2条断言/2条数字/1条价格Tool及全部引用反读通过；没有新闻引用，不把受控交付故障称为上游自然故障。
  - V2样本B先执行并通过：实际DSA_TIMEOUT_MS=120000、准备共享30000ms；收到新闻10条后保持交付，完整30018.84ms后RESEARCH_PREPARATION_TIMEOUT/HTTP408，AiRun/Tool/模型均0。生成600秒及Tool20秒策略各自保持。
  - 实耗：前置物理实读1页10条，两个消费样本合计2次DSA新闻请求、各10条；业务Cloudflare1次，无用途探针/重试/回退。Token实报4129/1769，费用估算0 USD，未取得实际账单。实际编译服务在独立HTTP/数据库验收，未在主实例新增报告；所属资源已导出清理，41张目标表、598条业务/审计及657条健康审计保持。
- [x] 浏览器视觉/键盘 smoke：工作台宽窄、新建 Sheet、现行详情内来源审计、焦点返回、长内容与完整阅读通过。独立来源链 Sheet 已由[后继容器](../../specs/2026-09-18-research-assistant-table-drawer.md)取代，不重新创建；[本轮修复与验收](../../evidence/2026-10-16-research-workbench-browser.md)区分真实实体读取、受控演示与零生成请求。

这些条件分别持有实际证据；本地fixture、单元测试、源码CI、能力探针或服务healthy未被用作真实业务替代。目标在途重启、实源成功研究、故障/截止和Web按各自输入验收，已完成整个Task的Spec对账。

### R1：隔离数据库中的独立服务进程恢复（2026-10-04）

- [x] 独立进程领取 queued 研究并持久化 prepared 或 dispatched 请求；强制结束后由新进程恢复，验证未发送请求的新代次领取、已发送未知结果终态及旧代次提交拒绝。
- 输入：AiRunService、AiExecutionStateStore、全部 migration 和恢复状态机；使用专用临时数据库，不操作目标任务，不请求真实 Provider。
- [生命周期与提交证据](../../evidence/2026-10-04-ai-lifecycle-and-submission.md)：三个独立进程场景通过。该结果只证明其代码/数据库输入，不是目标实际模型请求中途重启的替代证据；输入未变不重跑。
- 10-20 后继：[研究 G2b](../../evidence/2026-10-20-research-execution-recovery.md)以当前目标 C1 镜像、保留基线、实际数据库和本地 SDK 传输通过 9 个场景/22 个进程/4 次强制结束，补齐当前产物的恢复、取消与结算证据。原真实 Provider 在途/长任务条件继续暂停，本轮客户端仅验 Web。

## 现行边界与证据

保留 `/ai-chat`、主导航“研究助手”和 AI 只读边界；不写入 Ledger、Position、Order、风险规则或策略版本。服务端选择 Provider/模型/Prompt 并持久化研究问题与真实上下文；客户端不得伪造 Token、成本、耗时、Tool、来源链或 fallback 等审计事实。结果按[版本化研究产物合同](../../specs/2026-10-18-research-evidence-evolution.md)分别校验：V1 保持旧解析，现行新功能使用 V2；各自结果及 citation/Tool 关联通过才可成功，失败与未知项不补零，演示结果明确标记。

创建接口、持久化队列、专用执行器、领取/租约/恢复、上下文授权、Tool 审计、稳定分页、能力预检及 Desktop Query/交互均已有完成记录，查[原任务清单](2026-08-25-ai-research-workbench-history.md#任务清单)。原测试计数、旧环境描述与依赖图只作追溯，不恢复为当前实现计划；UI/请求和工程约束继续遵守 Spec 与 AGENTS。

[实现后验证](2026-08-25-ai-research-workbench-history.md#本轮验证记录实现后)、[23 项 AC 映射](2026-08-25-ai-research-workbench-history.md#验收标准映射)及[原 Review 结论](2026-08-25-ai-research-workbench-history.md#review-结论)完整保留；当前源码 CI 可复用[任务索引的固定基线](../../tasks/README.md#verified-source-baseline)，不能替代上述运行时门禁。

## 最终一致性评审

- [x] 原23项AC映射、后继容器和V2合同逐项对账，T1～T10原实现/确定性检查与当前运行门禁分别有适当证据。
- [x] 真实Provider、目标在途重启、实源成功研究、来源交付故障/完整准备截止及浏览器视觉/键盘均通过；输入未变的证据复用，未补造费用、Tool或trace。
- [x] 授权、主实例/隔离证据、引用及保护边界一致，无未完成叶、阻塞问题或转入TODO的当前义务。
- [x] 导航、依赖与归档链接同步，现行Spec保留；未关闭其他AI配置/SDK费用、协议和期限矩阵。

结论：本Task范围通过并归档；前四项中的其他Task继续按自身剩余条件维护，不提升为四项全部完成。最终事实与命令见[实源故障/准备截止回执](../../evidence/2026-10-31-research-source-fault-acceptance.md)。
