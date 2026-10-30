# G3 再次单次验收记录

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D36）、[自适应执行 Task](../2026-10-25-ai-adaptive-execution.md)（T5）。

## 授权与身份核对

用户因 OpenRouter 控制台未看到请求，明确要求“再试一次”。本次仅预留 1 次正式零费用请求，默认 `openrouter/free`、原 reasoning 与严格 V2 合同保持，`maxAiCalls=1 / maxCost=0`，失败或未知立即停止，不补发；实际派发后余 2 次冻结。D35 的 HTTP 404、generation ID 与私有原始响应保持，不因控制台未显示而改写其派发事实。

当前目标凭据在内存中计算的 SHA-256 与用户提供的控制台 hash 完全一致，标签首尾也相同。比对没有发起外部请求，也未输出或另存 API Key。

## 部署前状态

53 项执行输入与 D35 验收指纹一致；Server／Worker 为同一已验镜像 `sha256:df411ebf2eb06f93d083886c9d74633a9685bf02fb2849f80c39b1ab684d60a4`。V2=false、无临时策略、`pending=0`，默认修订 5、`openrouter/free` 就绪。

新提交身份为 `8d2a2c1a-aebe-4233-bc32-7ccd91ecbf95`，原 22 表、11 条旧 `AiRun`、121 条旧 `AiToolCall`、配置与挂载基线已保存。临时开关仍经 infra 正式 `update.sh thesis-ledger` 入口，指定复用同一镜像，不构建应用镜像，`DEV_DATABASE_MODE=check`；结束后关闭 V2。保留原数据、配置、验收包和 WIP，不 stage／commit。

## 正式请求结果

本次唯一请求已经执行并停止，G3 仍未通过。OpenRouter 返回 HTTP 200、完整 SSE、两条 `stop / native_stop` 终止帧及 DONE；原始流为 930520 字节，没有截断或上游错误帧。assistant 正文却仍为 2 字节 `{"`，与 D30 的两字符现象一致。

从保存的 SSE 独立重新组装、保存正文和 SDK 接收文本三方一致，正文 SHA-256 为 `6017dbca8e3eeb2f73be4123b0032c736d8c8f9bf8c86e6631887342c06fec90`。JSON 语法解析已失败，未获得可校验的 V2 对象；业务终态为 `failed / research_schema_invalid`、`result=null`。没有补发或自动修复生成。

| 项目 | 实际值 |
| --- | --- |
| 业务任务 | `93ca715b-6945-4cce-bca8-2019723df08c` |
| trace | `7ce8572b-8928-48f6-ad5b-6222c929a63f`，`captureStatus=complete` |
| generation ID | `gen-1792945585-OIIihmfIR2Hu28BeRREL` |
| 实际派发时间 | 北京时间 2026-10-26 00:26:22.321；UTC 2026-10-25 16:26:22.321 |
| 上游记录创建时间 | 北京时间 2026-10-26 00:26:25.632；UTC 2026-10-25 16:26:25.632 |
| 请求模型 | 保持 `openrouter/free` |
| 实际模型 | generation 元数据为 `nvidia/nemotron-3.5-super-vl-20261015:free`，Provider 为 Nvidia |
| 参数 | `max_tokens=20000`；没有 `stop` 或 `reasoning`；严格 `json_schema` 保持 |
| 超时与重试 | 三项实际超时均为 `299910ms`，cold_start、样本 0；SDK `maxRetries=0`，native fetch 1 次 |
| 本地任务耗时 | `134231ms`，未触发超时或取消 |
| 供应商原生用量 | 输入 5609、输出 7345，其中 reasoning 7342 |
| 上游结束状态 | `stop / native_stop`，`cancelled=false`，generation time `128004ms` |
| 费用 | 只读 generation GET 返回 200，`total_cost=0 / usage=0`；业务另按冻结免费定价估算 0 USD，来源分别记录 |

实际 response_format／Schema 摘要分别为 `5dc11c1172ea082b7b9baad824e519217517d5bf3cd6f0387f3430d440713548` 和 `a187946ebc719e5cf3797a2bab282c3564b721a28127bcd6ca3b9aa79b73ec34`。本次未改默认 reasoning 或输出合同。总输出 token 含推理，不能作为 assistant 正文长度。

本次完整接收了 134 秒任务的流并保留失败事实；没有可用的首正文到达时间，不能仅由总耗时推断首正文等待了 134 秒。为何 Nvidia 在正常 stop 时只给出两字符，仍由 D31 根因缺口承接。

## 控制台截图中的 429

用户补充的截图中，generation 前缀与本次一致，API Key 为 `stock`，Phala 返回 429，随后 Nvidia 返回 200，生成 7345 token、128 秒。该截图与本次只读 generation 元数据相符，私有原图单独保存，没有改写 trace。

429 发生于 OpenRouter 内部的 Phala 路由分支；同一请求随后由 Nvidia 完成。本次最终 HTTP 为 200，业务拒绝原因为 assistant 正文只有 `{"`，不是合法 JSON。本地 SDK 重试 0，与 OpenRouter 内部换 Provider 的记录分别计算。

本次 generation GET 已返回 200，用户也已定位对应控制台记录。D35 为什么没有在其控制台显示仍未确证，D35 原 HTTP 404、generation 响应头和只读 GET 404 的事实保持。用户这次指出限流不构成追加调用授权，未再推理。

## 关闭、持久化与保护

开启与关闭均经 infra 正式 `update.sh thesis-ledger`，指定同一已验镜像复用，两次均退出 0，没有构建应用镜像。双角色实际 Schema／Server／domain／shared 清单保持，capabilities 为 200；收尾时 V2=false、无临时策略、`canCreate=false / pending=0`，五服务健康。

两消费者确实重建。本次 20 份文件逐字节、权限与归属在双角色及关闭重建前后保持，文件集合 SHA-256 为 `230d363af5d6a8fc8d031adac2bfd281f81b80b5b4c2f1f83e4ffb761a584496`；D35 原 16 份文件也经双端反读确认未变。

22 张受保护表的旧行、11 条旧 AI／121 条旧工具、默认修订 5、Provider／来源／20 路由、DSA 控制、环境与全部挂载保持。只新增本次 1 条失败任务及其 11 条工具材料，现为 12／132。失败明细和历史 GET 均为 200，`research_schema_invalid / missing` 与数据库一致；没有成功报告可验正文、全部引用及 Web 正向展示。

本次使用 1/1，余 2 次继续冻结。原 WIP／配置／HEAD 和空暂存区收尾核对，不 stage／commit；未变生产源码的既有工程验证复用，没有为了本次复验重跑全量测试。

## 验收结论

- [x] 凭据身份、53 项冻结输入及目标双角色一致。
- [x] 唯一请求、完整上游流、SDK 文本、供应商用量／零费用和失败停止分层核对。
- [x] 同镜像关闭、双角色重建、当前及 D35 trace 持久化和原数据／配置保全。
- [ ] G3 成功 V2 报告、全部引用、成功历史与 Web 正向消费；本次仍没有合法 JSON 产物。

私有原始记录保存于 `.recovery-artifacts/g3-d36-20261026/`，含 `credential-proof.json`、`response-proof.json`、`generation-metadata.json`、`trace-export/`、关闭／trace／业务／保护／WIP 核对和用户控制台截图。上次证据见 [D35 回执](2026-10-25-g3-adaptive-runtime-acceptance.md)。
