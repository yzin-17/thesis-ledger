# 第三次模型请求无回执的离线排查

归属：[回放任务 R4H3](../tasks/2026-11-12-arena-replay-live.md)。日期：2026-11-24。复用[首批真实运行](2026-11-24-arena-scoped-replay-first-batch.md)的冻结审计，不重发模型请求、不恢复比赛。本轮模型生成、资格探针、比赛操作及部署均为零，真实业务数据库只读。

## 已确认结果

第 3 次请求 `a7790325-6cf5-4da4-b362-7fefa5914a4e` 在北京时间 00:03:33.686 进入调用，00:32:48.573 因本批 30 分钟运行上限触发取消，等待 29 分 14.887 秒。审计没有模型输出正文、结束原因、实际模型或用量；`unknown_usage` 保持。错误文案“用户取消了生成请求”来自通用取消分类，本次实际触发者为维护运行的总时限，不是新增人工取消指令。

排查确认 ETF 执行状态回退合同存在本地缺口，且原始校验异常进入第 3 次模型输入。它解释两笔 ETF 执行状态不可用，但不能单凭此证明无回执的上游原因。没有将超时推断成重复生成、上下文溢出、输出截断或网络故障。

## 三次请求参数比较

使用冻结消息、原协议和目标容器的正式 SDK 编译产物，注入仅返回受控 HTTP 400 的 `httpClient`，截获本应发送的请求体。全局 `fetch` 禁止出站，每次仅一次受控调用，自动重试为零。未调用模型身份探针或真实模型端点。当前路由配置指纹仍等于原授权包的 `3f3ab07495dc884f33a35753a81a7b4208ef93be64d27190d753c12aa9d8f96b`。

| 项目 | 第 1 次 | 第 2 次 | 第 3 次 |
| --- | --- | --- | --- |
| 冻结消息数 | 2 | 4 | 6 |
| 重建 HTTP 请求体字节数 | 46,060 | 58,372 | 70,992 |
| 原运行报告输入 tokens | 7,418 | 13,465 | 未知 |
| 原运行报告输出 tokens | 403 | 790 | 未知 |
| 原运行结果 | 结构化工具请求成功 | 结构化工具请求成功 | 到限取消、用量未知 |

三次均为原 `lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，`openai-compatible-chat / native_schema`，目的地址 `http://192.168.5.20:6789/v1/chat/completions`。请求体字段均只有 `model`、`response_format`、`messages`；没有 `stream=true`、输出 token 上限、思考参数或采样参数。三次 `json_schema` 均为 strict，同一 Schema 摘要 `8ef5cc76bd725490bdd68eb803abb46b4cabb31640101055b6979d13cb5c1038`。第 3 次没有切换合同或额外启用参数。

这些是按原输入与一致配置重建的请求体，原运行未保存实际线上 HTTP 原文，不能将重建摘要称为线上抓包。字节数和原预留估算均不等于模型实际 tokens，不能据此认定超过上下文窗口。

宿主执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。目标读取与离线重建入口：

```sh
docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module \
  < .recovery-artifacts/arena-model-request3-diagnosis-20261124/capture-input.mjs
```

实际命令由宿主 Python `subprocess.run` 透传标准输入执行，退出 0。数据库查询在 `SET TRANSACTION READ ONLY` 事务中，仅读取原 Provider 配置；凭证读取被禁止。回执 `realModelCalls=0`、`forbiddenNetworkAttempts=0`。三次字段一致、Schema 摘要一致及零出站断言通过。私有目录保留重建脚本、完整请求体、标准输出和错误输出。

## ETF 执行状态的确定缺口

冻结工具结果显示：`588000.SH`、`512480.SH` 报价均 ready，但 `execution.status=unavailable`，原因均为 `query` 的 `invalid_union`，其中 `routeKey.assetType` 期待 `STOCK`。

对应代码链路：

1. `market-arena-replay-reader.ts` 的 `observe` 尝试历史执行快照；采样政策下取得失败会回退到身份资料与状态组合读取。
2. 回退构造 `DAILY_TRADING_STATUS` 查询时使用证券真实类型 `ETF`，调用 `statusCompositionDemandV1Schema.parse`。
3. `packages/schemas/src/market-status-capabilities-v1.ts` 的公共 `key()` 将资产类型固定为 `z.literal('STOCK')`，因此在本地解析失败，尚未进入该状态组合 HTTP 请求。
4. 同文件消费者 `quote` 捕获后，将完整 `error.message` 放入模型可见的 `execution.reason`。

目标容器直接构造同日、同代码、同能力的查询，只有资产类型不同：`STOCK` 解析成功，`ETF` 稳定返回 `invalid_union`。该复现不请求来源、不检查或续验 ETF 历史归档，不改变现有准入门槛。它验证回退路径的合同不匹配；原历史快照为什么未成功，冻结结果未保存内部原因，本轮不续查已停止的归档准入。

两段执行异常各 3,215 字符，经 JSON 序列化合计占新增 10,532 字符工具消息的 7,270 字符，约 69%。原始异常不是可供研究判断的简洁业务原因。这个输入缺陷需要修复；即使修复，也不能据此宣称已解决该次远端无回执。

同批两个 5 分钟工具结果为 `replay_prices_unavailable`。历史研究源码既会在来源读取失败时返回此原因，也会在观察时点无可见完整 bar 时返回同一原因；冻结工具回执未区分这两条分支。本轮未重新读取归档，保留不确定性。

## 为什么不能继续确定上游原因

`live-research-call.ts` 使用 `transport='single'`，本周期 `deadlineAt=null`，因此单次请求没有独立总时限，最终由外层运行时限中止。`AiSdkGenerationAdapter` 等待完整的 `generateText` 结果后才取得输出和用量；没有完整响应时，这些字段保持未知。

`ai-generation-diagnostics.ts` 的请求与流式诊断仅对 `research / research-generation-v2` 创建，对本次 `arena_live_research / arena-live-research-v6` 不创建。限定运行入口也没有建立 `withAiTraceScope`，因此没有可复用的 HTTP 状态、首字节、响应体或生成进度记录。本机未发现 LM Studio 日志目录，也没有现成 SSH 配置可读取上游主机日志。

目前无法从现有证据区分：上游仍在生成、生成停滞或排队、服务端已完成但响应传输未完成。确认具体原因需要原 LM Studio 主机在北京时间 00:03:33—00:32:49 的服务日志或生成记录。无需为了取得这份历史记录再次调用模型。

## 接续范围

- 本地先修复 ETF 历史执行回退与仅支持股票的合同不匹配，并收敛模型可见的原始校验异常；用现有样本验证，不恢复归档准入检查。
- 上游日志核对独立跟踪；不得把增加费用、FINRA、归档续验等外部证明变成修复上述本地缺口的共同前提。
- 本次排查完成；模型无回执的远端原因仍未确认，R4H3 完整业务验收保持未完成。原未知用量、暂停状态、预算及失败审计不改写。

## 后续本地修复

同日用户授权修复 ETF 回退合同与模型可见异常。R4H4 已完成[本地修复及冻结样本验证](2026-11-24-arena-etf-fallback-fix.md)：ETF 缺快照时不进入 STOCK 合同，保留现有准入；两段原始错误各压缩到 24 字符原因码，23 项及类型／构建／边界检查通过。没有新增模型、来源、真实数据库或比赛操作，未同步目标；原远端无回执原因仍未确认。
