# 研究 G3 Provider returned error 诊断交接 Prompt

> 原始交接保留其历史时点的授权和证据。最新接续为原Task的G3-D30：[真实上游trace补验](2026-10-25-g3-upstream-trace-acceptance.md)。独立授权只用1次；HTTP200／完整SSE／stop／DONE，上游assistant原文仅2字符 `{"`，与SDK文本一致，业务JSON解析失败。新18文件及D29旧12文件在同镜像重建后双端保持；V2已关闭、临时策略撤除，余5次冻结，报告及G3整体未通过。下方8次、D20错误等均为原始交接时点，不能作为当前授权或预算。

请接手 ThesisLedger 研究 G3 的 `Provider returned error` 问题。正式 G3 尚未通过；已有进展主要是诊断接线和本地验证，不能据此宣称真实问题已修复。先只读恢复上下文，判断错误发生在哪一层，再提出一个具体、最小的后续验证步骤。

## 工作目录和权威入口

主仓：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。部署仓：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。

先遵循仓库及父目录的 `AGENTS.md`，读取其中要求的 Codex、RTK 规则。复用现有 Spec／Task，不新建平行方案。优先读取以下文件的当前摘要、G3-D8／D20／D21和最后复核：

1. `docs/tasks/2026-10-18-research-evidence-evolution.md`
2. `docs/specs/2026-10-18-research-evidence-evolution.md`
3. `docs/tasks/evidence/2026-10-25-g3-http-response-local.md`：当前11个代码／测试输入及摘要、本地检查和外部阻塞。
4. `docs/tasks/evidence/2026-10-25-g3-formal-free-sdk-recovery.json`及同名`.md`：最近正式失败、调用预算、官方关闭及数据保护证据。
5. `docs/tasks/evidence/2026-10-24-g3-free-finish-diagnostic.json`及同名`.md`：此前原生HTTP直连成功，证据范围与正式G3不同。

## 当前授权和停止条件

- 本提示仅授权初始只读分析与提出最小方案，不新增模型调用、不部署、不修改配置。剩余最多 **8次调用全部冻结**；继续真实请求必须另获用户明确授权，总费用上限仍为0元。用途复验、原生HTTP直连同样计入模型调用，不能另开预算。
- 保持 `openrouter/free` 和现有推理默认行为。保留原业务数据、旧AI记录、来源启停及20条数据路由。已通过证据和已确认的数据变动按原范围复用，不重复确认旧事项。
- V2写入在D20官方关闭更新后已核实为false，临时策略已撤除，`canCreate=false`；之后仅修改本地代码／测试／文档，未再开启。后续如获准进入目标，先核实实际状态；若临时开启验收，结束后必须经官方入口恢复关闭并核对。
- 用户要求首次失败即停，不自动重试；出现新卡点先说明现有证据、缺口和最小解除条件，再向用户确认，不深入扩搜其他模型或方案。
- 本聊天不处理移动端；Longbridge仍暂缓。不要发送消息到其他聊天、创建新聊天或调用其他Provider。
- 工作树有大量未提交WIP，保留无关变更，不stage／commit／reset／clean。Docker状态变更只能使用infra仓库维护的正式入口，不能手工Compose重建、复制容器代码、删卷或改Docker内部存储。

## 最近一次正式失败

研究对象为 `600519.SH`，近期变化模板，V2输入、`shadow`模式。唯一一次正式调用失败，随后已关闭V2，无自动重试：

- submission：`1ff23ce0-d87f-4c34-97b3-9b7905c7c8bd`
- run：`238c6c7e-54f7-4f46-9fc6-c7ffb0188a81`
- request：`7c00b7bd-963d-4ef0-8588-22c5d3b49d39`
- 错误：`code=transport_unknown`、`phase=stream`、`summary=Provider returned error`、`externalResult=unknown`；任务为`failed/research_unknown_outcome`，`result=null`。
- 兼容层已解析帧和SDK已提取正文／推理均为0；实际模型、结束原因、用量和上游实际费用未知。冻结免费定价估算0 USD不能写成实际费用已确认0。
- 未留存本次上游HTTP响应状态及原始错误体，旧请求容器已被关闭更新替换，既有日志核对没有补回该证据。不要继续广搜旧日志。

两个“0”来自SDK相关解析路径，不能证明原始HTTP没有返回SSE帧。正式提交接口的HTTP200只说明本地任务排队成功，不是本次OpenRouter响应状态。当前证据不足以区分HTTP错误返回、HTTP200中的SSE错误、传输失败或SDK识别失败；也不能把这次无正文错误直接归为JSON语法错误。

## 成功直连与最新正式请求不是同体对照

| 样本 | 已确认结果 | 请求体字节数及SHA-256 |
| --- | --- | --- |
| D19原生HTTP直连 | `openrouter/free`保留推理默认，HTTP200、完整SSE、`stop`；正文6,953字符、推理20,879字符，JSON／完整V2 Schema通过，上游报告费用0 USD。实际模型为`nvidia/nemotron-3.5-super-vl:free` | 22,542；`e1d08b2fe1f909e21f27489cba5322a0d5aa977d45818dd988d0c93f5741b0ca` |
| D20最近正式SDK调用 | 上述`Provider returned error`；上游响应事实缺失，未产出报告 | 22,517；`0beccf88684d2b4817f3143e0e391815b5936d8627af89cf8169ead3b723fb8b` |

这两份请求体的长度与摘要不同，不能用D19证明最新D20在SDK外也会成功，也不能直接归责SDK。若后续获准做对照，先核对冻结材料、最终发送请求和摘要；不要重新取材料后仍声称同体对照。`openrouter/free`会路由实际模型，D19的NVIDIA模型身份也不能套用到D20。

D20最终请求诊断已确认：`stream=true`、`response_format=json_schema`、`strict=true`、`provider.require_parameters=true`、`max_tokens=20000`、`include_usage=true`，实际fetch尝试1次；`reasoning`和`reasoning_effort`字段均未显式设置。实际SDK版本为`ai 7.0.107`、`@ai-sdk/openai-compatible 3.0.53`、`zod 4.4.3`。

## 已完成但尚未部署的响应诊断

D21a仅本地完成，新增诊断**尚未进入目标容器或真实采样**。D20的完整更新及14模块一致证据属于此前代码，不能拿来证明D21已部署。

现有实现会在HTTP响应进入SDK前记录首个响应的状态、内容类型、接收字节数、原始SSE事件／无效JSON事件／结束标志，并对错误及有界`error.metadata.raw`保留固定分类、数值码、摘要和遮蔽结构。未完成响应及诊断截断分别标记。

响应诊断最多2 KiB，可选地随失败运行诊断保存；原请求1 KiB、运行8 KiB、失败12 KiB边界保持。每帧／非SSE正文只暂存有界前缀，不保存凭据、headers、URL／query、Prompt、正文或推理原文。没有改变请求参数、认证、SDK解析、错误映射、重试、结算、默认模型和业务配置；旧记录无需重写。

优先检查以下代码接线是否足以回答本次分类问题，不先再扩展诊断机制：

- `apps/server/src/ai/ai-generation-http-response-diagnostics.ts`
- `apps/server/src/ai/ai-generation-http-response-error.ts`
- `apps/server/src/ai/ai-generation-http-request-diagnostics.ts`
- `apps/server/src/ai/ai-generation-stream-diagnostics.ts`
- `apps/server/src/ai/ai-sdk-generation-model.ts`
- `apps/server/src/ai/ai-sdk-generation.adapter.ts`、`ai-sdk-generation-facts.ts`、`ai-generation-failure-diagnostics.ts`
- `packages/schemas/src/ai-generation-http-response-diagnostic.ts`、`ai-generation-runtime-diagnostic.ts`

## 可复用的本地证据和外部阻塞

- Schema AI33项、Server AI420项通过；76项数据库集成跳过，不算数据库或目标验收。受影响的HTTP对照、生产Store JSON反读、类型和最新Server构建通过。未变输入证据已复用，无需重新跑全部测试。
- 11个诊断输入的Prettier、默认ESLint、依赖图和秘密扫描通过。新增断言已改为等价嵌套匹配，复杂度由27恢复到移除该断言得到的增量基线26；存量方法30／测试26警告保留，门限未改。尺寸脚本退出0、8项存量告警；无有效基线部分不能证明全仓尺寸ratchet。
- D21b全仓边界仍保留此前失败：`apps/mobile/release/acceptance-batch4-2026-10-24/controlled-fixtures.test.ts`的3条Server跨层引用。移动端归原任务修复，本轮未重跑、未豁免。这个部署前门禁问题没有证据能解释上游`Provider returned error`，不要转去调试移动端。
- 最近本地空间记录约14 GiB。Docker空间统计此前曾超时；这不是当前Docker健康证明。若获准进入部署，按正式入口做必要只读预检，新失败即停，不自动清理或重启Docker。
- CLI使用已有Node `v24.18.0`及pnpm `11.9.0`。Context Mode内置Node曾加载原生resolver签名失败，后续只读ESLint对照在已有`pnpm exec node`环境通过；不需要据此重装依赖或清空`node_modules`。

## 接手后的第一份答复

先只读给出一份简短结论：已能确定的失败层、仍未知的字段、现有D21诊断能否区分这些情况，以及一个具体的最小后续步骤。把假设与证据分开，不把本地测试、直连样本或移动端门禁当成正式G3已修复。

如确需部署或真实采样，先列出目标门禁、代码版本／输入摘要、精确调用次数、0元费用约束及V2关闭核对方式，等待用户新增授权。保留8次冻结预算，不先试一次。后续真正的完成标准仍按原G3 Task：定位并处理有证据支持的原因，正式V2报告与反读、引用归属／历史及相应发布验收通过，再恢复关闭V2并核对数据保护；不能用新增日志或测试数量代替。
