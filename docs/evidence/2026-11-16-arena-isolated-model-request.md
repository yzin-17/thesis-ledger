# 单次隔离真实模型首回复验证

## 授权与结论

2026-11-16，用户授权一次隔离真实模型验证：保持现有模型和参数，不启动或重试比赛；再次截断立即停止，不反复重试。对应[活动任务 T2d-CM](../tasks/2026-11-12-arena-replay-live.md)及[规格 AC09](../specs/2026-11-12-arena-replay-live.md)。

本次仅发送一次生成请求，正常以 `stop` 结束，输出通过当前 scoped Schema；没有截断、自动重试或第二次生成。模型返回工具请求后立即结束本次验收，没有执行工具、提交决策或修改比赛。提供方及全部比赛业务摘要前后一致。

本结果证明当前配置和冻结样本上的单次首回复通过，不能据此认定重复生成已永久解决，也不证明某项提示修改是原问题的根因。真实工具往返、决策提交、历史执行规则及回放到实时仍未验收。

## 输入与参数保持

| 项目 | 实际值 |
| --- | --- |
| 提供方／地址 | `lmstudio`，`http://192.168.5.20:6789/v1` |
| 模型 | `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m` |
| 适配器／模式／传输 | `openai-compatible-chat`／`native_schema`／`single` |
| 当前合同 | `arena_live_research/arena-live-research-v5` |
| 冻结周期 | `7e155817-ccfc-45bc-b812-01d9b8906beb` |
| 冻结业务时点 | `2026-11-10T05:01:00.000Z`，即北京时间 11 月 10 日 13:01 |
| 冻结账户／协议 | 直接读取旧周期输入，没有改写或创建周期 |
| 应用输入／输出 token 上限 | 均为 `null`，没有添加 `max_tokens` 等上限 |
| 请求总时限 | 沿用原周期无限总时长语义，`timeout={}`，没有增加模型输出截断阈值 |
| 采样与思考 | 保留当前路由；未新增、删除或覆盖温度、top-p、思考开关等参数 |

实际 JSON 请求体只有 `model`、`response_format` 和 `messages` 三个字段；没有 `stream=true`、停止串或额外原生工具定义。未修改 LM Studio 设置，也没有为验证切换模型、量化、上下文长度或思考方式。模型服务内部设置沿用用户此前确认的配置，本轮没有重新读取或推断其具体采样数值。

使用实际部署的合同、消息构造器、提供方运行配置、严格就绪路由和 SDK；没有额外拼接新的研究意图或把模型引导成直接下单。相较旧 v2 请求，当前完整提示还包含同期其他业务扩展，因此不是只改变一个模型变量的因果实验。

## 预检和唯一派发

新增[正式宿主入口](../../scripts/local-runtime/run-arena-isolated-request.mjs)和[隔离执行体](../../scripts/local-runtime/arena-isolated-request.mjs)，在 `scripts/deployment/maintenance.json` 登记为持锁、空闲检查命令。通过 infra 正式 `locked --idle` 执行，不绕过维护锁。

1. 真实数据库只用于 `SET TRANSACTION READ ONLY` 事务，读取提供方、冻结输入和业务摘要，随即断开；不实例化业务 Runner、订单提交器或研究预算写入器。
2. `preflight` 使用内存响应构造实际 HTTP 请求，真实模型调用为 0。第一次预检因检查脚本错误地要求 `stream=false` 显式存在而失败，实际 SDK 通过省略该字段表达单次响应；修正检查断言，没有修改请求体或产品代码。第二次离线预检通过。
3. `send` 必须匹配预检指纹，创建专属私有目录及不可覆盖的意图回执，出站前将本次调用额度标为已消耗；同一路径不能再次执行。注入传输只允许一次到原 `/v1/chat/completions` 的 POST，SDK 既有 `maxRetries=0` 保留。
4. 按生产身份规则，在生成前后各读取一次模型目录，均确认同一 Q4_K_M 模型及加载实例。这两次 GET 是只读身份核对，不是生成探针；没有发送额外模型生成资格测试。
5. 收到第一条回复后保存独立回执，执行前后只读比较；没有继续请求工具结果或下一条回复。

预检指纹：`0d10db5f95a20358c836526bc5bc06247ecd1a6a2ded764f866590041f67d102`。

预检与实际出站请求体 SHA-256 完全一致：`e463bc9179c973702861f20bbe1af16b9dd84e16abd94fda94c398947773cd0e`。

实际入口工作目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`：

```sh
PATH="/Users/yzin/.docker/bin:/Users/yzin/.volta/bin:$PATH" node scripts/infra.mjs locked --idle -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/run-arena-isolated-request.mjs preflight
PATH="/Users/yzin/.docker/bin:/Users/yzin/.volta/bin:$PATH" node scripts/infra.mjs locked --idle -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/run-arena-isolated-request.mjs send /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-isolated-request-20261116-0051 0d10db5f95a20358c836526bc5bc06247ecd1a6a2ded764f866590041f67d102
```

最终预检与唯一 `send` 命令均退出 0。上面的 `send` 是已消耗的历史执行记录，不得重放。私有回执：`.recovery-artifacts/arena-isolated-request-20261116-0051/receipt.json`，权限 `0600`；意图回执同目录 `intent.json`。

## 真实结果

| 项目 | 结果 |
| --- | --- |
| 请求 ID | `5f768d62-1e23-4e67-a97c-5acb3f1f8bdb` |
| 检查开始／完成（北京时间） | 2026-11-16 00:51:09.549／00:51:29.874 |
| 包含身份和摘要核对的耗时 | 20.325 秒 |
| 生成派发／自动重试 | 1／0 |
| 停止原因 | `finishReason=stop`、`rawFinishReason=stop` |
| 用量 | 输入 4593、输出 926 tokens；不将输出 token 等同于可见 JSON 长度 |
| 实际模型 | 返回原完整量化模型标识；前后目录核验 `identity.accepted=true` |
| 配置及业务 | `providerUnchanged=true`、`businessUnchanged=true` |

返回一份 `action=tools` JSON，包含五项请求：证券搜索 `588000`、报价 `588000.SH`、该证券 `5m` K 线 24 条、`5m` MA 指标 10 条及 MACD 指标 10 条。没有请求财务、网页、新闻或日线；符合当前回放工具能力和每批最多五项约束。该输出只是已交付的工具请求，尚未执行，不代表已取得历史资料或可成交证据。

## 数据保护与最终审查

前后对提供方整行，以及全部比赛、账户、周期、时钟、研究状态统计和调用事实数量建立摘要。业务 SHA-256 前后均为 `9e3fd4e9367784dcce725f90aebff6d2695713a890f569722c02758d8b16764d`，提供方整行摘要也相同。没有写入业务模型调用表或消费比赛预算；本次外部验证调用单独记录在私有回执中，不冒充比赛调用或决策。

本轮仅新增两个验收脚本、维护登记及本任务／证据，没有修改产品代码、依赖、运行配置或部署。两脚本 `node --check`、范围内 Prettier 检查及 `git diff --check` 通过；正式预检与一次真实结果构成该验收叶的运行证据，不重复进行无关构建或全量测试。

本次单次授权已使用完毕。即使本次通过，也不自动扩展到第二次生成、工具往返、比赛启动／重试或创建新比赛。后续范围需另有明确授权，活动总任务保持未完成。
