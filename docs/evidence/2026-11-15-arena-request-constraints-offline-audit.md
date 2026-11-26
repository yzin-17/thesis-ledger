# Arena 提示词、工具与 JSON 约束离线审计

## 范围与结论

2026-11-15，按用户要求对比已有成功与失败请求。只读取本地数据库、代码和已部署编译产物，并使用完全拦截的内存响应检查请求构造；没有访问模型服务、加载模型、重试比赛、改写业务记录、操作队列、部署或修改配置。LM Studio 配置已经由用户确认，本次不重新要求配置确认。

发现确定的能力表达不一致：历史回放不提供日线、新闻、财务和网页工具，但通用输出 Schema 仍允许这些请求；用户消息中的 `protocol.allowWebSearch=true` 也没有反映回放期间网页不可用的有效状态。已有 15 次日线工具请求被执行端拒绝，证明不一致会产生实际无效步骤。

尚未发现一个必然导致长输出的、无法满足的 JSON 合同。相同系统提示和 Schema 已有大量正常响应；三次截断具有相同回放时刻、完全相同系统提示的已有正常模型响应对照。冻结消息未完全相同，实际采样和历史 HTTP 原文未冻结，因此这些是观察性对照，不能作为单变量因果验证。

先前用户日志已经证明最后一次截断在推理字段持续重复；本次发现的能力不一致可能增加无效推演，但不能据此认定它是四次循环的根因。完整回放与实时衔接仍未验收。

## 样本与统计口径

目标比赛：`6f41c462-176a-4d6f-957e-331015e2af0f`（`test · 历史回放`）。从 `ArenaLiveCycle` 仅读取 `id/state/reason/input/requestAudit`，在读取进程内汇总，不向模型或其他来源发送业务资料。

- 63 个周期：55 个成功、8 个失败。
- 143 笔模型调用：139 笔有经过原调用链校验的 JSON 输出，4 笔为 `output_truncated`。
- 55 个成功周期包含 131 笔正常模型调用；另外 8 笔正常 JSON 输出属于最终失败的周期，不能算成成功决策。
- 139 笔输出中，69 笔为 `action=tools`，70 笔为 `action=decision`。本次将全部已有输出交给已部署的当前 Schema 再做内存校验，139 笔均通过；这不替代委托、预约等业务校验。
- 61 个周期实际到达首次模型调用；2 个周期未发送模型请求。61 份首次冻结消息没有完全相同的消息组。

以下分组依据完整 `system.content` 的 SHA-256，而不是当前源码重建的提示词：

| 系统提示摘要前缀 | 系统字符数 | Schema 字符数 | 全部调用／正常输出／截断 | 首次调用／正常输出／截断 |
| --- | ---: | ---: | --- | --- |
| `758e828e3642` | 6003 | 5044 | 6／6／0 | 1／1／0 |
| `1777b8414ae9` | 6007 | 5044 | 19／18／1 | 8／7／1 |
| `72f216af2048` | 6388 | 5044 | 118／115／3 | 52／49／3 |

三组提示末尾的 JSON Schema 完全相同，合同均为 `arena_live_research/arena-live-research-v2`。提示词变更主要涉及执行证据、止损及中文摘要等业务说明，不是三种不同 JSON 输出结构。这些分组不是对失败概率的受控估计。

## 已有正常与截断响应对比

时间均为 Asia/Shanghai；“正常”仅指模型完成并交付有效 JSON。

| 回放时刻 | 截断请求 | 正常对照请求 | 系统提示相同 | 输入／输出 token：截断 → 正常 |
| --- | --- | --- | --- | --- |
| 11 月 3 日 10:45 | `6c066acb-a259-4499-ac44-05fdae74517e` | `dc4a5e96-537d-4e62-ac1d-8941dd14a8af` | 否 | 2659／99741 → 2873／677 |
| 11 月 6 日 14:30 | `53368c38-2223-4e6f-963f-70b3bbccac6e` | `d799edb9-545b-4c5a-9d6b-c356207364f7` | 是 | 2866／99534 → 2873／526 |
| 11 月 6 日 14:45 | `991757ff-169f-4f4f-bf0b-771f5af9c3cc` | `ac21bfbe-140d-429e-95c6-7adf56157b78` | 是 | 2874／99526 → 2870／919 |
| 11 月 10 日 13:01 | `72df5e24-e09a-4a7d-b14f-a5e46c5f803f` | `bc1d15d7-976d-420c-935a-f6d77f162db1` | 是 | 2859／99541 → 2862／793 |

四组正常响应都是工具请求。11 月 10 日的正常响应来自周期 `47d52aac-5590-415d-95d0-778c18a225d7`；该周期最终因 `appointment_in_past` 失败，因此不能将它称为成功决策。它仍能证明该时刻与系统提示组合并非无法产出工具 JSON。

逐字段比较四组首次 `user.content`：

- 协议、`asOf`、本金、持仓、委托、成交、观察证券和开始研究指令相同。
- 11 月 6 日两组与 11 月 10 日一组只在 `ownAccount.revision` 和 `ownAccount.wakeups` 有差异；预约标识、创建时间及触发条件等不完全相同。
- 11 月 3 日另有市场会话字段与系统提示变化，正常对照多出 `marketSession={date:2026-11-03,state:open,reason:null}`。
- 没有一组是完全相同的请求；旧审计也不包含实际采样、模板和加载参数，不作“只差随机采样”的结论。

四次截断均为首次调用，消息只有 `system` 与 `user`，工具执行数均为 0。排除这些失败由本轮工具结果过长、工具往返或多轮历史累积直接造成。相同模型工具请求在同一周期内连续重复的已有记录为 0，也没有发现应用重复执行同一回复的迹象。

## 工具协议与能力表达

### 工具由应用 JSON 驱动

[`live-research-runner.ts`](../../apps/server/src/model-arena/live/live-research-runner.ts) 的流程是：模型交付 `action=tools` JSON，应用校验并执行 `requests`，将本轮对象作为 `assistant` 消息加入历史，再以 `user` 消息交回 `toolResults`。`action=decision` 才提交决策。这是现有应用协议，不能因未使用原生 `tool_calls` 就判定实现错误。

输出 Schema 的顶层是互斥的 `tools` 与 `decision` 两个分支。工具分支只要求 `action/requests`，不要求 `decision/wakeups`；决策分支才要求完整决策及预约。最后一次推理反复出现的草稿形状：

```json
{"action":"tools","requests":[{"name":"quote","symbol":"588000.SH"}]}
```

该形状在当前部署的稳定工具分支中校验通过；历史冻结 Schema 的同一分支也明确允许它。因此无法将循环解释为“这个报价请求无法符合输出 Schema”。推理字段中的草稿不能当作已交付指令执行。

### 确定存在的能力不一致

[`live-research-messages.ts`](../../apps/server/src/model-arena/live/live-research-messages.ts) 明确说明回放期间日线、新闻、网页不可用，财务未接入；但 [`arena-generation-contracts.ts`](../../packages/schemas/src/arena-generation-contracts.ts) 的通用工具枚举仍包含 `news/financials/web_search`，`bars/indicators.timeframe` 仍允许 `1d`。

[`live-research-tools.ts`](../../apps/server/src/model-arena/live/live-research-tools.ts) 在有历史时点时先进入回放分支；不会因协议中的 `allowWebSearch=true` 改用当前网页来源。其余未接入回放工具返回 `replay_tools_unavailable`。没有观察到用当前资料绕过历史边界。

实际 224 笔工具执行：

| 工具 | 次数 |
| --- | ---: |
| `search_instruments` | 21 |
| `quote` | 118 |
| `bars` | 51 |
| `indicators` | 34 |

其中 173 笔可用、51 笔不可用。15 笔日线请求（7 笔 `bars`、8 笔 `indicators`）全部返回 `replay_tools_unavailable`；没有实际请求新闻、财务或网页。不能把其余 36 笔不可用工具一并归因于此次能力不一致。

提示词已经说“来源限制无需重复推演”，但将不可用分支继续列为可选结构，仍增加模型判断负担。用户日志中的重复检查与这种负担相符，仅构成可能关联；四次截断没有执行工具，不能把日线失败当作它们的直接触发链。

## JSON 请求格式的内存检查

目标容器 `thesis-ledger-dev-thesis-ledger-1`，工作目录 `/app/apps/server`。读取实际运行依赖版本：`ai@7.0.107`、`@ai-sdk/openai-compatible@3.0.53`。

从已部署 `dist/src/ai/ai-sdk-generation.adapter.js` 调用纯请求构造链，注入内存 `httpClient`，将进程级 `globalThis.fetch` 改成一旦调用就抛出 `NETWORK_FORBIDDEN_OFFLINE_AUDIT`。使用 `https://offline.invalid/v1`，返回人工构造的有效工具 JSON；没有连接模型或写入业务审计。

进行了两个案例，每例只有一次被拦截的 SDK 请求：

1. 从旧冻结系统提示提取 v2 JSON Schema，用 SDK `jsonSchema` 包装后传入原生结构化模式，同时保留旧冻结消息。
2. 使用当前部署的真实 Zod 合同和 Schema 提示构造函数检查当前转换路径。

共同结果：

- 请求正文只有 `model/response_format/messages`。
- `response_format.type=json_schema`，`json_schema.strict=true`，名称为 `response`。
- 消息仍为 `system/user`，内容与传入值一致。
- 未发送原生 `tools/tool_choice`，没有出现两套调用通道并存。
- 未发送 `temperature/top_p/presence_penalty/frequency_penalty/stop/max_tokens` 或思考开关。
- 人工工具 JSON 均正常解析。
- v2 包装案例的提示 Schema 与发送 Schema 相同；当前 Zod 案例只有 `$schema` 声明从 Draft 2020-12 变为 Draft 7，其余结构一致。没有发现字段要求、分支或默认值冲突。

旧审计只冻结消息、合同、模型和预算，没有冻结当时实际发送的 `response_format`。v2 案例是按已知 SDK 路径的重构，不是恢复了历史 HTTP 原文；当前 v3 合同也不能冒充旧 v2。内存响应能验证应用构造与解析，不能证明远端 LM Studio 的语法约束、思考切换与模型采样兼容性，更不能认证重复生成已解决。

## 建议的最小修正方向

1. **统一有效能力表达**：先确定回放能力投影及合同策略，再同步收敛提示词、用户上下文和发送的工具 Schema；仅列出当次可使用的工具及周期。保留后台执行门禁和历史资料核验，不能靠改提示词代替校验，也不能默默改变已有协议中 `allowWebSearch` 的原始含义。
2. **明确一次回复的边界**：在现有 JSON 协议下明确工具回复只交付 `action=tools/requests`，输出后等待 `toolResults`；只有 `action=decision` 才同时提交完整决策和预约。该改进减少歧义，但不能声称现有模型一定误解了阶段。
3. **按故障点减轻无关约束负担**：首次工具选择仍携带整份下单、止损和日期合同；旧提示中 Schema 占 5044 字符。评估分阶段表达时必须保持输出合同、费用和执行门禁，不直接删除必要业务约束或迁移调用协议。本次没有实施该调整。

实施后先以冻结样本和内存构造检查能力、提示与 Schema 同步；真实模型验证仍需新的明确授权，不随离线检查自动启动。

## 证据边界与本次写集

- 用户先前提供的 LM Studio 日志原件目前不在原路径。本次不重新提取其思考正文，只引用[既有日志分析及文件摘要](2026-11-14-arena-output-truncation-investigation.md#用户提供的-lm-studio-日志补证)。
- 当前工作区已有 `onFill` 等其他改动；历史对比采用数据库冻结的 v2 提示，不使用当前源码替换历史请求，未修改这些改动。
- 本次仅新增本证据并更新活动 Task 的摘要与完成叶；没有源码、依赖、Schema、运行态或模型配置写入。
- 审计结束时复核周期仍为 63、模型调用仍为 143。诊断部署与本次离线审计均不解除禁止模型调用和比赛重试的限制。
