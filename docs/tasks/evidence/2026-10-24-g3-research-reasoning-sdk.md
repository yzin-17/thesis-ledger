# G3 研究用途显式推理参数接线与验收

## 当前检查点

2026-10-24 17:20（北京时间）：D16 本地接线与门禁通过，正式 sync-code 更新和 14 个模块核对通过。随后仅研究用途复验一次，上游拒绝 Reasoning is mandatory for this endpoint and cannot be disabled.；立即停止，未重试、未保存配置、未提交 G3。停止在 1/2，余 11 次冻结，费用按免费配置估算 0 USD，实际用量／费用未知。V2 全程关闭，所有原数据、配置、来源和路由保护通过。

实施按 D16a 合同／保存／指纹、D16b SDK／探针／冻结、D16c 本地门禁、D17 目标运行态与真实用途／G3 分层；保留原 auto／模式／启停、默认 openrouter/free、其他用途证明及数据／来源／路由。首次失败停止、不自动重试，目标未就绪时不部署，验后 V2=false。

## 已确认的前置修正

- 用途探针接收准确合同，研究 V2 选择真实 V2 Schema／消息；未指定合同的旧调用保持兼容。
- 仅 stopOnFirstFailure=true 允许 pending 用途数 ≤ 授权次数 ≤ 原计划次数，计划指纹仍必须相等；实际 remainingCalls 使用授权值。没有该约束的调用保持原次数严格比较。
- 既有按 V2 路由记录的研究用途证明不作为探针准确 V2 合同的实证；旧记录保留，新参数须复验一次。分析用途证明按不变输入复用。

## 本地验证

已通过 false 保存／省略保留、仅研究指纹变化、错误范围拒绝、准确 V2 探针／Schema／消息、受控单次授权和拒绝边界、冻结参数与派发一致，以及真实本地 HTTP 最终 reasoning.enabled。类型最小修正后，Schemas AI 包 28 项、Server AI 包 411 项通过（76 项隔离数据库测试因环境未配置跳过），Server typecheck／build、API 客户端 typecheck、定向格式／ESLint、边界／依赖／尺寸及 diff 门禁通过。没有运行手机任务或重复不变的市场／历史来源验收。

## 本地类型修正与门禁记录

- 用户确认后，两处 helper 输入类型允许显式 undefined，冻结读取 helper 返回类型收窄为实际保存形态；前者消除原级联错误，后者解决同一类型修正暴露的单条剩余返回类型错误。最终 Server 类型门禁通过，运行语义及不写入缺省字段保持。
- 将 frozenRoute 的缺省处理移入 helper，executeAttempt 恢复既有复杂度 21。ESLint 无错误，保留 settingsPersistence=22、saveContext=33、inputValidation=23、executeAttempt=21 的存量告警；新增 helper 无超限，未提高门限。尺寸检查保留 8 条无关存量提示。
- 最后受影响定向 23 项通过，先前未变的 16 项 readiness 及 9 项 Schema 证据按输入复用；随后包级／构建与门禁通过。源码指纹、失败历史与预算见[机器检查点](2026-10-24-g3-research-reasoning-sdk.json)。

## 官方更新与用途复验

- 执行目录 /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra，入口 ./scripts/sync-code.sh thesis-ledger，退出 0；日志 /tmp/thesis-ledger-g3-reasoning-sync-1792833259581.log。本次仅更新容器可写层，镜像未更新；没有执行 V2 开启或关闭完整更新，因为用途验证失败时 V2 始终为 false。
- 14 个目标模块摘要与已验宿主构建一致。提交前全部 17 张保护表、旧 AI、来源控制与 V2=false 核对通过。
- 正式计划只有 research／openrouter/free 待验证，policy=auto，maxCalls=3，估算 0 USD。按已批准的收窄授权实际只允许 1 次，stopOnFirstFailure=true；原分析用途证明复用，原 auto／模式／启停不变。
- operationId 3636758f-507f-4597-8768-fc9991d040d4，requestId c62179c2-e492-49fa-86e1-34e7e8043dac。目标 ProviderHealthCheck 仅该唯一请求的 pending／failed 两条记录，17:18:17～21；验证为准确研究 V2、native_schema、reasoningEnabled=false。正式入口返回 400，原文为 Reasoning is mandatory for this endpoint and cannot be disabled.；原配置未保存，研究开关仍缺省。
- 上游未返回实际模型、用量或费用。失败账本只按 configured_model_pricing 估算 0 USD，不写作 provider_reported；保守计入一次，余 11 次冻结。未继续后续用途、模式或 G3。

## 最终保护与下一步

最终五个容器健康，V2=false、canCreate=false，原策略未设置。17 张保护表／旧 AI／计数、四张 DSA 控制表、环境、原开关和挂载身份均保持。挂载列表出现展示顺序差异，按 destination 排序逐项核对后完全一致，没有卷或挂载变化。

新卡点在随机 free 路由与禁止推理要求不兼容：本次实际端点要求强制推理，而 D15 只证明固定 NVIDIA 免费模型可关闭推理。后续需用户决定是否仅将研究默认固定为已验证的 nvidia/nemotron-3.5-super-vl:free；该决定会改变现有研究默认，尚未授权或执行。其他用途、原六条路由启停、数据来源与旧证据继续保护；不扩搜或试用其他模型。
