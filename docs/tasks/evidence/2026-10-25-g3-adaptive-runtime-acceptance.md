# G3 自适应执行目标复验记录

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D35）、[自适应执行 Task](../2026-10-25-ai-adaptive-execution.md)（T5）。

## 授权与验收边界

用户要求“再次验证G3”，本次仅执行一条正式零费用请求：沿用默认 `openrouter/free`、原 reasoning 与严格 V2 合同，业务策略 `maxAiCalls=1`，失败或结果未知时停止，不补发。实际派发后余 3 次继续冻结；未派发不扣减原有 4 次额度。

提交身份为 `261ebd21-649f-449f-b4e0-a4a7bcea51aa`。部署使用 infra 正式入口、最小 `thesis-ledger` 目标及 `DEV_DATABASE_MODE=check`；新代码构建一次，终态后复用同一镜像重建 Server／Worker 并关闭 V2。默认 Provider／模型／reasoning、配置文件、原业务行、数据卷、验收包与三仓 WIP 保留，不 stage／commit。

## 部署前已核对

- D34 已验的 53 项执行输入哈希保持一致；原有 109 项测试、类型检查、宿主构建、边界、定向 lint／复杂度及隔离 Redis 验收可复用。
- 默认配置修订为 `5`，研究模型为 `openrouter/free`，未配置 `reasoningEnabled=false`；V2 关闭、`pending=0`、新提交身份无既有任务。
- 保护基线包含 22 张业务表，以及原有 10 条 `AiRun`、110 条 `AiToolCall`。

## 本次结论

2026-10-26 凌晨完成本次单次复验。新自适应代码已固化到目标镜像，实际 SDK 首输出／空闲／总超时均为 `299935ms`，`maxRetries=0`。唯一 HTTP 请求在约 2.6 秒后收到 OpenRouter 的完整 HTTP 404 错误 JSON；没有模型正文、SSE 或报告，G3 正向验收仍未通过。请求失败后停止，未再次推理。

错误正文的顶层消息就是 `Provider returned error`，SDK 保留了该消息。原始响应比 SDK 的 `transport_unknown` 分类更具体，能够确认本次已经收到完整 HTTP 响应，不能把该分类当作 TLS 失败或超时的证据。

| 层次 | 实际记录 |
| --- | --- |
| 正式提交 | `261ebd21-649f-449f-b4e0-a4a7bcea51aa`，响应 200，`reused=false` |
| 业务任务 | `7d957e4e-372a-4c8a-bd3c-d713950d9ae2`；`failed / research_unknown_outcome`；`result=null` |
| trace | `cd858b89-f1fc-45da-a20e-dc48552723d7`；`captureStatus=complete`；`nativeFetches=1` |
| OpenRouter generation | `gen-1792944471-sqBAm8idRBOsJXGaR9Vy`，取自实际响应头 |
| 请求参数 | `openrouter/free`、`stream=true`、`max_tokens=20000`；没有 `stop` 或 `reasoning`；严格 `json_schema` |
| 自适应决策 | `ai-adaptive-v1`；首输出／空闲均为 `cold_start`，样本 0；实际三项超时均为 `299935ms` |
| 最终上游响应 | HTTP 404、`application/json`、808 字节、完整 EOF；assistant 正文 0 字节 |
| 请求账本 | 仅一条请求，状态 `unknown`、错误 `transport_unknown`，无第二次发送 |
| 用量／费用 | 供应商 token 和实际费用未知；单独的只读 generation GET 返回 404，未取得可核实的用量或费用 |

实际 `response_format` 摘要为 `5dc11c1172ea082b7b9baad824e519217517d5bf3cd6f0387f3430d440713548`，Schema 摘要为 `a187946ebc719e5cf3797a2bab282c3564b721a28127bcd6ca3b9aa79b73ec34`，与原严格合同一致。没有放宽业务校验或关闭默认 reasoning。

## 上游错误的具体内容与边界

OpenRouter 的最终错误为 `code=404`、`message="Provider returned error"`。其 `metadata.provider_name=Nvidia`、`is_byok=false`；Nvidia 原始错误包含 `status=404`、`title="Not Found"`，以及 `Function '<function-id>': Not found for account '<account>'`。公开摘要用占位符隐藏这两个标识；私有原响应保持原样。

同一错误的 `previous_errors` 还记录：

- Nvidia：OpenRouter 错误码 502；供应商正文为 `Failed to generate completions`、`Internal Server Error`、`code=500`。
- Phala：错误码 429，正文说明 `xingchen-agi/xing4.0-29b-a4b:free` 暂时受到上游限流。

这些是同一 HTTP 响应中的 OpenRouter 内部路由错误记录。本地 native fetch 只有 1 次，SDK 重试为 0；不能据此宣称底层只有一次供应商尝试，也不能由错误条目完整重建其内部请求次数或消耗。

最终 Nvidia 原文只能确认该 Function 对其使用的 account 不可找到，不能进一步确证函数删除、账号权限或具体模型下线。响应没有返回实际模型，generation 查询也未补齐，因此不能沿用 D30 的 Nvidia 型号作为本次实际模型。D20 的旧错误及 D30 两字符根因仍缺各自原始上游证据，不由本次错误回填。

## 正式部署、关闭与持久化

初次 `update.sh thesis-ledger` 在安装系统依赖时先后出现 GCC 解压、`libncursesw` I/O 错误，入口按既有机制重试一次后退出 1，原服务保持健康、V2 关闭、模型 0。只读探测确认现有 Docker Desktop 代理可访问 Alpine HTTPS；随后仅通过入口的 `BUILD_HTTP_PROXY / BUILD_HTTPS_PROXY` 参数重试，最终退出 0。未修改代理设置、Dockerfile 或运行配置文件，I/O 错误的底层原因未确证。

构建得到新镜像 `sha256:df411ebf2eb06f93d083886c9d74633a9685bf02fb2849f80c39b1ab684d60a4`。开启时 Server／Worker 同镜像且健康；两角色实际解析的 Schema、Server、domain、shared 清单与宿主当前编译输入一致，自适应模块可加载。实际 Schema 入口为 `/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/index.js`，没有根据顶层包路径推断。

终态后以 `REUSE_THESIS_LEDGER_IMAGE_ID` 指定同一新镜像执行正式关闭更新，退出 0，未再次构建镜像。两消费者确实重建，代码与实际包清单保持一致；capabilities 返回 200、`canCreate=false`，V2=false、无临时策略、`pending=0`，五服务健康。

本次两角色反读的 16 份文件在重建前后逐字节、权限与归属保持，文件集合摘要为 `7b10cc5a632c3f17a4fe518609034262d59c671a2c955a9f7db6737980ce46e2`；D30 原 trace 同样通过反读保全。`captureStatus=complete` 表示本次错误响应及各节点已完整捕获，不表示模型生成成功。

原 22 张受保护表的旧行、10 条旧 AI／110 条旧工具、默认修订 5、Provider／来源／20 路由、DSA 控制、环境和挂载均保持。仅新增本次 1 条失败 `AiRun` 及其 11 条工具材料记录，现为 11／121；没有改写旧报告或旧诊断。

## 消费验收与剩余缺口

- 报告明细与历史 GET 均为 200，显示同一 `failed / research_unknown_outcome` 和 `availability=missing`，与数据库终态一致。
- 没有成功报告可供验证正文、全部证据引用、刷新后成功历史及 Web 正向展示，G3 与自适应 Task 的真实成功输出验收保持未完成。
- 已证明目标实际采用新的超时决策、一次发送和失败停止；本次提前收到 HTTP 404，未覆盖超过旧 30 秒阈值后的真实等待／完整输出，也未发生允许重试的情形。
- 保留 SDK 对这类完整 HTTP 错误仍归为 `transport_unknown` 的分类精度缺口；本轮未修改分类代码或发送补充模型请求。
- 本次按一次 native HTTP 派发计入 1/1，余 3 次继续冻结。费用上限为 0 与实际费用未知分别记录，不把上限当作已核实账单。

私有原始记录位于 `.recovery-artifacts/g3-d35-20261025/`，不包含于发布产物。可复核文件包括 `plan.json`、`opened/closed-runtime-proof.json`、`terminal/closed-trace-proof.json`、`trace-export/`、`response-proof.json`、`generation-metadata.json`、`business-proof.json`、`protection-proof.json` 及正式入口日志。三仓 WIP／HEAD／配置和空暂存区另经收尾核对；不 stage／commit。
