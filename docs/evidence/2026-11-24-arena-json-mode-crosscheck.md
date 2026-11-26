# Luna 与原 Qwen 输出模式对照

关联：[活动任务 R4H12／R4H13](../tasks/2026-11-12-arena-replay-live.md)、[上轮 Astra 对照](2026-11-24-arena-openai-comparison.md)、[原生输出失败排查](2026-11-24-arena-finalization.md#本次截断的离线排查)。用户要求用 Luna、原模型的 JSON 模式各对照一次，保持同一份保存输入，不重试比赛。

## 输入与执行边界

唯一输入来源仍为原失败请求 `4501aa99-c7d4-44b4-991f-626b3aa0acac` 的六条完整消息，含原系统提示、Schema 文本、模拟时点、账户及已返回的工具结果。不删减提示、不补资料、不改变原模型采样或推理参数，不执行新工具，也不向比赛提交结果。新调用单独记录，不续用旧运行预算。

Luna 选择官方目录可见的 `gpt-6-luna`，使用已授权复用的 OpenAI 密钥、现有 JSON 模式及严格本地合同；16,384 输出 tokens／600 秒保护，与上轮 Astra 对照相同。[官方模型说明](https://developers.openai.com/api/docs/models/gpt-6-luna)。Luna 仅作独立样本生成，本轮未把它加入已保存提供方或新增资格探针。

原 Qwen 保留原 LM Studio 地址、精确量化型号、完整消息和空输出上限；仅改变请求输出格式。独立调用设置 600 秒宿主停止界限，以免无结果时长期占用；该界限不进入请求体，本次正常结束未触及它。

私有入口 `.recovery-artifacts/arena-json-mode-crosscheck-20261124/run-comparison.mjs` 的 `capture` 模式先用本地固定 400 验证请求差异，模型调用为 0。断言确认 Luna 的请求对象相对上轮 Astra 只改变 `model`；Qwen 的请求对象除 `response_format` 外与原 native_schema 离线重建体完全相同。所有消息内容保持一致。各实际模式先以排他写保存意图，再允许一次对应生成请求；SDK 重试为 0。

## Luna 检查

实际请求 `03918980-ee42-4fec-8e99-e28e47d9f595`，北京时间 15:09:35.033—15:09:39.291，耗时 4.258 秒；HTTP 200，返回模型 `gpt-6-luna`，结束原因为 `stop`。报告输入 10,136／输出 267 tokens，其中 reasoning 103 tokens，完整业务 Schema 校验通过。

回复为 `action=decision`，保持 100,000 CNY 现金，`orders=[]`、不撤单，观察原两只 ETF 并预约北京时间 10:00。摘要准确指出执行规则不可用、仅一根 15 分钟 K 线及 RSI 为空，没有制造交易资格。

随后通过实际 `arenaLiveDecisionSchema`、`liveOrderCommand`、`arenaSubmitDecision` 在冻结内存账户验证：正常接纳未来预约、revision 2→3，现金、委托、成交和持仓保持；原冻结账户不变。没有访问新行情、执行证据或数据库。

## 原 Qwen 检查

第一条请求 `f90ecfcc-2eab-4846-bd4a-069923b16558` 使用 `response_format={type:json_object}`。LM Studio 在生成前立即返回 HTTP 400：`'response_format.type' must be 'json_schema' or 'text'`。应用分类为 `configuration_invalid / rejected_before_generation`；这不是模型输出失败，没有生成 token 或可用于能力判断的回复。原拒绝及首次执行脚本保留，不改写为通过。

为完成用户要求的一次去原生 Schema 约束对照，使用项目既有 `json_validated`：请求体省略原生 `response_format`，完整 JSON Schema 仍在原系统消息中，回复继续受严格本地 Zod 校验。该调整只发生在独立调用，不保存为提供方模式、不恢复比赛。

实际生成请求 `97074db8-a1af-4094-be9c-a2deb877c4b2`，北京时间 15:11:10.601—15:11:19.365，耗时 8.764 秒；HTTP 200，结束原因为 `stop`。报告输入 10,979／输出 306 tokens，其中 reasoning 178 tokens。思考摘要为 625 字符，采样中最长重复行／段落次数均为 1；完整业务 Schema 和当前工具能力校验通过。

回复为 `action=tools`，请求两只 ETF 的 `60m` K 线及 RSI，各一次，共四个工具请求；它正常结束本次回复并等待工具结果。按单次对照边界，没有执行这些请求或追加模型调用。因此该项只证明单次 JSON 回复正常结束，不证明最终决策、工具结果可用或后续循环完成。

精确返回型号为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`。覆盖整个 Qwen 对照窗口的目录读回为 15:09:35.066—15:13:16.757：型号、Q4_K_M、22,066,041,088 字节、加载实例及配置保持一致，加载上下文为 131,072。文本 JSON 脚本自身只核验回复型号，额外量化／实例证据由窗口前后目录对账提供，见 `qwen-window-identity.json`；没有把型号匹配冒充单独的量化核验。

## 结果比较与判断

| 组合 | 耗时 | 输入／输出 tokens | reasoning tokens | 结束与业务分支 |
| --- | --- | --- | --- | --- |
| 原 Qwen／native_schema，复用旧回执 | 2,345.7 秒 | 10,979／120,093 | 109,950 | length，正文为空 |
| 原 Qwen／文本 JSON，本轮 | 8.764 秒 | 10,979／306 | 178 | stop，合法工具请求，未继续执行 |
| GPT-6 Luna／JSON 模式，本轮 | 4.258 秒 | 10,136／267 | 103 | stop，合法观望决策及内存提交 |
| GPT-6.2 Astra／JSON 模式，复用上轮 | 5.367 秒 | 10,136／154 | 0 | stop，合法观望决策及内存提交 |

原 Qwen 在同一保存输入、相同报告输入 tokens、相同量化模型下，去掉原生 Schema 约束后能够快速正常结束，显著提高原生结构化输出／grammar 路径触发或放大退化的嫌疑。Luna 同样能完成该场景的观望，不能再将原失败优先笼统归因为纯模型智力不足。

这是每个新组合一次实际生成的证据，原 native_schema 基线仍为历史回执，未在本轮重复生成；未固定随机种子，也未取得原失败时的完整服务端内部状态。故本例支持优先处理／进一步核对输出模式路径，尚不足证明它是唯一根因，亦不认证原模型长期稳定或完整研究循环通过。

## 调用与保护对账

本轮向生成接口发送三次 HTTP 请求：Luna 一次成功、原 Qwen JSON 对象一次生成前拒绝、原 Qwen 文本 JSON 一次成功；实际完成生成共两次。早期脚本结果字段 `generationRequests` 计的是生成接口出站次数，不能把生成前拒绝的那一次计作实际生成；原字段保留，分类以 Provider 明确回执为准。没有重复任何已经开始生成的样本，没有新资格探针、工具执行或比赛操作。

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。实际命令为 `node .recovery-artifacts/arena-json-mode-crosscheck-20261124/run-comparison.mjs <luna|qwen|qwen-text-json> run`，对应退出码分别为 0、1、0；宿主包装的起止与日志保存为各 `<组合>-command.json/.log`。拒绝回执、正常回复、请求内容与差异断言、用量、思考摘要和身份核验均保存在该私有目录；明文密钥和思考正文不写入证据。

前后 14 表的全部原记录缺失／改写为 0，ProviderConfig 及比赛、账户、周期、时间线均未变化；仅原有后台估值追加 21 条。资格回执保持 117，原 11 张业务表整体摘要相同。共享队列保留原归属暂停、唯一旧待办保留、活动作业为 0。没有更改已保存的提供方模式、模型集合、默认路由或密钥，没有部署、重启、提交或推送。

R4H12 的 Luna 单次对照及内存业务范围通过；R4H13 的原模型 JSON 对象不支持事实、文本 JSON 单次回复和身份范围完成并通过对应检查。原 HTTP 400 与旧截断事实保持，原比赛不重试，完整历史／实时及后续工具循环仍按原未验收范围持有。
