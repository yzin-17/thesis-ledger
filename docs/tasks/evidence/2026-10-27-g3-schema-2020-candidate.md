# G3 D41：2020-12 候选与条件迁移验收

## 结论与当前接续

本地候选通过，真实Qwen未通过，未派发GLM，未推广到应用源码。用户授权为“你可以先试着迁到 2020-12，然后验证Qwen 和 GLM，如果都成功，就迁过去”；沿用失败停止边界，新增最多2次中已用Qwen1次、GLM1次继续冻结。G3正向、双模型兼容和迁移验收均保持未完成。

Qwen本次收到HTTP200并开始返回reasoning，D40的HTTP400／8006方言拒绝未再出现；约300秒时客户端TimeoutError中断请求，网关最终记录499。没有完成的合法研究对象，不以HTTP200或推理片段当作迁移成功。

本轮只有私有候选、验收包和关联说明文档发生新增或更新。业务Zod、应用输出层、接入就绪指纹、依赖及目标运行态未修改；V2与Cloudflare Provider保持关闭，不stage／commit，不部署。

## 候选范围与本地证据

候选位于`.recovery-artifacts/g3-d41-schema-2020-20261027/`，通用实现由AI输出层持有，未新增品牌分支。使用已安装的AI SDK 7.0.107／Zod 4.4.3；原Zod负责运行时校验和转换，wire采用2020-12。

Zod原生2020-12转换只生成prefixItems，仍丢失固定tuple长度。候选通过通用tuple转换补齐原业务语义：operands使用两个prefixItems，并保留minItems=2、maxItems=2、items=false。该限制来自原`z.tuple([fieldValue, fieldValue])`，与生成token上限无关；不改领域字段或结果形状。

SDK公开`jsonSchema`参数类型仍标为Draft 7，实际运行时原样传递传入文档。候选将这处互操作类型断言集中在一个明确边界，配套2020-12元Schema、完整样例及实际SDK出站检查；不以类型断言代替运行时验证。原Zod异步校验仍执行，避免转换被重复应用。

| 检查 | 结果与输入范围 |
| --- | --- |
| 候选严格TypeScript检查 | 通过；使用Server依赖解析候选，无应用源码替换 |
| 2020-12元Schema及编译 | 7个现有生成契约均通过，含研究V1／V2与5个策略契约；使用现有Ajv 8.20.0，不改依赖 |
| 固定tuple | 长度0／1／3拒绝，长度2接受；可选位置与rest样例的结果与原Zod一致 |
| 业务样例与校验委托 | 完整研究样例通过；额外字段、错误引用与细化拒绝保持；trim／default／transform样例只转换一次 |
| 原输出层定向测试 | `pnpm --dir apps/server exec vitest run test/ai/ai-generation-output.test.ts`，1文件／8项通过；不代表全Server回归 |
| 两模型受控SDK出站 | 各1次内存响应，外部调用0；固定材料和严格结构化设置保持，候选响应可通过原Zod |
| D40到候选wire差异 | Qwen仅变更Schema：方言、tuple的prefixItems／长度／额外项约束；GLM候选另更换模型ID |

Qwen候选正文22515字节，SHA256为`e59d3ebca9ab2ccbdd2d59e02e2195cbe09f264d2c2178e116258a4ce13f4987`；候选源码SHA256为`7ffe20cd5b93539e6971b1a04fd3248b85c5f7af1d5268ad7459be6c0f965f6c`。messages摘要仍为`a4e5f6a2ed3b147e8757ec959fca40c371b2045fcd759e1b580ea2dc622cd2d5`；response_format摘要为`156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a`。

## Qwen唯一真实请求

| 项目 | 实际证据 |
| --- | --- |
| 模型 | `@cf/qwen/qwen3.8-27b` |
| 时间 | 北京时间2026-10-27 00:38:33.575～00:43:33.632；本地总时长300057ms |
| trace | `58b15f37-0d28-4b80-b1ca-9f48fbb9e1c8` |
| 网关日志 | `01a17913-fb15-7730-913c-be5a3d0c4f91`，与客户端响应头一致 |
| 参数 | stream=true、严格json_schema；max_tokens／max_completion_tokens／stop／reasoning／thinking均缺省；材料与D40相同 |
| 运行边界 | 三项SDK超时沿用299910ms，外层诊断信号310000ms；SDK maxRetries=0，实际nativeFetch=1 |
| HTTP与终止 | 客户端入口200；SDK报`The operation was aborted due to timeout`；网关最终499、duration=298420ms，与客户端超时中断吻合 |
| SDK结果 | transport_unknown／stream，外部结果unknown，用量unknown；未进入冻结数值／引用验证，无业务报告写入 |

本轮未改变reasoning，不能据此确认关闭reasoning后是否成功；也未据此认定历史GLM内部500由Schema造成。

## 原文采集边界与用量

实际响应累计3172318字节，trace记录原始流SHA256为`aaa55d4e02dba0ed3876ac16990b72bc3ecf1c02892553da15e0b8ae6b0b5f20`，但正文截断且未持久化完整响应体。trace为incomplete，记录response_body_limit、unparsed_response_body、response_read_error、response_artifact_failed；未获得DONE。现有文件存储默认单artifact上限2 MiB，正文artifact写入失败，不能将此trace标为完整正文取证成功。

网关request_head完整且与实际客户端正文去掉绑定模型后的其余字段一致；response_head恰为2000000字节，response_head_complete=false。只在此保留前缀中解析到5665个完整delta对象、18568个reasoning字符、0个content字符；这些是前缀内观察值，不是完整模型输出或token用量。不能恢复被截断部分，也不能推断完整请求总共只产生这些内容。

网关记录success=true但status_code=499，计数输入0／输出1、0.290909081697464 Neurons、cost=0.000003199999898672104；这些为中断日志自报，不能作为完整请求用量或实际账单。SDK仍为unknown，账单未读取；零费用边界沿用用户确认的Workers Free超额拒绝，不升级套餐或开启付费超额。

## 保护反读与条件门禁

- 原22表、旧AI任务／工具、DSA、Provider与默认研究配置、凭据、容器环境／挂载保持；pending=0，V2=false，canCreate=false，Server／Worker健康且镜像一致。
- 三仓HEAD及空暂存区保持；2349项原WIP状态与已捕获文件摘要／权限保持。该WIP数量沿用原保护方法，目录项不冒充递归文件内容摘要。
- 原保护脚本在完整trace断言处失败，失败证据保留；其之前的数据／配置／WIP比较已通过。另行只读核对明确要求本次timeout失败及incomplete状态，验证文件摘要可反读，单独出具保护通过记录；没有把不完整正文改判成功。
- GLM预备计划used=0、无派发锁，已标记frozen_after_qwen_failure。未推广候选，native_schema就绪版本、应用源码与目标配置保持。

私有依据为候选目录的local-proof.json、wire-proof.json、condition-result.json，以及`.recovery-artifacts/g3-d41-qwen-20261027/`中的plan.json、outcome.json、gateway-log-detail.json、response-proof.json、protection-proof.json、原失败日志及trace。原验收包保留，不覆盖历史材料。

当前第一未通过层为Qwen真实完整响应／合法研究对象；GLM尚未验证。长流超时与正文采集容量已成为明确后续前置，需处理后再获得受控重验条件；本轮不继续派发、不调整时限或采集配置。只有本地语义及Qwen／GLM真实正向均通过，才推广同一候选并验证相关就绪指纹、Server回归与仓库门禁；部署和正式G3继续独立验收。
