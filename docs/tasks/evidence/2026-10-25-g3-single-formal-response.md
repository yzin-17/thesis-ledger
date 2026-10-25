# G3 D25 单次正式请求与关闭保护证据

日期：2026-10-25。对应原 [Spec](../../specs/2026-10-18-research-evidence-evolution.md) 与 [Task](../2026-10-18-research-evidence-evolution.md) 的 G3-D25；机器事实见[同名 JSON](2026-10-25-g3-single-formal-response.json)。

## 本轮结论

本轮一次正式 G3 请求已执行并收敛为 failed／research_schema_invalid，result=null。实际收到 HTTP 200、完整 SSE 和合法 JSON；完整 V2 Schema 校验未通过。未复现 D20 的 Provider returned error，亦未证明该历史问题已修复。

正式关闭更新最终退出 0，V2=false、临时策略不存在，capabilities 200／canCreate=false。本次失败和原 7 条 AI 记录重建后保持；22 张保护表的原行全部保留。实际调用 1 次，剩余 7 次继续冻结。

## 单次边界与正式入口

- 正常业务新提交，不重放／改写 D20：submissionId=`3ee565b3-8a72-465c-8351-128179a58cbe`，runId=`b207e5e5-83d4-4a12-859a-67f7716d648d`，requestId=`2f29bfe0-cc96-4713-91ec-15b7002a975d`。
- 继续使用 openrouter/free、shadow、recent-changes、默认修订 5、native_schema／research-generation-v2。推理参数保持未显式指定，max_tokens=20000。
- 官方 [Free Models Router 页面](https://openrouter.ai/openrouter/free) 本轮核对为输入／输出免费路由；数据库冻结定价估算 0 USD。临时策略 maxAiCalls=1、maxCost=0、paidRoutes=[]；未追加用途验证、Provider 直连或自动重试。
- 开启前核对用途 ready、原配置指纹、30 个已验输入、来源准入和保护基线；原任务均已终态。开启后 Server／Worker 各 15 模块及实际 Schema 包一致，再派发唯一提交。创建接口 200，reused=false。
- 调用前使用原子防重复锁；派发后回执 used=1、reserved=0，禁止再次提交。同一次请求的离线摘要核验未调用真实模型。

## 真实响应与失败位置

| 事实 | 实际结果 |
| --- | --- |
| 发送 | SDK 请求 1 次，实际 fetch 1 次，执行 attempt 1 |
| HTTP | status=200，contentType=sse，responses=1 |
| 响应读取 | 940,128 字节，bodyComplete=true，bodyTruncated=false |
| SSE | 2,285 事件，DONE=true，invalidJsonEvents=0，incompleteEvent=false |
| Provider | 2,284 帧，结束原因 stop，无响应错误摘要 |
| SDK／Provider 正文 | 均为 5,677 字符，同一 SHA-256 |
| SDK／Provider 推理 | 均为 17,351 字符，仅保存计数与摘要 |
| 实际模型 | nvidia/nemotron-3.5-super-vl:free |
| JSON／完整合同 | JSON valid、root=object；完整 V2 Schema 未接受 |
| 失败 | schema_invalid／validation，externalResult=complete，errorClass=no_object |
| 用量 | 上游与 SDK 报告输入 5,613、输出 11,349 token；上游另报告推理 7,828 token |
| 费用 | 冻结定价估算 0 USD；未获得实际费用事实，不能记作上游已报告 0 |
| 持久化诊断 | HTTP 响应 329 字节，runtime 7,051 字节，failure 10,528 字节，均在原边界内 |

本次不是流中错误帧、无响应或输出 length 截断。现有失败合同仅保存 JSON 状态、结构掩码、计数与摘要，未保存具体字段级校验路径／问题码；无法确定实际哪项字段不合格。failure.truncated=true 对应结构预览截断，HTTP bodyTruncated=false；不能把两者混为输出截断，也不能声称字段问题被诊断预算裁掉。未保存模型正文、推理原文或原请求正文，未以猜测修改业务 Schema、默认模型或推理参数。

## 冻结输入与最终发送摘要

通过现有 verifyAiFrozenResearchV2 验证本次 11 份证据，均可用：1 份 quote、10 份 news。冻结输入指纹为 `1e1bde4563a8c4bf78470d856db5bdb19e56449eb67bc8ea2becb23af3707748`。

在进程内使用本次冻结材料、完整原合同和原 SDK 重建请求，fetch 仅允许离线 fixture 地址并返回合成响应。最终请求为 22,517 字节，SHA-256=`cc8b1df181cbb7966fdae043397589ef7dda764e2d7dd5416f403fb26b446b62`，与本次真实发送诊断完全一致；该离线过程真实模型调用 0 次。

D20 的最终请求同为 22,517 字节，但 SHA-256 为 `0beccf88684d2b4817f3143e0e391815b5936d8627af89cf8169ead3b723fb8b`；本轮按正常业务重新冻结，不能作为 D20 同体对照。D19 的实际模型也不能反推 D20；D20 的原响应、实际模型和费用仍未知。

## 部署、磁盘故障与最终运行态

执行目录为 thesis-ledger-infra，应用状态变更均经 `./scripts/update.sh thesis-ledger`，DEV_DATABASE_MODE=check、UPDATE_SPACE_MODE=auto。配置只通过进程参数临时开启／恢复，未改 .env、Compose、Provider、默认设置或来源配置。

开启更新退出 0。首次关闭镜像导出出现 I/O 错误，随后明确 ENOSPC；当次 REPAIR_BUILD_CACHE_ON_NO_SPACE=false，入口失败退出 1，daemon 随后不可连接。恢复关闭入口在 daemon 不可连接时退出 1，未进入更新。

既有引擎恢复入口的普通重启在停止残留后台阶段超时，既有 start 入口提示已运行但 daemon 不可连接。随后在既有恢复脚本增加显式 --force-stop 分支并通过 11 项命令替身测试；真实调用该入口时 daemon 已恢复，返回无需恢复、restarted=false，因此**未触发真实强制停止／启动分支**，不把幂等结果记为强制恢复验收。实现与边界见 [infra 原 Task](../../../../thesis-ledger-infra/docs/tasks/2026-10-05-docker-desktop-start.md)。

最后以 REPAIR_BUILD_CACHE_ON_NO_SPACE=true 重新执行正式关闭入口；脚本自动清理缓存和未引用镜像、保持全部卷，数据库 check 通过、更新退出 0。最终 Server／Worker 镜像均为 `sha256:76f0c84c3db2fb37c413682861b0f71f4789be8c1f7d59fc642229861b1ff382`。引擎恢复使原服务发生重启，不声称只有两个应用服务曾重启。

Server／Worker 的 15 项编译模块各自与宿主一致；实际解析的 Schema 包来自容器 .pnpm 依赖图，其 runtime.httpResponse=true。包版本保持 ai 7.0.107、openai-compatible 3.0.53、zod 4.4.3。最终 V2=false、策略不存在，Worker 原未设置的 V2 状态保持；capabilities 明确直连 200／canCreate=false。启动后的有界日志未发现错误级、缺模块或缺表信号。

## 数据、配置与 WIP 保护

- 数据库 thesis_ledger／owner thesis_ledger，结构 head 保持 20261023010000_report_metadata_snapshots；仅检查结构，没有迁移、重建或清库。
- 22 表的原行摘要全部保留；其中 20 表完整摘要不变。AiRun 7→8、AiToolCall 77→88，分别仅新增本次研究与 11 条工具记录。
- 原 7 条 AiRun 完整行摘要不变，包含 D20。新失败行在关闭重建后摘要仍为 `5b357954dbe3cf8427f036da3074b7d3`。
- 新失败详情和历史均可读，availability=missing、result=null；历史包含该 failed 记录。这证明失败记录保留，未产出可接受的新正式报告。
- DSA 四张控制表完整摘要、20 条路由以及五容器挂载保持。原新闻准入在有效期内；未续期已过期的研报元数据准入，本次实际材料只含 quote／news。
- Server 环境配置摘要无差异，七个 infra 配置／入口文件摘要保持。主仓与 infra HEAD、空索引保持；未暂存／提交。主仓既有其他 tracked WIP 摘要保持；infra 排除本次两文档、两恢复脚本后原 tracked WIP 摘要保持。
- 应用诊断输入 30 项摘要保持，复用 D22／D23 已验范围；本轮新增的是运维恢复保护分支及其定向测试，未扩大应用修复。

## 仍未通过的验收

G3-D8、D20 与 D21b 的完整正式业务验收保持未完成：本轮没有新 V2 成功报告、全部引用归属、成功历史及发布后成功反读证据。D21 已得到真实 HTTP／SSE 诊断与镜像重建持久化证据，但这些不能代收 G3。

本阶段最多 1 次的调用边界已用尽；剩余 7 次冻结。下一次真实请求之前仍缺少可审查的字段级失败诊断方案与对应离线证据，本轮未据未知字段打补丁或继续采样。
