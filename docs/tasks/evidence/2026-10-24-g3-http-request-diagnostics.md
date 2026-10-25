# G3 实际 HTTP 请求参数诊断验收

## 当前检查点

2026-10-24 15:55（北京时间）：G3-D11～D13 的 HTTP 请求参数诊断已完成本地、目标 PostgreSQL 和最终关闭更新后的反读验收。G3 本次唯一调用在流式传输处失败，已停止于 1/15，余 14 次冻结，没有自动重试。用量、实际模型与费用未返回，费用未知，不能记为已实证零费用。目标五个容器健康，V2=false、canCreate=false，原研究策略已恢复未设置。

部署前 `JournalReviewSnapshot` 从 2 条增至 3 条，原 2 条逐行摘要保留；用户已确认新增 `246eacb8-f712-4d01-9a94-b9377dae6db9`（北京时间 15:42:17.849）为预期追加，原样纳入本轮基线。最终 17 张保护表与该基线完全一致，旧五份 AI 记录、来源启停／路由／准入控制、环境和挂载摘要均保持；本次新增唯一研究任务及 11 条工具记录，其他计数不变。Account／LedgerEvent 追加及三张业务投影仍沿用既有授权。

机器证据、源码指纹、正式更新回执及保护基线见[回执](2026-10-24-g3-http-request-diagnostics.json)。既有用途验证、报告／引用／历史／Web 按不变输入复用，见[前轮证据](2026-10-24-g3-openrouter-explicit-compatibility.md)。G3 正向业务门禁仍未完成；新卡点是上游流式错误，下一步只读核对现有日志／SDK 错误映射须用户确认。

## 实现范围

- 在 SDK 完成参数转换后、调用 fetch 前提取实际发送参数；只保存首个请求和发送次数。白名单包含模型、流式标记、结构化输出方式／严格开关、Schema 摘要、require_parameters、token 上限、推理参数及 usage 标记，整份最多 1 KiB。
- 不记录 headers、URL／query、消息／Prompt、Schema 或工具原文、凭据。无法观察的 body 明确标为 unavailable，超长 body 保留长度／摘要并标记截断；未知枚举固定归一化为 other。
- 成功时进入 SDK 请求事实，失败时进入现有错误诊断；沿生产 Store 与 JSON 账本保存及读取，旧记录可缺省。同一请求的后续结算不得覆盖或冲突原 HTTP 事实。运行诊断 8 KiB／失败诊断 12 KiB 边界保持。
- 诊断组合、HTTP 协议字段提取和请求事实合并分别由同领域纯函数承担，不调整请求体、认证、结算、maxRetries=0、业务结果或数据库结构／依赖。fetch 边界只能证明传入传输层的参数，不能证明上游收到。

## 本地验证

1. Schemas 定向 5 项、AI 合同包 26 项及 build 通过；输入未变，复用本轮前半段结果。
2. 修正后 Server 定向 5 文件 32 项通过，覆盖本地真实 SDK HTTP／SSE 的最终请求、成功／失败 JSON 账本往返、未知对象归一化、隐私、限长、认证及单次 fetch。
3. Server AI 包 403 项通过，76 项因未配置隔离数据库跳过；目标 PostgreSQL 新诊断落盘尚待 D13，不能由本地 JSON 往返替代。
4. Server typecheck、build、16 份改动文件 Prettier／ESLint、边界、依赖图及 git diff --check 退出 0。新增函数复杂度均不超过 20；保留既有结算／研究尝试／失败集成三个回调的 22／21／26 告警，未提高阈值。尺寸门禁退出 0，保留 8 条无关存量提示。
5. 首次规范检查的两处未知类型字符串转换错误及新增复杂度告警按用户确认修正：显式类型归一化、诊断组合、参数提取及请求事实合并提取；未关闭规则或增加 ignore。

## 目标与真实请求验收

- 执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，目标均为 thesis-ledger。官方 `./scripts/sync-code.sh thesis-ledger` 退出 0，日志 `/tmp/thesis-ledger-g3-http-sync-1792828006963.log`；只更新代码可写层。随后临时开启和最终关闭均通过 `./scripts/update.sh thesis-ledger`，退出 0，日志分别为 `/tmp/thesis-ledger-g3-http-enable-1792828157867.log`、`/tmp/thesis-ledger-g3-http-close-1792828418129.log`。
- 非敏感参数为 DEV_DATABASE_MODE=check、UPDATE_SPACE_MODE=auto、REPAIR_BUILD_CACHE_ON_NO_SPACE=false；单任务策略固定 maxAiCalls=1、maxCost=0、maxOutputTokens=20000、maxDurationSeconds=300、paidRoutes=[]。仅临时开启 V2，最终原策略与原开关恢复。首次错误保护未触发构建重试。
- 正式更新前后及最终重建后，8 个 Server 模块和 3 个 Schema 模块摘要与已验本地构建一致。研究仍为 openrouter/free、openrouter-v1、native_schema、research-generation-v2，冻结配置指纹保持；复用两条已通过用途证明，未新增验证调用。
- run `428b6e10-4d9a-459b-a375-6abcd286c1ba`，request `d1b11eb3-f767-4482-9d01-d86adfcf0321`：唯一 HTTP fetch 尝试，POST chat_completions，stream=true，json_schema、strict=true、require_parameters=true、max_tokens=20000、include_usage=true；reasoning_effort 与 reasoning 均未设置。请求体 22,542 字节，仅存摘要，不存原文。
- 错误为 transport_unknown／stream／Provider returned error，externalResult=unknown；任务收敛 research_unknown_outcome，result=null。兼容层可解析流帧、正文和推理均为 0，实际模型／结束原因／用量缺失。此次没有可用 JSON 正文，不据此判断旧无效 JSON 的责任层，也不将 unknown 记为免费成功。
- 650 字节 HTTP 诊断、1,713 字节失败诊断和 774 字节运行诊断符合原上限；实际执行／错误／HTTP Schema 均通过。最终关闭更新后任务整行摘要仍为 5aea5b24944b69da19452c653f5b8c24，HTTP 诊断 SHA-256 为 3a9e597fd8c5903259741db0f8b4cdf96db3a77a683622732ab716530127d8d6。目标账本与模块保持，未重发或重试。

## 接续边界

本轮 HTTP 参数诊断叶完成，G3 保持未完成。剩余 14 次 OpenRouter 的 openrouter/free 冻结，原总费用上限 0 元不变；当前费用事实为未知。下一步拟仅只读检查本次已留存错误日志与现有 SDK 错误映射，确认能否获得上游状态或明确原因；不改代码／配置、不新增模型调用，证据不足即停止汇报，等待用户确认。V2 保持关闭。
