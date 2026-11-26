# 竞技场重复思考审查与 OpenAI 对照

关联：[必要性审查](../reviews/2026-11-24-arena-thinking-necessity.md)、[任务 R4H9～R4H11](../tasks/2026-11-12-arena-replay-live.md)、[原失败的离线排查](2026-11-24-arena-finalization.md#本次截断的离线排查)。本轮用户明确要求从 `zshrc` 复用现有 OpenAI 密钥配置新提供方，用新模型检查同一失败输入是否仍有问题；没有恢复或重试比赛。

## 必要性审查结果

原提示及 Schema 的前六次请求成功，资料缺口下也已有合法观望路径。提示词压缩、RSI 空值表达和关闭思考是候选改进，尚无必须先做的因果证据；新增一套预算保护也不必要。因此本轮保持提示、领域合同、工具结果、原模型参数和来源不变，先执行独立模型对照。完整判断见审查正文，不把候选优化升级为启动条件。

## 凭据与新提供方

在 `/Users/yzin/.zshrc` 安全读取 `OPENAI_API_KEY`，没有 source 整份 Shell 配置，没有回显或把明文写入证据。官方 `GET https://api.openai.com/v1/models` 返回 200，目录包含 `gpt-6.2-astra`；该目录读取不生成内容。用户已经明确选择复用，不创建新密钥。

新增配置 `openai-arena`，地址 `https://api.openai.com/v1`，原生 OpenAI Chat Completions 适配器；仅启用 `gpt-6.2-astra` 的 `arena_live_research / arena-live-research-v6`。优先级 500，没有修改既有配置和研究默认模型。标准短上下文价格登记为每千输入 0.008 USD、输出 0.04 USD。[官方模型与价格](https://developers.openai.com/api/docs/models/gpt-6.2-astra)。密钥经正式保存接口交给应用加密持久化，随后只读 SQL 确认加密凭据存在，不读回其内容。

输出显式采用现有 `json_mode`，继续用完整 Schema 文本和严格本地 Zod 校验。原请求的原生 Schema 根节点是 `oneOf`；OpenAI 原生结构化输出要求根为 object，不能直接复用这一格式。[官方限制](https://developers.openai.com/api/docs/guides/structured-outputs)。本轮没有修改业务合同，也没有发送一个已知格式不兼容的原生请求。

## 一次正式用途准入

通过本机正式 `POST /api/v1/ai/providers/validation-plan` 固定唯一用途计划：`maxCalls=1`、单次输出 8,192 tokens、时限 600 秒，按输入保守估算为 0.669536 USD；未沿用旧比赛预算。

随后仅调用一次 `POST /api/v1/ai/providers/test-and-save`，`allowTextFallback=false`、`stopOnFirstFailure=true`。北京时间 14:39:16.928 记意图，14:39:21.313 通过；请求标识 `026c4170-93ce-4af3-a114-ec8b04574be7`，输入 5,536／输出 33 tokens，配置价格估算 0.045608 USD。保存返回 HTTP 201，独立 GET 确认启用及 v6 的 `liveValidation=passed`。

不带业务预算授权的公开读回仅剩 `budget_not_authorized`，这是付费用途的预算条件，不是验证失败；本轮独立样本具有自己的有限生成授权，没有为此改成零价格或修改门禁。

## 一次保存失败输入的对照

使用原失败请求 `4501aa99-c7d4-44b4-991f-626b3aa0acac` 的六条完整消息，保留 2026-11-02 09:45 的模拟时点、账户、两只 ETF 报价、各一根 15 分钟 K 线、RSI 空值及执行规则不可用结果。没有缩写提示词、删除 Schema、补齐资料或执行新工具。

私有脚本 `.recovery-artifacts/arena-openai-comparison-20261124/compare.mjs` 先以本地固定 HTTP 400 捕获序列化结果，确认全部消息内容相同，OpenAI SDK 使用 `max_completion_tokens=16384` 和 `response_format=json_object`，未发模型请求。实际模式先持久化唯一意图，再允许最多一次 `https://api.openai.com/v1/chat/completions` 出站；SDK 重试为 0，其他网络入口禁止，最大时限 600 秒。密钥只通过进程内存交给 SDK，没有写入脚本或请求记录。

实际执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，命令 `node .recovery-artifacts/arena-openai-comparison-20261124/compare.mjs run`。北京时间 14:39:54.716—14:40:00.607，进程退出 0。唯一新请求 `0db4b6a1-9998-4972-8e9f-3791172125f8` 的生成耗时 5.367 秒，回执模型为 `gpt-6.2-astra`，HTTP 成功且 `finish_reason=stop`，Schema 校验通过。

| 指标 | 原 Qwen／LM Studio 请求 | 新 OpenAI 请求 |
| --- | --- | --- |
| 生成耗时 | 2,345.7 秒 | 5.367 秒 |
| 输入 tokens | 10,979 | 10,136 |
| 输出 tokens | 120,093 | 154 |
| 报告 reasoning tokens | 109,950 | 0 |
| 最终正文 | 空 | 完整 JSON 决策 |
| 结束原因 | `length` | `stop` |
| 决策 | 无 | 空仓观望，10:00 再观察 |

新模型的简体中文摘要识别出：两只 ETF 缺少回放执行规则，报价不能用于下单；只有一根 15 分钟 K 线，不足以判断趋势。输出 `orders=[]`、不撤单，观察两只原证券并预约 `2026-11-02T02:00:00Z`（北京时间 10:00）。没有追加工具请求或制造交易资格。

按配置输入／输出价估算本次为 0.087248 USD，两次合计 0.132856 USD；这是配置估算，不是已核验账单。原始回执另外报告 `cache_write_tokens=10133`，账单可能按对应缓存写入费率计算，未用估算冒充精确扣费。

## 内存业务与保护核对

将新回复交给实际 `arenaLiveDecisionSchema`、`liveOrderCommand` 和 `arenaSubmitDecision`。仅使用冻结的账户、时钟、已有证券身份，不提供合格执行报价，不访问新行情／日历／数据库。内存账户正常接纳观望预约，revision 从 2 到 3，现金仍为 100,000 CNY，委托／成交／持仓保持为空，原冻结账户未改写。该检查通过不代表向真实比赛提交，也不认证历史追平。

前后 14 表逐行摘要对账：全部原记录缺失／改写为 0；新增仅一条新提供方，及原有后台估值追加 16 条。竞技场比赛、账户、周期和时间线均未新增或改写；旧队列保持原归属暂停、原唯一待办仍在，活动作业为 0。原 11 张业务表整体摘要相同；用途验证历史从 115 到 117，两条分别是同一次准入的 pending／passed，不是两次生成。

本轮实际模型生成共 2 次：新用途准入 1 次、保存失败输入对照 1 次。原模型调用、比赛操作、新工具执行均为 0；没有部署、重启、源码变更、提交或推送。完整回执、无密钥请求、输出、用量及保护摘要保存在私有 `.recovery-artifacts/arena-openai-comparison-20261124/`。

## 判断与验收边界

本例说明相同业务输入在新组合上能够迅速、合规地结束，现有提示与资料缺口不会使所有模型必然陷入重复思考；无需先实施前述整批防御性改动。原组合处理这类任务的稳定性应作为优先问题，模型能力差异是合理解释之一。

这次同时涉及模型、量化与服务实现、原生 grammar／JSON 模式以及模型默认推理行为等差异，因此不能把单次通过归结为纯智力，也不能单独排除原模型的模板或 grammar 引擎问题。本轮不追加原模型 JSON 模式实验，不把进一步归因设为本次完成条件。

必要性审查 R4H9、新提供方配置 R4H10、独立样本对照 R4H11 均通过。原失败与未知回执保持，R4H6／R4／T2d／T12.14 的完整历史及同账户实时仍未通过，不因本例成功而勾选或重试比赛。

## 后续独立对照

用户随后授权的 Luna 及原 Qwen 输出模式对照已另行完成，原模型文本 JSON 能正常结束单次回复，使输出模式／grammar 路径的嫌疑上升。该新证据更新问题优先级，不改写上文首轮观察、限制或原回执，详见[追加对照记录](2026-11-24-arena-json-mode-crosscheck.md)。
