# G3 失败响应诊断与空间恢复记录

## 当前结论与剩余门禁

脱敏诊断、本地验证和首次完整部署通过。本次独立授权的 1 次 `openrouter / openrouter/free` 调用已使用，终态仍为 `research_schema_invalid`。SDK 错误所携文本只有 2 字符，JSON 无效，尚未进入 V2 字段校验；当前证据不能确定上游为何只提供这些文本。

关闭过程曾因 BuildKit 存储只读、主机 ENOSPC 及后续 Docker 故障失败，清理与中断过程保留于下方。用户再次恢复 Docker 后，同一官方保留数据完整更新退出 0，最终核对已通过，见本页最新关闭记录及[结构化回执](2026-10-23-g3-9b518a06-closeout.json)。

北京时间 21:07:24 最终确认 `AI_RESEARCH_V2_WRITES_ENABLED=false`、`canCreate=false`，全部目标健康；17 张受保护表、来源启停／20 条路由、全部挂载及非 V2 环境键值摘要保持。两条失败任务和脱敏诊断更新后仍可读，完整行摘要不变，本轮新增模型调用为 0。G3-D3 的恢复与保全叶已完成；G3 成功报告、引用和成功历史报告门禁仍未完成，后续模型调用须另行明确授权。

## 授权、实现与本地验证

原失败任务 `18d76166-84d8-4fcf-9b03-c5a5fb33d068` 及已花费额度保留。本次为用户独立新增的 1 次、总费用上限 0 元授权，失败即停、不自动重试；保留原数据、来源启停和 20 条路由，Longbridge 暂缓。

共享错误合同新增可选 `diagnostic`，版本 `ai-failure-diagnostic-v1`，旧记录无诊断仍可读；原错误合同从超尺寸文件提取，公开导出保持。仅 research V2 的 Schema 失败增加诊断，不改输出 Schema、路由、重试和费用结算规则。

诊断仅从最多三层 cause 内的 SDK `NoObjectGeneratedError` 读取 text。保留错误类别、模式、结束原因、安全模型标识、字符数及 SHA-256；扫描前 4096 字符，结构预览最多 2048 字符，遮蔽字符串内容、字段名、数字和未加引号文本。超过 65536 字符不做本地 JSON 解析，缺文本明确为 missing；不读取 Prompt、messages、headers 或任意响应 body，不落盘完整正文。V2 失败摘要为固定中文说明。

| 验证 | 实际结果 |
| --- | --- |
| 共享契约定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/ai-generation-error.test.ts test/ai-execution.test.ts`，9 项通过 |
| 共享契约全包 | `pnpm --filter @thesis-ledger/schemas test`，112 文件／1319 项通过 |
| Server AI 回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/ai`，43 文件／382 项通过；14 文件／76 项因未配置隔离数据库跳过 |
| 构建与类型 | Schemas build／typecheck、Server build／typecheck 通过 |
| 质量与门禁 | 本次 7 个代码／测试文件的 ESLint、Prettier、定向 diff 检查通过；边界、workspace 依赖、文件尺寸门禁通过，保留 8 条无关存量尺寸提示 |

本地集成使用真实 SDK 与本地 HTTP 响应，确认失败只请求一次、用量保留；调用生产 `AiExecutionStateStore`，经过模拟 JSON 存储边界后重新读取，诊断保留而敏感样本文本、凭据、Prompt、headers 不入账本。该测试不是隔离 PostgreSQL 验收。后续真实目标行已证明诊断实际落盘，关闭更新后的重启留存仍待完成。

## 首次完整部署与唯一真实采样

在 `thesis-ledger-infra` 执行 `AI_RESEARCH_EXECUTION_ENABLED=true AI_RESEARCH_V2_WRITES_ENABLED=true STRATEGY_AI_OPTIMIZATION_ENABLED=true DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh thesis-ledger`，退出 0，日志 `/tmp/thesis-ledger-g3-diagnostic-v2-enable-update-20261023.log`。

开启后全部目标容器健康、`canCreate=true`，默认仍为 `openrouter/free`、修订 5。Server／Worker 镜像为 `sha256:382b6a9b6b60d17eb4296b30b2c4d8b7153447a0d3ec31a745738516f47743f7`；DSA 镜像仍为 `sha256:e6ab2bd78a9d7a424355e3bbbb43b4ec777cbf7967cda06245c51eac1b0eafec`。受保护表、旧任务、DSA 控制表、挂载及非 V2 环境键值摘要保持；仅字典序列化顺序有差异。

浏览器显式提交一次模拟模式、独立标的 `600519.SH`、近期变化模板及原问题；冻结 1 条报价和 10 条新闻，保留资料不完整提示。输入指纹为 `ffe574de6272abe9035f4513ba9cca3b6fc12de779ff8e923fc4cc5cbe995759`。

| 项目 | 事实 |
| --- | --- |
| 研究任务／唯一请求 | `9b518a06-fcf1-4b35-9225-ad8e53b7f7ea`／`b458fcb4-af61-4522-aa04-6e84e000546f`，本次 1/1 已用尽 |
| 执行时间 | 北京时间 19:54:07.094～19:56:02.621，115.527 秒 |
| 终态 | failed／`research_schema_invalid`，result 为 null；唯一请求已结算，`schemaAccepted=false` |
| 实际分配模型 | `nvidia/nemotron-3.5-super-vl:free` |
| 诊断 | `no_object`／`native_schema`／`finishReason=stop`／`jsonStatus=invalid` |
| SDK 文本 | 2 字符，预览 `{"[text]`，未截断，不构成完整 JSON |
| 文本 SHA-256 | `6017dbca8e3eeb2f73be4123b0032c736d8c8f9bf8c86e6631887342c06fec90` |
| 用量／费用 | 来源报告输入 5638、输出 6974 token；费用为 `estimated / frozen_provider_pricing` 的 0 USD，非供应商账单实报 |
| 目标完整行摘要 | `05a00cd7a9390d343b80d92f40b38dbc`，恢复后仍需复核 |

本地已安装 SDK 的 `generate-text/output.ts` 在 `safeParseJSON` 失败后将 text 交给 `NoObjectGeneratedError`，Schema 字段校验位于其后。本次只能证明该解析阶段收到无效 JSON；不据此断言供应商原始 body 内容，也不将输出 token 数等同正文字符数。

## 关闭失败与空间清理

关闭更新前，17 张受保护表数量及完整行摘要保持，所有旧 AiRun 完整行摘要保持，DSA 控制表、来源启停和路由保持。仅新增本次 failed AiRun 和 11 条工具记录；研究计数为 runs=2、tools=22，Observation／Invocation／InvocationFact 均为 0。

随后使用相同官方完整更新，仅将 `AI_RESEARCH_V2_WRITES_ENABLED=false`，日志 `/tmp/thesis-ledger-g3-diagnostic-v2-restore-update-20261023.log`，退出 1。最终镜像 COPY 阶段报 `metadata_v2.db: read-only file system`；脚本内置重试及保卷恢复又因主机 ENOSPC 停止。日志末尾原五个容器仍显示 healthy，未删除数据卷；此后 Docker API 不可用，不能把该历史健康状态当作当前就绪。证据文档当时也因空间不足无法写入，本轮空间恢复后补记。

用户要求清理空间后，只读盘点时主机已回升至约 3.5 GiB。经核对无活跃 npm／npx 命令引用，删除 `/Users/yzin/.npm/_npx` 与 `/Users/yzin/.npm/_cacache`，退出 0，约 0.87 GiB；不触及 `.npmrc`。执行 `pnpm store prune`，退出 0，移除 70188 个文件（命令报告 974 MB）及 1394 个无引用包、3 个全局虚拟仓库无引用包，保留现有项目依赖。未清理正在使用的 VS Code 更新缓存、Codex 运行时或其他聊天的移动端临时任务。

清理后 `df -h /tmp` 显示约 5.5 GiB 可用。通过仓库既有 `bash scripts/docker-desktop.sh start` 尝试恢复 daemon；显示 Desktop 已运行，但最终 `docker info` 返回 HTTP 500，入口退出 1。未执行其他启动、重启、重建、磁盘配置修改或清理。原业务数据、Docker 数据卷、备份和源码均未被本轮缓存清理命令触及；Docker 恢复后的最终保护核对仍未执行。

## 用户重启后的同一关闭更新

用户确认已重启恢复 Docker，并明确要求继续保留数据的 V2 关闭更新和最终核对，不新增模型调用。北京时间 20:21:29.802，只读检查全部目标容器健康；与故障前快照相比，17 张受保护表、所有原 AiRun（含两条失败研究）、DSA 控制表、来源启停／路由、全部挂载及非 V2 环境键值摘要均未变化。研究计数仍为 runs=2、tools=22，Observation／Invocation／InvocationFact 均为 0。V2 开关仍为 true；主机可用空间约 6.0 GiB。

北京时间 20:21:53，从 `thesis-ledger-infra` 重跑原命令：`AI_RESEARCH_EXECUTION_ENABLED=true AI_RESEARCH_V2_WRITES_ENABLED=false STRATEGY_AI_OPTIMIZATION_ENABLED=true DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh thesis-ledger`。本次日志单独保留于 `/tmp/thesis-ledger-g3-diagnostic-v2-restore-resume-update-20261023.log`，不覆盖此前失败日志；复用既有本地测试证据，不发外部来源或模型请求。

依赖层复用缓存，构建进入 `#23 [build 16/19] COPY . .` 后长时间未推进。仅做一次额外只读核对：主机仍有约 2.1 GiB 可用，Docker 返回 `Error response from daemon: Docker Desktop is unable to start`。不能仅依据空间数字断言本次故障仍由 ENOSPC 导致。

按用户遇新卡点停止的要求，核对本次更新进程组及其全部成员后仅向该组发送 SIGINT。脚本内置的一次构建重试随后同样报告 daemon 无法启动并退出 1；再次准备发送 SIGTERM 时原更新已退出，未发送该信号。最终只读核对本次进程组为空。日志确认未删除任何 Docker 数据卷，未自动停止其他进程；未执行其他 Docker 恢复方式。

本次尚未完成关闭及更新后最终保护／历史留存核对，不能标记 G3-D3 或 G3 完成。等待用户确认是否只读定位本次 Docker 错误日志；任何后续修改、恢复或更新在新卡点确认后接续，模型额度仍已用尽。

## 最新关闭与最终核对（已通过）

用户再次确认 Docker 已恢复，明确继续同一保留数据关闭更新及最终核对、不新增模型调用。更新前全部目标健康，V2 已为 false，运行镜像为 `sha256:38cbb92debf88c07a9a78e4da244aa3a237324e9717b8b6faebfa9299296b5ad`；原数据、两条失败任务、DSA 控制表、挂载及非 V2 环境摘要与故障前基线一致。按本轮明确授权完成同一官方完整更新及其成功回执。

执行目录为 `thesis-ledger-infra`，命令仍为 `AI_RESEARCH_EXECUTION_ENABLED=true AI_RESEARCH_V2_WRITES_ENABLED=false STRATEGY_AI_OPTIMIZATION_ENABLED=true DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh thesis-ledger`。退出 0，完整日志 `/tmp/thesis-ledger-g3-diagnostic-v2-restore-resume2-update-20261023.log`；日志确认本轮更新完成并回收历史资源，最终宿主余量 11535 MiB。复用既有本地定向／包级测试证据，本轮没有新增模型调用或来源实读。

独立最终核对时间为北京时间 21:07:24.501：

- 全部五个目标容器健康，Server／Worker 镜像为 `sha256:feead8440044280078b128d08b56cf0f3960334991983ab5a86d8fc3758119f0`；DSA 镜像保持原值。
- `AI_RESEARCH_V2_WRITES_ENABLED=false`，`GET /api/v1/research/capabilities` 返回 200／`canCreate=false`。原研究执行、策略开关仍为 true；研究默认仍为 `openrouter / openrouter/free`、修订 5，健康接口为 healthy。
- 17 张受保护表的数量与完整行摘要、所有原 AiRun 完整行摘要、DSA 四张控制表、来源启停／20 条路由、所有挂载及非 V2 环境键值摘要与故障前及本轮更新前基线均一致；数据库仍为 `thesis_ledger`，owner 与 head `20261023010000_report_metadata_snapshots` 保持。
- 两条失败任务均可通过原模拟范围的报告 GET 读取，HTTP 200、status=failed、原错误摘要及冻结范围保持、result=null。新诊断任务的完整行摘要仍为 `05a00cd7a9390d343b80d92f40b38dbc`，唯一请求仍为 `b458fcb4-af61-4522-aa04-6e84e000546f`，脱敏诊断与采样结束时一致。
- 研究计数仍为 runs=2、tools=22，Observation／Invocation／InvocationFact 均为 0；任务行与唯一请求记录未被重放。原授权额度均保留已用尽事实，本轮新增调用为 0。

G3-D1／D2／D3 的诊断与恢复子范围通过，G3 总门禁继续未完成。现有证据只定位到 SDK 收到两字符无效 JSON；没有生成成功报告，不能代收成功报告引用及历史报告验收。Longbridge 和其他原暂停边界保持。
