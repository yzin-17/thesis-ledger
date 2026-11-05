# G3 上游真实正文与重建持久化补验

对应原 [Spec](../../specs/2026-10-18-research-evidence-evolution.md) G3-RSP13 和 [Task](../2026-10-18-research-evidence-evolution.md) G3-D30。[结构化回执](2026-10-25-g3-upstream-trace-acceptance.json)。

## 验收结论

真实上游正文捕获、SDK／业务链路和同镜像重建持久化验收通过；报告生成仍失败。本轮使用新授权的唯一一次请求，没有重试，余5次冻结。V2已关闭、单次策略撤除，`capabilities=200/canCreate=false`，pending=0，五服务健康。

上游实际 `assistant content` 完整内容仅为两个字符，无换行：

```text
{"
```

这两个字符在进入SDK之前已独立提取，和SDK的 `sdkOutputText` 逐字节一致，均为2字节，SHA-256=`6017dbca8e3eeb2f73be4123b0032c736d8c8f9bf8c86e6631887342c06fec90`。再从保存的SSE载荷独立重组，非空content仅一帧，仍得到同样2字节及摘要。本次无法解析的JSON来自实际上游content；SDK保存的文本与之相同。为何上游以stop结束时只生成这两个字符，仍没有更深层证据。

## 身份与上游返回

| 项目 | 实际记录 |
| --- | --- |
| submission／attempt | `a4238b28-6b6e-4f8f-ac83-9c5849138a99`／1 |
| run | `215dc5cf-9d50-4a6a-ae9d-6f8dfb7a6f87` |
| trace | `e7418aa5-7513-4f3a-8951-9336c4f96840` |
| SDK request | `ed66202f-a83e-47ec-ab9f-cdf5036455ec` |
| generation | `gen-1792927272-omeYVrkNHMa82RzHGRp6` |
| 请求与实际模型 | 原 `openrouter/free`；实际 `nvidia/nemotron-3.5-super-vl:free` |
| 响应 | HTTP200、SSE完整EOF、`[DONE]`、finishReason=`stop`；无upstream error |
| 帧及原wire | 3042个SSE事件，其中3041个JSON载荷；事件JSON解析错误0，wire共1,244,807字节，未截断 |
| token | prompt=5601、completion=10106、total=15707；其中reasoning=10103 |
| 上游费用字段 | `usage.cost=0`，三个`upstream_inference_*_cost`字段均为0 |

上游费用为本次响应自报；业务审计仍记录冻结Provider定价估算0 USD，来源为`frozen_provider_pricing`，两类来源分开保留。原推理默认、max_tokens=20000、严格V2 Schema和`require_parameters=true`保持；没有据token比例推断预算耗尽，也未更改模型或配置。

原wire SHA-256=`1fb921bf746bb0ff343c4a8212f2fcc4a0f8a7c6df57702f2850752aa96a9558`。请求wire为22,517字节，SHA-256=`0e5a2a2762f96beea508486f4fa248105713249f202e942b8b1834745e1b6d1f`；保存请求JSON的紧凑序列化可复算相同字节数和摘要。

保存的SSE副本为解析后脱敏JSON，2,029,839字节、SHA-256=`c0bb26097dda0b17cde6a27f623d7369b907aecbff602343cddc38791d523619`；原wire只保留观察字节数及摘要，不能把该格式化脱敏副本称为原wire逐字节归档。认证头、Cookie及推理原文按既有边界脱敏；独立assistant原文未脱敏或改写。

## SDK与业务归因

实际错误链为 `AiSdkGenerationError → AI_NoObjectGeneratedError → AI_JSONParseError → SyntaxError`。SDK错误原文包括 `No object generated: could not parse the response.`，最内层为 `Unterminated string in JSON at position 2 (line 1 column 3)`。在SDK错误之后，对相同两字节原文进行的独立检查也得到JSON无效，尚未形成可供字段级Schema校验的对象。

业务使用原状态机收敛为 `failed/research_schema_invalid`、`result=null`。JSON解析失败、SSE事件JSON解析成功和上游HTTP200分别记录，没有把它们合并为Provider HTTP错误。trace包含业务输入、SDK输入及错误、HTTP请求、上游响应、执行事实写入、失败写入和数据库终态；`business.result`明确为`skipped/not_reached`。

关闭重建后，报告明细和历史均为HTTP200；本次任务仍显示failed／`research_schema_invalid`、`availability=missing`。未将其视为成功报告、可用引用或G3整体通过。本次正文也不回填[D29 TLS失败](2026-10-25-g3-real-trace-persistence.md)、D20旧错误或D25缺失的旧正文。

## 正式入口与持久化

开启与关闭均使用infra最小入口 `scripts/update.sh thesis-ledger`，提供 `REUSE_THESIS_LEDGER_IMAGE_ID=sha256:d1e5369eefa33638b2847dc30563c84e41a1511e836a11200bd25a5467c738de`，数据库模式始终为check，两次退出0，未构建应用镜像。临时窗口使用V2和maxAiCalls=1／maxCost=0／paidRoutes=[]；收尾恢复原环境。

Server／Worker及实际Schema入口核对通过：Server2037、Schema561、domain228、shared3项产物与已验镜像及当前对应源码产物一致。D29已确认的宿主33项无源码旧dist残留继续保留，未改变运行输入或放宽门禁。

| 消费者 | 捕获时容器 | 关闭重建后容器 |
| --- | --- | --- |
| Server | `54f797a9dd4fddcd5be9be4fc8a68ef4fb8d77aedf33ee48436a6734559e26d6` | `8e483f75c20023fc1556b8c02bcdc5520ad352ba2a37a7e32e96d5abff01bae9` |
| Worker | `f704989dc5d7bffd4ea00886511052fdd5ba154a6260922d6a47ef758e3b9946` | `e836d0d84635acc68dab279080a3c25ac9cec23e3877234862ed2f68a9fea849` |

同一`thesis-ledger-backtest-data`卷上的本次18文件、2,201,285字节，在两个新容器及重建前后逐字节、权限和归属一致；集合SHA-256=`6e442ba2c1a450b94574310fc37f9a5b5148666df005f0b78581ae8b2696e488`，manifest SHA-256=`2cee6cb64a73a58b71ae55c89790cdab34a56c8517649af75c5fe8e0db8d1a22`。目录0700、文件0600、uid100／gid101。D29原trace的12个文件和manifest也在两端逐项反读不变。

22表的全部旧行、9条旧AI和99条旧工具保持，只新增本次1条AiRun／11条工具；现为10／110。数据库、owner和Schema head保持，DSA控制／准入／20路由、Provider配置、原环境和全部挂载通过保护核对，PostgreSQL／Redis／DSA容器身份保持。原验收集合359份源码摘要保持，新增并行验收文件保留；既有Metro日志相对D28增长761字节，未截断。三仓WIP及`.env`摘要另存私有工作区回执，暂存区为空，未commit。

## 私有原文与证明

证据根：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/`。原文和完整节点I/O不加入Git；本页与JSON仅记录必要事实。

- [上游原始assistant content](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/trace-export/e9d9ffea-7dac-4d4c-879c-2ed7f804cf3e-assistant-content.txt)
- [脱敏SSE载荷与原usage](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/trace-export/e9d9ffea-7dac-4d4c-879c-2ed7f804cf3e-response-body.json)
- [SDK错误及相同输出文本](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/trace-export/8220ead4-5874-439b-aec8-dbdb7ae838de-output.json)
- [原请求体副本](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/trace-export/1aa43c83-617b-42ce-a604-146a2ce7f4cd-request-body.json)
- [新旧trace重建反读证明](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d30-20261025/closed-trace-proof.json)

本轮没有修改应用／SDK／Schema源码，复用D28和D29未变检查。真实单次请求、原文与SDK摘要对照、双面运行产物、正式关闭、重建逐文件反读及业务／环境保护均单独验证；G3成功报告与上游仅生成两字符的更深原因保持未完成。
