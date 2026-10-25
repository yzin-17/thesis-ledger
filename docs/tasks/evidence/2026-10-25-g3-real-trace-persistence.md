# G3 真实请求 trace 与重建持久化验收

对应原 [Spec](../../specs/2026-10-18-research-evidence-evolution.md) 的 G3-RSP12 和 [Task](../2026-10-18-research-evidence-evolution.md) 的 G3-D29。结构化回执见[同名 JSON](2026-10-25-g3-real-trace-persistence.json)。

## 验收结论

真实请求的失败链捕获和同镜像重建持久化通过；真实上游正文的正向验收未通过。唯一一次请求在 TLS 建立前连接断开，未收到 OpenRouter HTTP 状态、响应正文、SSE 帧或模型输出。没有再次派发，按一次授权请求占用额度，余 6 次继续冻结。

收尾经 infra 正式入口恢复 V2=false、撤除临时策略，capabilities 返回 200／`research-capabilities-v2`／`canCreate=false`，待执行研究为 0。五项服务健康，业务数据、旧 AI、Provider 配置、来源路由和挂载保留。未 stage／commit。

## 本次身份与原始事实

| 项目 | 事实 |
| --- | --- |
| 提交 | `d9a1bfe1-08fe-4739-83f7-21c5aed2e4ab`；本机提交回执 200、`reused=false` |
| 任务 | `b0ce2e5e-6cb6-4cef-8160-42221b875d47`，attempt=1 |
| trace | `ba68ab6e-6b05-4bad-be33-f2338925a718` |
| SDK 请求 | `46ae3809-6e30-4805-8520-6bfe2c01fe57` |
| 派发 | 2026-10-25 18:33:28.782（北京时间），`nativeFetches=1` |
| 目标 | `POST https://openrouter.ai/api/v1/chat/completions`，`openrouter/free`，stream、native_schema、V2 原生 JSON Schema；保留推理默认 |
| 上游响应 | 未获得 HTTP 状态／响应正文；SSE 帧 0、SDK 文本 0 字符、实际模型和 generation ID 未知 |
| 业务终态 | failed／`research_unknown_outcome`，`result=null` |
| 捕获终态 | `captureStatus=complete`，issues 为空；manifest status=failed |
| 用量和费用 | Provider token／实际费用均未知，`provider_cost_unavailable`；0 是本次策略上限，不能写成已确认实际账单 |

本机提交的 200 只确认任务创建，不能作为 OpenRouter 返回 200 的证据。请求 body 为 22,517 字节，SHA-256 为 `a43b685c039543cd71c48f017ee77e15605ff4c1915a221c84ad4177ca49355a`；保存的格式化 JSON 为 37,774 字节，其紧凑序列化后字节数和摘要与派发边界相同。

## 各层输入和输出

| 节点 | 本次记录 |
| --- | --- |
| `business.execution` | 冻结业务输入、最终数据库行；节点操作完成，业务行本身为 failed |
| `sdk.generate` | 实际 Prompt、Schema 等 SDK 输入；输出错误事实、usage、cause 链，契约检查为 missing |
| `http.request` | 目标、脱敏 headers、完整请求 JSON；输出 `TypeError: fetch failed` |
| `upstream.response` | skipped／`not_reached`，没有伪造正文文件 |
| `business.result` | skipped／`not_reached` |
| `business.persistence` | 失败提交输入及成功写入确认 |
| `business.final_state` | 原状态机实际收敛的 failed 行及错误摘要 |

SDK 错误原文为 `Cannot connect to API: Client network socket disconnected before secure TLS connection was established`。记录的 cause 链为 `AiSdkGenerationError → AiSdkGenerationError → AI_APICallError → Error`，最内层消息为 `Client network socket disconnected before secure TLS connection was established`。SDK 将连接错误归为 `transport_unknown`；没有 OpenRouter HTTP 响应可据以归因到其 Provider。

18:38:27 的独立只读 TLS 握手中，宿主机和重建后 Server 均与 `openrouter.ai:443` 建立受信任 TLSv1.3，分别耗时 480／186 ms。该检查没有 HTTP 请求、Authorization 或模型载荷。断链当时的具体网络节点仍未知，后续握手成功也不能补作真实模型响应验收。未因此修改代理、TLS、目标配置或再发模型请求。

## 镜像、正式更新与重建

1. 通过 `thesis-ledger-infra/scripts/update.sh thesis-ledger`，`DEV_DATABASE_MODE=check`、`UPDATE_SPACE_MODE=auto`，临时开启 V2，策略限定 `maxAiCalls=1`、`maxCost=0`、`paidRoutes=[]`；退出 0，只构建一次应用镜像。
2. 已验镜像为 `sha256:d1e5369eefa33638b2847dc30563c84e41a1511e836a11200bd25a5467c738de`。Server／Worker 的 Server 2037、Schema 561、domain 228、shared 3 项运行产物一致，与当前源码对应产物逐文件相同。实际 Schema 解析入口为 `/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/index.js`。两端使用实际 V2 Schema 的内存探针通过，外部请求为 0。
3. 宿主旧 dist 额外包含 Schema 18 项、domain 15 项已无源码的构建残留；逐项核实后作为旧产物记录，未删除宿主文件，未放宽仓库门禁。新镜像所有实际文件与宿主同名文件相同。
4. 收尾从同一正式入口提供 `REUSE_THESIS_LEDGER_IMAGE_ID` 为上述完整 ID、V2=false、取消临时策略、数据库仍为 check；退出 0。复用身份及运行形态校验通过，跳过应用构建，强制重建 Server／Worker。复用入口的独立交付见 [infra Task](../../../../thesis-ledger-infra/docs/tasks/2026-10-25-update-reuse-thesis-ledger-image.md)。

| 消费者 | 捕获时容器 ID | 关闭并重建后容器 ID |
| --- | --- | --- |
| Server | `5da35f138e932b9dc627f856f76b47f4802d74ad71c9c10de164b7c7eb793098` | `a2e2fb04dd2f8cf6c30fe26304525fc44f650f1766c8ea17a0978a1bab0e7b6c` |
| Worker | `7b11031be665250f1dc5522dd93d0554fc9fd6df8b1f7242b8ce443cfb1ba46c` | `fd0f5c41c059a7521bc38d21103bbf26b74bf86dab50fa79be2f219498aa89e9` |

两个新容器仍使用上述同一镜像和 `thesis-ledger-backtest-data` 卷。相同 trace 的 manifest＋11 个 artifact 共 12 个文件、123,169 字节，在重建前后及两端逐字节、权限和归属一致；集合 SHA-256 为 `acdf2f227002592a8614b86d0b0cfa6ff83e6bb9eeff5716e80c47e9c6416515`。manifest SHA-256 为 `b3f12f0d932b168eb127a03bcdd2487acd1ccadb31e0b3d1138a1a7ff013e3a6`；四层目录均 0700、文件均 0600、uid=100／gid=101。

## 数据与消费反读

- 数据库仍为 `thesis_ledger`／owner=`thesis_ledger`，head=`20261023010000_report_metadata_snapshots`。22 表中的所有旧行摘要保留，20 张非 AI 明细表完全相同；AiRun 8→9，仅本次任务；AiToolCall 88→99，新增 11 行均属于本次任务。所有旧 AI、Provider／路由配置及 DSA 控制、准入和 20 路由保持。
- PostgreSQL／Redis／DSA 容器身份保持；全部业务挂载按目标路径比对一致，包含 DSA 匿名卷。目标原环境恢复，Worker 保持原 V2／执行变量未设置、无临时策略；Server 的执行和策略优化原开关保持。
- 关闭重建后，报告明细和历史均返回 200，同一本次任务仍为 failed／`research_unknown_outcome`、`availability=missing`，没有把失败状态展示为报告成功。相同数据库行及 trace 原文件反读不变。
- 三仓 10,113 项 WIP 文件指纹及配置摘要留存在私有保护回执；最终核对没有原文件丢失、HEAD 变化或暂存项，DSA 工作树及配置摘要保持，主仓另有并行移动端文档更新。见私有 `closed-workspace-proof.json`。原应用本地检查沿用 D28；本轮 infra 复用、DSA 复用、21 场景更新、空间、数据库、构建及 Dockerfile 合同、Shell 语法检查通过，真实复用与反读另行完成。
- 原验收集合 22,452 文件保留，359 个原源码快照内容摘要仍为 `9ff1e5de84db45d90a9befa35b31e7cd019bfe088087531fb43b5a30c4580a8e`。当前新增并行批次文件 1,653 项；原集合唯一元数据变化为 `acceptance-batch5-2026-10-25/metro-current-source.log` 追加 761 字节，原总元数据摘要因而发生变化，未截断或回滚该实时日志。见私有 `acceptance-proof.json`，不宣称原目录总摘要保持。

## 私有取证与剩余条件

原始捕获目录为 `/app/var/backtest/ai-traces/ba68ab6e-6b05-4bad-be33-f2338925a718/b0ce2e5e-6cb6-4cef-8160-42221b875d47/attempt-1`。本地逐文件导出与各阶段保护证明位于 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d29-20261025/`，不加入 Git：

- [trace 索引](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d29-20261025/trace-export/trace.json)
- [已派发请求体副本](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d29-20261025/trace-export/7e61f199-ee1b-4924-9f4a-1026b6769f7a-request-body.json)
- [SDK 原始错误与 cause 链](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d29-20261025/trace-export/7ad0b595-404b-4582-9c51-798a29299910-output.json)
- [重建后逐文件证明](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d29-20261025/closed-trace-proof.json)

G3-D29c 和 G3 总验收保持未勾选：本轮没有上游正文可交付，也没有成功报告。真实响应正向验收需要新的一次明确授权，继续使用 free／零费用上限／失败即停，不能把成功 TLS 握手或完整失败 trace 代替它。本轮不会补造 D20 上游信息或 D25 已丢失的旧正文。
