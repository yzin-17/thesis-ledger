# 日线来源选择与研究默认模型配置

## 用户选择与落实

用户授权自行选择日线，随后明确选择现有 OpenRouter。日线采用现行已准入的 `tencent/tencent`、ETF `159516.SZ`、前复权 `qfq`，Policy revision 36 保持原值。股票 `600519.SH` 尚无日线路由，不把 ETF 成功扩展为股票已可用；四周期 bars 与实际指标范围见[公开消费证据](2026-10-05-market-period-public-consumption.md)。

目标原有 OpenRouter 来自环境配置，模型为 `nvidia/nemotron-3-super-120b-a12b:free`，没有研究报告执行路由。使用相同地址、模型和已有凭据，通过产品 `validation-plan`/`test-and-save` 入口配置研究用途；凭据仅在容器内使用，没有输出到宿主机日志。

官方[模型页面](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free) 当前声明输入/输出免费。验证计划为 1 次请求、最多 8192 输出 token、估算 0 USD；选择 json_validated/manual，保持明确验证模式，不自动更换模型或重复失败请求。操作 `7957be34-eb67-407b-9943-3c99355e3e71` 返回 201，研究用途真实验证成功并保存。

随后通过带 expectedRevision 的设置入口，把研究默认设为 OpenRouter/上述模型，revision 0→1，返回 200；候选 enabled、health healthy、价格已配置。该步骤证明用途可调用和默认已保存；单笔/周期 Journal 成功报告、目标在途恢复与浏览器消费另行验收。

日志：`/tmp/openrouter-research-validation-target.log`、`/tmp/openrouter-research-default-target.log`。

## 账户保护复核

原两账户完整 HTTP 响应摘要与旧值不同，响应同时包含共享 instrumentDirectory；不能继续沿用“完整响应哈希未变化”的历史措辞。当前只读数据库复核：账户 `0e9677d2-98c6-45b1-8bc3-8d07b9209180` 的 ledgerRevision/projectionGeneration 为 16/16，状态最后更新 `2026-10-01T10:13:52.615Z`；账户 `93337db7-a5a0-40c5-823f-63577e9e924b` 为 1/1，最后更新 `2026-10-03T17:00:37.601Z`。全部追加事件的创建/记录时刻也早于本次配置与行情读取，未出现本次写入。

后续真实 AI 验收将对 accountId、ledgerRevision、projectionGeneration、events、effective 的语义字段单独取摘要，排除共享目录的变化，同时保护标记验收账户；不重建账户、不修改旧快照或重置目标数据。

## 单笔实际报告与后续修复

复用标记账户提交单笔真实 Run `a488ce1a-6485-43f6-b165-e56446faffd1`，记录 queued→failed，Provider/Model 确认为所选 OpenRouter。失败码 research_schema_invalid：缺 conclusion、evidence 元素为字符串，并缺 risks 等报告字段。服务端维持失败终态，没有把通用 JSON 当成有效报告或重试旧任务。

代码核对确认文本校验模式未给模型提供实际生成字段结构，只要求合同名称。修复按[输出字段 Spec](../../specs/2026-10-05-research-json-prompt-contract.md)/[Task](../../archive/tasks/2026-10-05-research-json-prompt-contract.md) 承接，输出和引用校验保持严格。此 Run 不代表 Journal AI 成功验收。实际提交前后，两受保护账户与标记账户的上述语义字段摘要一致；未写交易或保存新复盘快照。日志为 `/tmp/journal-openrouter-target-explanation.log`。

## 原生 Schema 与新请求验收

同一现有实例与模型通过产品入口验证 native_schema/manual。计划 1 次、最多 8192 输出 token、估算 0 USD，保持不自动回退；操作 `9ff1725c-04f6-418f-adff-24b59b887103` 返回 201，liveValidation passed、readiness ready 后保存。默认仍为 OpenRouter/同一模型、revision 1。日志 `/tmp/openrouter-research-native-validation.log`。

新单笔 Run `32d3f88f-abb9-4ffc-9bb0-ccc5bb5d9089`：queued→succeeded，schemaAccepted true、generationStatus complete，1 次实际调用，使用量已报告。结果包含结论、证据、风险、未知、免责声明和服务端元数据；1 条证据绑定 getJournalReview、sourceId 和服务端 toolCallId。日志 `/tmp/journal-openrouter-native-explanation.log`。

新周期 Run `3f675262-efc4-4695-bd43-f8cb665884b8`：统计范围为 2026 年 1 月、1 个合格交易周期与 2 个合格减仓片段；queued→succeeded，schemaAccepted true、generationStatus complete，1 次实际调用，使用量已报告。模型仅返回“无需买卖指令，仅复盘统计。”和免责声明，evidence 为空；只确认结构化执行和终态链路成功，不能宣称有依据的周期解读或内容质量验收完成。日志 `/tmp/journal-openrouter-native-period.log`。

两次请求前后三账户账本语义摘要均一致。没有写入交易、保存新快照、重试或覆盖旧失败 Run；后者仍为 failed/research_schema_invalid。原生模式使用目标已有 SDK，新文本提示代码仍未部署，目标在途恢复与浏览器真实结果消费继续独立验收。
