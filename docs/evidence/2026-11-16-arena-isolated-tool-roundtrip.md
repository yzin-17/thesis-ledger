# 隔离工具往返及最终决策验证

## 范围与结论

用户授权继续做一次隔离的工具往返和最终决策验证，保持现有模型和参数，不启动或重试比赛；再次截断立即停止，不反复重试。对应[活动任务 T2d-CT](../tasks/2026-11-12-arena-replay-live.md)及[规格 AC09](../specs/2026-11-12-arena-replay-live.md)。

本轮复用[上轮成功首回复](2026-11-16-arena-isolated-model-request.md)，没有重新生成首轮。五项工具执行后，仅发出一次模型续接，正常以 `stop` 返回完整决策，当前 Schema 和模型身份校验通过。最终业务验收未通过：买入决策在构造历史执行上下文时遇到 `replay_rules_unavailable`，未进入账户状态计算或持久化。另发现 MA／MACD 指标指纹协议不一致；没有伪造指标或可交易证据。

没有截断、自动重试或后续纠正请求，没有启动、重试、恢复或创建比赛。本次授权已消耗，整体回放／实时目标仍未完成。

## 配置与消息保持

仍使用 `lmstudio`、`http://192.168.5.20:6789/v1` 和 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`；路由为 `openai-compatible-chat`／`native_schema`／`single`，合同为 `arena_live_research/arena-live-research-v5`。

冻结周期为 `7e155817-ccfc-45bc-b812-01d9b8906beb`，业务时点为北京时间 2026-11-10 13:01，原空仓账户和协议不变。模型采样、思考、上下文长度、输入／输出额度及无限总时长语义均未调整。实际请求仍只有 `model`、`response_format`、`messages` 三个字段，没有新增停止串、温度或 token 上限。

先校验上轮回执状态、模型身份和原始冻结输入／配置／编译合同指纹，再按实际 Runner 格式追加两条消息：上轮工具请求作为 assistant JSON；实际工具结果作为 user JSON，结构为 `{toolResults, observedAt}`。没有插入“必须直接决策”等额外指令。请求参数和 Schema 摘要与上轮相同；路由对象的差异仅为只读就绪评估时间。

本轮预检指纹：`ba682e8f06bab13524786537b3d78054e817c7f38bd1051445465cfe376c1f99`。

内存预检与真实出站请求体 SHA-256 一致：`5c07c54ca77b29a1fd9be1480d72f06388ed9eb12e7d44ed9bf2fc341a98e272`。

## 真实工具结果

直接装配当前容器编译产物中的 `LiveResearchTools`、`MarketArenaReplayReader`、`MarketArenaHistorySource`、日历及执行证据读取器；未启动 Nest、Runner、调度器或订单持久化服务。标的查询只允许只读数据库事务，当前行情和业务存储端口主动拒绝访问。

| 工具请求             | 实际结果                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| 查询 `588000`        | 返回一项当前目录身份；历史资格仍为未认证                                                                  |
| `588000.SH` 历史报价 | 研究价格 `1.343`，时点为北京时间 11 月 10 日 13:01；执行资格明确为 `unavailable/replay_rules_unavailable` |
| `5m` K 线 24 条      | 返回 24 条重建历史分钟资料，来源 `futu`，保留实际采集时间、时间戳约定及归档引用                           |
| `5m` MA，10 条       | 不可用：`inputFingerprint 与规范化 points 不一致`                                                         |
| `5m` MACD，10 条     | 同上，不以假数据替代                                                                                      |

工具各执行一次，结果先保存并冻结，预检和真实续接复用同一份内容。研究数据返回不等于历史成交资格已认证；本次不认证来源分钟时间戳及完整覆盖质量。DSA 历史读取允许产生来源归档／缓存，不能把 ThesisLedger 业务摘要不变解释为整个行情存储没有变化。

离线源码检查定位到独立协议差异：Server 的 `MarketArenaHistorySource.research` 对 `JSON.stringify({identity, points})` 求摘要；DSA 的指标入口通过 `_bar_series_fingerprint` 将身份、排序后的点及规范化数字组成数组后求摘要。两者并非同一规范化协议，DSA 因此在计算前拒绝。此轮记录问题，没有修改产品实现、重拉指标或再次调用模型。

## 唯一模型续接

| 项目                   | 结果                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| 请求 ID                | `6ac97745-6407-448b-b0d4-ae73c2231529`                           |
| 开始／完成（北京时间） | 2026-11-16 01:04:16.497／01:04:54.936                            |
| 含身份及业务检查的耗时 | 38.439 秒                                                        |
| 生成派发／自动重试     | 1／0                                                             |
| 停止原因               | `finishReason=stop`、`rawFinishReason=stop`                      |
| 输入／输出 tokens      | 9085／1862                                                       |
| Schema／身份           | 完整 `action=decision` 通过当前 Schema；`identity.accepted=true` |
| 最终业务校验           | 失败：`replay_rules_unavailable`                                 |

模型提出限价 `1.345` 买入 `588000.SH` 共 `14800` 份，附带 `1.340` 止损，并安排北京时间 13:05 的时间观察及价格条件观察。这是模型原始输出记录，不是已提交或获准执行的订单。

验证器仅调用历史 `LiveExecutionContext.build` 和纯业务决策入口。该样本在构造执行上下文时被真实规则门禁拒绝，因此后续 `arenaSubmitDecision` 未执行；不宣称账户状态机、止损合法性、可成交性或资金校验已通过。没有发送业务纠正反馈，也没有执行第二次生成。

## 入口与数据保护

新增[工具及内存验证装配](../../scripts/local-runtime/arena-isolated-roundtrip.mjs)和[正式宿主入口](../../scripts/local-runtime/run-arena-isolated-roundtrip.mjs)，复用[单次 SDK 执行体](../../scripts/local-runtime/arena-isolated-request.mjs)的可选续接参数；登记为正式 `locked --idle` 命令。三个阶段按 `tools`、`preflight`、`send` 顺序执行。前两阶段真实生成调用为零；`send` 在出站前写入不可覆盖的 `send-intent.json`，将剩余额度置零，原路径不能再发。

宿主从 infra 目录执行的入口形式为：

```sh
node scripts/infra.mjs locked --idle -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/run-arena-isolated-roundtrip.mjs <阶段> /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-isolated-roundtrip-20261116-once [预检指纹]
```

该路径对应已经消耗的一次授权，不得重放 `send`。私有目录权限 `0700`，`tools.json`、`preflight.json`、`send-intent.json`、`send.json` 均为 `0600`。`send` 退出 1 表示最终业务校验未通过；模型实际回复正常停止，不应误读成模型截断或网络失败。

工具阶段、预检及真实续接均确认 `providerUnchanged=true`、`businessUnchanged=true`。全部比赛、账户、周期、时钟、研究状态统计和调用事实数量的前后业务摘要均为 `9e3fd4e9367784dcce725f90aebff6d2695713a890f569722c02758d8b16764d`。未消费比赛预算或写入比赛模型调用、决策、订单及估值事实；实际外部验证用量单独留存在私有回执。

三个脚本 `node --check`、范围内 Prettier 及 `git diff --check` 通过。未修改应用产品代码、依赖或运行配置，未部署、重建或重启容器，不重复进行无关全量构建。最终审查区分：工具协议往返及完整 JSON 回复通过，指标计算和最终业务闭环未通过，历史追平到实时仍未验收。
