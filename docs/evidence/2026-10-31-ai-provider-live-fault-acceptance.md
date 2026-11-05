# AI目标费用拒绝与真实Cloudflare期限验收

## 结论与执行边界

ZF-AC1～7全部通过。使用当前主Server公开API、原SDK和真实Cloudflare/Qwen，补齐费用拒绝、空正文/仅心跳首输出、输出间隔和跨用途绝对期限；故障由所属loopback中继注入。Cloudflare均已成功返回，交付故障不称为源站自然停顿。

本批实际模型请求5次，按独立操作0/1/1/1/2冻结；无模型/格式回退、自动重试或后续未授权用途。费用均为草稿费率的**估算0 USD**，没有上游实际账单证据；使用用户确认的Workers Free，不变更订阅、Gateway计费、保存价格或充值。原Cloudflare保持停用、空路由和标准正单价，默认仍为OpenRouter/free。

[规格](../specs/2026-10-31-ai-provider-live-fault-acceptance.md)、[完成任务](../archive/tasks/2026-10-31-ai-provider-live-fault-acceptance.md)。执行包`.recovery-artifacts/first-four-zero-20261031T040822Z`，指针`.recovery-artifacts/first-four-zero-current.json`；完整保护基线位于`first-four-zero-20261031T040509Z`。原两个零调用前置失败各自保留，不覆盖或重放。

## 目标费用拒绝：真实模型0次

费用拒绝使用原Cloudflare公开模型/标准价格、本机canary和合成Key，真实Key未解密或发出。目标`POST /api/v1/ai/providers/test`对以下四项均返回201、`config_error/invalid_config`：

- 原输入/输出双正价，未授权费用。
- 输入正价/输出0，未授权费用。
- 输入0/输出正价，未授权费用。
- 未知价格，返回费用缺失说明。

随后以唯一研究用途取得零价计划，再只改变费用字段，原计划提交`test-and-save`返回409“测试范围或费用已变化”。canary请求0、模型0，没有操作/健康审计新增；5份完整Provider、默认、旧健康逐ID及业务计数完全相同。该事实补配置AC-14的目标费用拒绝及AC-23/24费用确认过期子断言，不代收真实非零账单。

## 四个实源交付故障

所有样本通过主Server的公开`validation-plan`及`test-and-save`：两个待验手动JSON Mode用途依次为`research-generation-v2`与`authoring-analysis-v1`，计划maxCalls=2、每次输出预算8192、普通操作600秒、费用估算0。前三个样本中继只允许第1次外部派发；第一用途超时后第二用途没有发送。最后样本允许两次。

| 场景 | 目标实际结果 | 模型请求 | 保存 |
| --- | --- | --- | --- |
| Cloudflare成功后扣留全部正文 | 总122396.72ms；HTTP400、provider_first_output_timeout，阶段120000ms | 1 | 0 |
| Cloudflare成功后只交协议心跳 | 总126361.60ms；HTTP400、provider_first_output_timeout，阶段120000ms | 1 | 0 |
| 先交付真实不完整内容前缀后保持 | 总64122.66ms；最后内容至断开60012ms，HTTP400、provider_output_idle_timeout | 1 | 0 |
| 第一用途正常、第二用途20秒间隔交真实前缀 | 总595009.22ms；HTTP400、task_budget_exhausted，进入原5秒收尾 | 2 | 0 |

对应operationId依次为`7bde8626-a52d-4acf-99ef-94ea13cea226`、`5f18916d-f956-433e-b4c7-524a4eabc6dd`、`9e7d6c8f-de12-4228-9b76-71f0d52418bf`、`2a22404b-82ce-4b7b-a6ae-153ffccc7e28`。

真实上游连接/生成先占用数秒，首输出120秒自SDK对应阶段计时；上表同时保留总耗时和阶段期限，不把122/126秒误记为修改了默认120秒。没有假时钟或缩短策略。

绝对期限操作在`04:16:41.002Z`开始，第一用途于`04:17:32.696Z`交付完整原响应并通过；第二请求于`04:17:32.743Z`派发，`04:17:40.095Z`已完整取得Cloudflare响应，随后按20秒间隔交付真实内容帧，扣留可完成JSON和finish/DONE。`04:26:36Z`左右结束，第二用途没有另起600秒时钟。目标保留首项reported 179/122 Token和estimated 0 USD，第二项为unknown用量和estimated 0 USD。各请求的同一冻结截止精确字段继续复用原隔离直观测，本次额外证明主Server操作整体595秒及第二用途不重置期限。

所有源站响应状态、字节数、摘要、实际模型及可取得的usage分别保留在各`proof.json.events`。中继取得完整尾帧不代表目标SDK也已取得；目标失败审计的unknown没有被中继用量覆写，也没有补零。没有保存或导出完整原始SSE制品，仅保留元数据/摘要及故障所需的原内存前缀。

## 校验与失败记录

维护入口`scripts/ai-provider-target-fault-acceptance.mjs`默认仅计划，零Docker变更、零凭据读取、零外部调用；显式执行时核对准确Server ID/镜像/Compose标签、当前CF修订及密文摘要。10个关键目标编译模块逐字节匹配宿主，实际API仍由原主Server进程服务。本批没有生产源码、依赖、Schema、镜像或部署输入变更，复用原包级/源码CI和目标同步；没有重建或重启服务。

11项Node边界/生产Schema及请求参数联检、5个脚本语法和Prettier通过。包括输出防重放、严格Qwen/Chat/JSON Mode/关闭思考、出站计数、真实内容不可完成前缀、空白帧随原文保留、调用方断开及默认无副作用。项目ESLint忽略`scripts`，不将忽略计作lint通过。

最初零调用前置发现验收草稿缺少公开接口要求的mode、存储价格元数据不能直接用于输入、上游默认输出上限仅允许明确双零价格；脚本修正并加入生产Schema/校验器联检后通过。测试require路径错误及修正也只属于验收入口，生产代码未改，没有真实模型消耗。首项之后加固内容空白帧保留仅影响后续前缀交付，不影响已过的空正文证据；每场景源码摘要各自封存，没有重做已过墙钟。

最后保护首次使用“所有聚合都相同”的过严断言，因本批获准新增14条健康审计而失败；随后按原Spec的所属审计允许集逐ID核验，14条全部属于上述四个操作，658条旧审计均未变。原失败与正确对账分别保留，不重发模型。

## 最终保护

- 40张目标表聚合完全相同；允许变化的`ProviderHealthCheck`只追加14条所属操作/请求审计，658条原行逐ID摘要相同。
- 12张业务/审计表共598条逐ID摘要相同，主库研究/Tool/正式策略等未新增；没有新闻读取、来源续验、账户或金融业务写入。
- 5份完整Provider记录、密文、验证元数据和更新时间完全相同。Cloudflare保持原停用、空用途、原3模型及标准价格；研究默认仍为修订7、`openrouter/openrouter/free`，OpenRouter的`modelDefaults={}`、`modelReasoning={}`保持。
- 主Server ID、镜像`sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`及启动时间保持；Server/Backtest Worker/DSA healthy，主库活跃AiRun为0。没有部署或发布证明的扩张。
- Key仅在原容器内存及loopback API中使用；审计只含指纹/操作/请求/用量/费用，没有原Key。每个所属临时目录在证据完整导出后由维护入口清理，独立只读确认不存在。
- 三仓HEAD/索引保持、暂存0；没有提交、推送、重置、清理WIP或修改DSA/infra。文档链接、归档入口及所属diff检查结果保存在执行包。

主要证据：各`guard/headers/heartbeat/idle/deadline/{receipt,proof}.json`、`case-summary.json`、`configuration-state-after.json`、`database-after.json`、`providers-after.json`、`business-after.json`、`protection-verdict.json`、`runtime-after.json`、`git-after.json`和最终文档检查。

## 前四项对账

研究工作台、策略T19已完成并继续复用；SDK按原48项及JSON Mode原12项完成[逐项评审](../archive/reviews/2026-10-31-ai-sdk-final-ac-review.md)，四条本地协议、三类真实合法业务和目标/浏览器/持久化分别有证据。原Anthropic流式用途失败仍保留，没有标为实源通过。

AI配置Task继续持有实际非零上游费用、未获当前Provider正向资格的协议条件。本次只读检索既有健康审计和AiRun逐请求账本，未找到可复用的known/正金额历史记录；真实非零收费不在本轮0费用边界内。没有恢复旧额度、生成付费账单、换Provider或把当前缺口移入TODO。
