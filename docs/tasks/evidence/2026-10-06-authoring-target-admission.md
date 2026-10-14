# 编写执行目标准入验收

## 范围与结论

2026-10-06 完成[执行 Task](../2026-10-05-authoring-execution.md) A5-D。复用已完成的保数据官方部署，核对目标编写执行组件及准入拒绝路径。24 项真实 HTTP 状态检查及脚本内合同/状态/数据保留断言通过，入口退出 0。

当前目标的两个 Provider 均未配置编写三用途；六次实际注册身份下提交分别返回 HTTP 400 / `AUTHORING_MODEL_UNAVAILABLE`。本次用户未产生操作或调用事实，草稿内容/修订在拒绝前后不变。77 张受保护表的行数及内容摘要一致，本次草稿已 discarded，会话已撤销。

本结果只接受当前目标的就绪和拒绝路径。A5-L 的在线用途验证、目标队列成功执行及调用审计，A5-R 的目标进程恢复仍未完成；A5 分组、完整 T02/T05 及产品 AC 保持开放。

## 执行输入与目标

工作目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。执行前工作树已有 477 项 dirty 记录；保留并行修改，本叶写集仅验收入口、执行 Task、自然语言 Task 检查点及本证据。

| 项目 | 当前结果 |
| --- | --- |
| 目标 | `thesis-ledger-dev/thesis_ledger` |
| API | `http://127.0.0.1:3000/api/v1` |
| database / owner | `thesis_ledger / thesis_ledger` |
| SchemaVersion | `20261005143000_authoring_analysis_application` |
| public 表 | 80 |
| Server / Worker image | `sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4` |
| Redis / PostgreSQL / Server / Worker | 验收前后 healthy |
| 标记 | `a5d_20261005_181ed8cc` |
| 执行时间（UTC） | `2026-10-05T18:11:19.967Z` — `2026-10-05T18:11:24.443Z` |

目标结构和镜像来自[官方保数据更新证据](2026-10-05-journal-review-completion.md)，身份前置来自[I4 目标证据](2026-10-06-strategy-identity-target.md)。本次未部署、重启或变更 Docker/Redis 配置。

以下 11 项编译输入 SHA-256 与宿主现行产物逐一一致。Schema 使用目标 Server 实际解析的 `@thesis-ledger/schemas` 安装目录，不假设源码 workspace 在镜像中的路径。

| 编译输入 | 宿主及目标 SHA-256 |
| --- | --- |
| `apps/server/dist/src/app.module.js` | `163b15124695dc6d498d84d1c5a742634ff4eeef745e6e0786f4d15ba1883401` |
| `apps/server/dist/src/strategy-authoring/authoring-execution.module.js` | `90159a4880d43ef74c321bdef597d1304917f37e09a35e762d6dbb37763e0983` |
| `apps/server/dist/src/strategy-authoring/authoring-submit.service.js` | `9b71235b96d19a20facb1c8b86e87bf830aeb3e133c4b246c734f6c0251c9c0b` |
| `apps/server/dist/src/strategy-authoring/authoring-operation.controller.js` | `6bad991b11e0323282432387a27388be05a43245511ae91e83e46f1d5cc67ede` |
| `apps/server/dist/src/strategy-authoring/authoring-operation.repository.js` | `50222e4b58565692fada68d0985d269cea45f03496c495e62a49ddeabea67d49` |
| `apps/server/dist/src/strategy-authoring/authoring-model-policy.js` | `cc2eb4c2d8bed3a9447fa397be4446c70f6e7cbb0eff86385e82d977a73e95db` |
| `apps/server/dist/src/strategy-authoring/authoring-queue.js` | `1d4f01dfd9f8f5f653d276b7f86be020ee8561decf57cb133448dc4121a4a83b` |
| `apps/server/dist/src/strategy-authoring/authoring.worker.js` | `3089649c6b49c899a4169cd41dc6eb2f4757ab70f603534807ff03294e99dd44` |
| `apps/server/dist/src/strategy-authoring/authoring.executor.js` | `06614780dfce1e092c9df2070dbce5189d31df4fdc0170b92034ce0d0df66910` |
| `packages/schemas/dist/ai-execution.js` | `ff096ecfa5d88cabb5604e05667c78d79e19411b28457d667ef45279943b734e` |
| `packages/schemas/dist/strategy-authoring-generation.js` | `b8ed86c9d275171c3c028375ee7829560149631747f4dc6061e7816cc9919ca5` |

## 就绪和准入结果

Redis 只读检查 `thesis-ledger:queue:v1:authoring:worker-heartbeat`。验收前心跳为 `2026-10-05T18:11:21.723Z`，距读取 281 ms、TTL 44741 ms；验收后距读取 904 ms、TTL 44123 ms，均在 45 秒有效窗口内。该事实支持编写 Worker 当前就绪，不等同于已验证一次队列任务成功执行。

通过实际 `GET /ai/providers` 与各 Provider `/readiness` 读取当前用途。现行其他用途均 ready / passed，其验证结果不能替代编写用途。

| Provider | 模型 | 当前已有用途 | 已配置编写用途数 | 配置指纹 |
| --- | --- | --- | --- | --- |
| `lmstudio` | `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive` | `research`、`parameter_optimization`、`strategy_discovery` | 0 / 3 | `fdaf8eba0390fdd857513f810c2d8422558b5cd30d00af53b95426a198200957` |
| `openrouter` | `openrouter/free` | `research`、`parameter_optimization`、`strategy_discovery` | 0 / 3 | `3e55be17363014b206fec7f39dd10081db11074d352775dbc38edd97a56fa767` |

缺失合同分别是 `strategy_authoring_analysis@authoring-analysis-v1`、`strategy_authoring_generation@authoring-generation-v1`、`strategy_authoring_modification@authoring-modification-v1`。验收前后用途和配置指纹一致；原有 Provider 配置未改变。

| 实际 HTTP 场景 | 结果 |
| --- | --- |
| Provider 列表及用途就绪，验收前后各读取一次 | 6 项 200 |
| 随机标记用户注册、实际会话读取、未完成草稿创建 | 201 / 200 / 201，符合共享身份与草稿合同 |
| 匿名操作读取、匿名提交 | 401 / 401 |
| 已认证但不存在的操作读取、取消 | 404 / 404 |
| 两个现有 Provider 分别提交 analyze / generate / modify | 六项 400，全部为 `AUTHORING_MODEL_UNAVAILABLE` |
| 拒绝提交后草稿读取 | 200；与创建响应内容及修订完全一致 |
| 收尾读取和丢弃草稿 | 200 / 201 |
| 撤销本次会话、撤销后访问操作 | 204 / 401 |

提交携带现行实际 Provider/model 与各自唯一 idempotencyKey；`unknownCostAcknowledgedAt` 为 null。没有借用研究用途、虚构个人 principal 或代替用户作费用确认。密码和会话凭据只在进程内存，报告不包含明文凭据。

## 局部检查与执行记录

```sh
rtk proxy node --check scripts/authoring-target-admission.mjs
rtk proxy pnpm exec prettier --check scripts/authoring-target-admission.mjs docs/tasks/2026-10-05-authoring-execution.md
rtk proxy node scripts/authoring-target-admission.mjs --confirm=thesis-ledger-dev/thesis_ledger
```

语法/格式检查通过。省略确认参数时在任何目标访问前退出 1。仓库 ESLint 默认忽略 mjs，沿用 I4 已确认的入口检查方式：项目已安装 ESLint、`@eslint/js` recommended 及明确 Node/Web globals，单文件检查 0 errors / 0 warnings，没有改变仓库 lint 配置。应用、数据库及镜像构建输入未变，复用既有隔离和官方更新证据，不重复构建或运行全量测试。

第一次目标预检因验收入口误将 Schema 编译文件定位到 `/app/packages/schemas/dist` 而退出 1，尚未发起 HTTP 或创建标记记录。只读核对发现镜像使用 pnpm 安装包目录；入口改用 Server 实际解析的包路径读取，再比较相同编译文件 SHA-256，未放宽一致性门禁。首轮错误日志保留于 `/private/tmp/tl-authoring-target-a5d-20261006.err`。

最终执行退出 0。原始脱敏报告：`/private/tmp/tl-authoring-target-a5d-20261006-r2.json`，SHA-256 `a09b3e30ff5864de656e139870bc6371bd47ed7cb0d5cca21dc44ee3de496e78`；入口 SHA-256 `3724d0b89992e4b1460bf571bab0aa99c6d68ecf1c08d823fb57203455e1acbf`。

## 数据保留与收尾

标记记录保留一个用户、一份 discarded 草稿和一个已撤销会话；activeSessions 为 0，该用户的 operations / invocations 均为 0。仅排除本次标记用户及关联会话、草稿、修订；前一轮 I4 标记记录和所有其他用户继续纳入保护范围。

数据库摘要读取均执行于 `BEGIN READ ONLY`。Docker 只做 inspect、读取模块和只读 SQL；Redis 只做 GET/PTTL。明确排除日常可变的 `AutomationJob`、`ProviderHealth`、`ProviderHealthCheck`，其余 77 张表前后行数与内容摘要一致。不存在操作表或调用审计事实表的排除规则。

完整 77 表见证映射按键排序、紧凑 JSON 编码后的 SHA-256：`6c21de24f90d84e233a883b6b053b91edf6d8f6641e4b78a46dbb52703880f13`。下列关键表无新增或内容变动；摘要用于变更检测，不将业务明文写入报告。

| 关键受保护表 | 验收前后行数 | 验收前后内容摘要 |
| --- | --- | --- |
| `StrategyAuthoringOperation` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyAuthoringProposal` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyAuthoringSource` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiInvocation` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiInvocationFact` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiRun` | 22 | `fc7bb6f535387bebadf060520925b004` |
| `Strategy` | 16 | `a1eeb94fa7ff5d7c2f5a572606965452` |
| `StrategyVersion` | 20 | `510a67251961ef895fded8d98817d4b8` |
| `BacktestJob` | 55 | `f1e2a7cce1bc34a5d0566d04453bad2b` |

## 最终一致性检查与后续边界

A5-D 的身份和部署依赖、目标模块一致性、Worker 心跳、缺失用途清单、实际拒绝错误码、无新操作/调用事实、数据保留及收尾均有对应证据，完成条件满足。原 A5 的在线调用和恢复义务保留在 A5-L/A5-R，拆分未删除原验收要求；本叶结束后停止。

A5-L 下一步需选定模型，经现有 Provider 用途验证与保存入口完成编写三用途，并记录当前价格/费用确认，再进行最小队列执行与同意图重放。当前两个 Provider 的研究、优化或发现验证不能作为这一前置。此记录不接受在线成功、完整生成语义、正式策略保存或客户端功能。
