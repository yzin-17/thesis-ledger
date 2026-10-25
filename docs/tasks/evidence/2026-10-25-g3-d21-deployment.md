# D21 正式快更与零模型运行态验收

日期：2026-10-25。关联[原 Task 的 G3-D24](../2026-10-18-research-evidence-evolution.md)与[原 Spec 的 G3-RSP7](../../specs/2026-10-18-research-evidence-evolution.md)。部署前状态见[D23 前置核查](2026-10-25-g3-d21-preflight.md)，完整模块、配置与业务摘要见[机器回执](2026-10-25-g3-d21-deployment.json)。

## 结果与边界

已通过 infra 正式 `sync-code.sh thesis-ledger` 将 D21 更新到当前 Server／Worker。两个运行面各 15 项模块均与本地新构建逐项一致，实际解析的 Schema 包已包含响应诊断文件及 runtime.httpResponse。capabilities 明确直连返回 200／canCreate=false，V2 保持关闭，两面均无临时策略。

本轮模型调用 **0**，目标配置与业务写入 **0**，余 8 次冻结。五个目标容器的 ID／镜像／挂载不变，22 张业务／AI 表完整摘要不变，D20 失败记录完整摘要保持。没有 stage／commit／reset／clean，也没有修改依赖或运行环境配置来解决命令问题。

本次为**容器可写层快更**：镜像 ID 未更新，容器重建后不会保留本次覆盖。D21 的当前运行态部署子范围通过；真实 D21 Provider 响应、正式报告／引用／历史、发布重建反读及 G3 总验收仍未完成。

## 入口选择与实际执行

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。最小目标 `thesis-ledger` 对应现行 Server 与 backtest-worker，未选择 all／dsa。脚本语法检查退出 0；D22／D23 已验证输入均未变化，原定向与边界证据按输入复用。

正式快更入口在任何同步前检查：两目标已运行、Compose 镜像引用一致，Server 及 domain／schemas／shared 清单与容器相同，Prisma Schema／全部 migration／raw-owned inventory 整目录相同。两次正式调用均进入构建阶段，说明这些预检已通过；没有依赖／结构拒绝，因此没有改用 update.sh，也没有绕过预检。

| 正式调用                                                                                 | 退出结果 | 实际影响                                                                                                     |
| ---------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `rtk proxy ./scripts/sync-code.sh thesis-ledger`                                         | 1        | 兼容预检通过；shared 构建因 node 不在升级权限环境 PATH 中而失败，尚未同步或重启目标                          |
| `rtk proxy env PATH="/Users/yzin/.volta/bin:$PATH" ./scripts/sync-code.sh thesis-ledger` | 0        | 使用已存在的 Node v24.18.0；shared／domain／schemas／server 构建、双面同步及重启、健康与镜像不变检查全部通过 |

首次失败后先停止部署推进并核实：升级权限环境没有 node，只找到 Codex fallback pnpm；项目的 tsc 启动器已存在，失败点是 exec node。没有将其解释为缺依赖或 SDK 故障。随后用现有 Volta pnpm 的主仓目录与 shared 过滤器验证 node --version，通过后才重新执行同一个正式入口。PATH 仅对这一次宿主进程生效，没有修改 shell／pnpm／目标配置，没有安装或升级依赖。

脚本先同步 Server，再同步 Worker，各自替换 Server dist 及 domain／schemas／shared dist；然后重启这两个目标，健康均通过。未运行镜像 build／pull、数据库升级、恢复／清理或卷变更入口。正式执行日志显示镜像 ID 始终为 `sha256:42d12136ad41bb4c2af4b56974d8ecc9ffcacc23e75d225397c70c888eb07ce3`。

## 模块与接口的独立核对

核对按部署后实际文件与包解析路径进行，不只复用脚本健康结果。两面均有以下 15 项与宿主构建完全一致，原 3 项缺失及 5 项差异已消除：

| 核对组                                                                                                                     | 每面项目数 | 最终结果                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| AI adapter、model、facts、diagnostics、stream、failure、http-request、http-response、http-response-error、runtime-versions | 10         | 全部 SHA-256 一致                            |
| research.controller、research-submission.service                                                                           | 2          | 全部 SHA-256 一致                            |
| 实际 schemas 包 index、http-response-diagnostic、runtime-diagnostic                                                        | 3          | 全部 SHA-256 一致，runtime.httpResponse=true |

目标 Schema 实际目录仍为 `/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/`。SDK 实际版本均为 ai 7.0.107／@ai-sdk/openai-compatible 3.0.53／zod 4.4.3，目标 Node v24.21.0 未变。

Server 的 `AI_RESEARCH_V2_WRITES_ENABLED=false`，Worker 原先未设置该开关且保持未设置；两者均没有 AI_RESEARCH_POLICY_JSON。部署前后两服务的非易变环境键／值摘要逐项相同，没有把 Worker 的原未设置状态改写成显式 false。

仅发一次明确直连的只读 GET capabilities，不使用系统代理：HTTP 200、research-capabilities-v2、canCreate=false、5 个允许范围、124 字节，SHA-256 `962b56cc67ec701a493ead67228bb6dc5abbece9d0889e9ea81622538cd9fe20`，与 D23 直连结果一致。没有提交研究、用途验证或 Provider 直连。

## 数据、配置与 WIP 保护

部署前后均在 PostgreSQL RepeatableRead／READ ONLY 事务中只读计算表摘要，不输出任何业务正文、Prompt、请求体、凭据或原始结果。实际 database 为 thesis_ledger、owner 为 thesis_ledger、访问 role 为 thesis_ledger_app；结构 head 始终为 `20261023010000_report_metadata_snapshots`。

- 原 17 张保护表及其余 5 张 AI 表，共 22 表的行数与完整行集合摘要逐项完全相同。ProviderConfig／AiRoutingSettings、旧 AI 记录与业务记录保持；这不是仅比较数量。
- AiRun 始终 6 failed／1 succeeded；BacktestJob 始终 14 failed／57 succeeded，优化／编写任务表无待执行状态。部署前没有可能因重启继续执行的非终态任务，部署后状态分布相同，没有新增 AI 请求记录。
- D20 run `238c6c7e-54f7-4f46-9fc6-c7ffb0188a81` 仍 failed／research_unknown_outcome、result=null，完整行 MD5 仍 `d5f9ca41c5b5bf72895025c1f0c3cbca`。没有改写旧失败、实际费用或外部结果。
- 两服务环境摘要、infra 的 .env／.env.example／Compose 文件与正式入口脚本摘要完全保持。
- Server、Worker、PostgreSQL、Redis、DSA 五容器的 ID、镜像、全部命名／匿名挂载相同；仅 Server／Worker StartedAt 更新，其余三服务没有重启。没有据此声称额外逐表复核了 DSA SQLite；本次入口未操作 DSA。
- 主仓／infra HEAD 保持 da002744bd317b7754832c6ac41d169bcf005e27／3f661df1deb3de894755dcc66e584abb4165d014，索引仍为空。现有 WIP 不重置、不覆盖；新增写集仅原 Spec／Task 的当前授权与状态、证据及旧入口链接。

## 验证范围与仍未验收

正式宿主构建四包通过，脚本最终退出 0；独立模块、Schema 运行字段、capabilities、22 表保护、环境／文件摘要及五容器挂载检查通过。仅以本次启动时间及每面 --tail 300 检查有界日志，没有 ERROR／FATAL、缺模块或缺表信号，不宣称扫描了全部历史日志。D22 的 30 个与 D23 的既有输入未变，已有定向测试按范围复用，没有为部署重复模型或全量测试。

最终 Spec／Task 与回执状态一致，84 个本地文件链接无缺失，文档格式通过；D24 及三个子叶完成，D8／D20／D21b 保持未勾选。主仓 WIP 为 1216 项，其中本轮新增两份部署证据；infra 仍 105 项，两仓索引均为空。

本轮未取得任何真实模型响应，没有运行真实 D21 错误捕获或正式 V2 生成。镜像未重建，重建持久化及正式产物反读未验收；不能以当前 15 项一致、健康或 canCreate=false 代收这些门禁。D20 的原 HTTP／实际模型／结束原因／用量／费用仍未知。

本轮授权的部署与零模型核查完成，到此停止新增执行。后续真实采样仍须独立获得单次授权、0 元及首次失败停止约束；余 8 次继续冻结。G3-D8／D20 及 D21b 的真实响应／正式业务验收保留未完成。
