# G3：OpenRouter 显式兼容配置验证

## 当前结论

显式兼容配置已补齐并正式落库，研究和策略编写分析两条原启用用途验证通过；其余四条用途、研究默认、来源启停及 20 条数据路由保持。G3 原样本仍在唯一一次业务调用后返回 research_schema_invalid，按首次失败即停暂停，未自动重试。最终官方关闭更新退出 0，V2=false、canCreate=false，原临时策略已撤销。

共享 19 次额度按用户确认保守占用 4 次：旧两次请求（一次分析通过、一次研究中断未知），加研究复验 1 次及本次 G3 1 次；剩余 15 次冻结。旧中断请求未重放，其上游费用仍未知；两次通过的用途上游均报告 0 USD，本次 G3 按冻结价格估算 0 USD。本轮不把未知费用记作已核实。

## 配置、用途及持久化验收

- Docker 恢复后，只读确认五个容器健康、原 17 张保护表／旧 AI 记录／来源控制与目标模块保持，V2 关闭。原 operationId fd8116c4-3faa-4f6c-862c-1c3510c74fc3 的策略编写分析已通过，研究仅留 pending；正式只读计划可复用分析证明。
- 用户确认按旧两次保守占用后，仅以新 operationId ba84a4b5-9ac9-46c2-b45a-30ef8ab69981 复验研究。2026-10-24 14:10:34（北京时间）通过，上游报告 0 USD；没有重验分析。
- 落库反读发现 settingsFromAiProviderInput 仅复制旧记录扩展，忽略新输入；用户确认后只修复该序列化，并让测试经过真实序列化路径。33 项定向、397 项 Server AI、类型／格式／ESLint／边界通过，76 项因隔离数据库未配置跳过；已有 Schema 和其他不变证据复用。
- 官方 sync-code.sh thesis-ledger 退出 0，目标序列化模块与宿主构建一致。正式保存计划 pending=[]、maxCalls=0；普通保存入口复用两条通过证明，在 14:19:33 将 compatibilityExtensionProfile=openrouter-v1 落库，未新增模型调用。原六条用途及启停状态逐项保持，其他 Provider 与默认路由保持。
- 原分析证明请求 2d7384c4-b5de-43c6-a60b-60c8f4fd5282、研究证明请求 de75791b-068b-4a14-a0f9-0286a6d2c725 均保留。后续完整镜像更新和最终关闭后，扩展及两条证明仍可读取。

## G3 唯一一次业务调用

- 原样本：600519.SH、shadow、recent-changes，研究默认 openrouter/free，研究设置修订 5。现有东财／HiThink 新闻准入有效且覆盖当前窗口；未改来源或路由。
- 原提交编号 598b4c8d-9e31-4237-8054-1a1d4a318189，仅 POST 一次，返回 200 queued；运行编号 be510735-c885-454d-9c37-82d23af785e1，执行 attempt=1。
- 2026-10-24 14:41:12 派发唯一 SDK 请求 df76b589-38ad-4dfb-932d-a200ddd88055，14:42:39 失败收敛。冻结策略最多 1 次、0 元、输出上限 20000 tokens、300 秒；实际使用输入 5618／输出 6085 tokens，其中推理 6083。
- 实际模型 nvidia/nemotron-3.5-super-vl:free；finishReason=stop，JSON 状态 empty，正文 0 字符，未生成结果。SDK 契约为 research-generation-v2，generationStatus=incomplete、schemaAccepted=false，结算 revision=1。
- 兼容层观察到 1951 个可解析分片，正文 0 字符；SDK 层正文同为空。两层推理均 1949 块、19630 字符且摘要一致。该观察点位于 SDK 已解析分片，不能当作原始网络字节，不能由 finish=stop 推断本地 token 截断，也不能声称仅补兼容扩展已解决旧问题。
- 失败诊断 7366 字节、运行诊断 7002 字节、22 个限长样本，符合原 12／8 KiB 边界；未存完整正文、推理、Prompt 或凭据。行摘要 177cd899aae0e17af154191cefde0f64 在最终重建后保持，诊断摘要见机器回执。

## 更新、审计修正与最终保护

- 临时开关均经 infra 的官方 update.sh thesis-ledger，DEV_DATABASE_MODE=check、单次 0 元策略，首错停止监护，不自动重试模型或构建。最终实际开启日志 /tmp/thesis-ledger-g3-profile-enable-1792823891847.log，关闭日志 /tmp/thesis-ledger-g3-profile-close-1792824258563.log，均退出 0。
- 前一次开启后的审计曾将 Docker 的无等号未赋值条目 AI_RESEARCH_POLICY_JSON 错解析成截短键名；只读核实实际进程没有该错误键后修正审计，仅对已赋值变量比较。该假差异期间按原流程关闭过 V2，没有业务调用；随后复用构建缓存继续原授权。未修改应用环境来规避保护。
- 实际开启后，17 张保护表、旧 AI、有效环境与挂载均保持；目标关键模块匹配宿主，SDK 版本 ai@7.0.107／@ai-sdk/openai-compatible@3.0.53／zod@4.4.3，canCreate=true，才提交业务请求。
- 14:47:20 最终核对五个容器健康、V2=false、canCreate=false、原策略恢复；17 张保护表与配置落库后的基线完全相同，原四条 AI 记录保持，新失败记录重建后保持。DSA 四张控制表摘要、来源启停／20 路由／准入、挂载和有效环境均保持。
- 最终计数 runs=5、tools=55、observations=0、invocations=0、invocationFacts=0；未继续其他业务或移动端任务。

## 当前卡点与后续边界

G3 未完成。已停止新增调用，剩余 15 次冻结。下一步待用户确认：仅只读核对本次 G3 冻结路由到 SDK 请求参数的显式兼容扩展透传，给出最小结论；不改代码或配置、不调用模型，不扩搜其他来源或模型。历史成功报告／引用／历史／Web 和诊断证据继续复用。

完整预算、审计、基线、诊断和关闭结果见[机器回执](2026-10-24-g3-explicit-compatibility.json)。

## 前序阶段记录（历史）

以下为当前恢复与复验前的历史检查点，现行状态以上方结论和机器回执为准。

### 当前检查点

用户授权：补齐显式兼容配置，先本地验证，再复验研究、策略编写分析两条原启用用途，通过后继续 G3。用途验证与 G3 共用剩余最多 19 次调用、总费用 0 元；首次失败即停、不自动重试。保留原数据、来源启停与路由，验后关闭 V2 写入。

本地门禁证据复用，修正 PATH 后的同一官方代码更新已通过；目标运行代码、原数据／来源／路由保护及 V2=false 在更新后核对通过。随后仅提交一次两条用途验证请求，但 Docker daemon 与目标 API 失联，无法审计最终结果。实际调用次数、费用和是否保存新配置均待核实，19 次共享预算冻结，不重发请求或继续 G3。本轮从未开启 V2；最后一次运行态确认关闭，当前无法作最终复核。

### 本次写集与已有证据复用

- `ai-provider.contracts.ts`：允许已知兼容扩展，仅接受兼容 Chat Completions 实现。
- `ai-provider-save.service.ts`、`ai-provider-summary.ts`、`ai-provider.service.ts`：待保存扩展参与用途验证、指纹和持久化；省略时保留已存扩展，不根据名称或域名推断。设置解析由现有 Provider 设置模块拥有，主服务调用该解析入口。
- `ai-provider-validation.ts`、`ai-provider-validation-runner.ts`：验证授权新增可选 `stopOnFirstFailure`，选择后首次失败不切换格式或继续其他用途；原有调用保持兼容。
- 新增两份定向测试，覆盖显式配置、原证明失配、两条用途、停用用途／凭据保留、首次失败终止，以及真实本地 SSE 请求中的 `json_schema`、`strict=true`、`require_parameters=true`。
- 原 D6 诊断落盘、D7 报告／引用／历史和来源证据保留；本次尚未取得新配置下的目标运行态或真实 Provider 证据。

### 实际验证

使用宿主 Node 24.18.0，工作目录为主仓。

1. `pnpm --filter @thesis-ledger/schemas build`：退出 0。
2. `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-provider-compatibility-save.test.ts test/ai/ai-openrouter-explicit-profile.integration.test.ts test/ai/ai-provider-verified-save.test.ts test/ai/ai-provider-upstream.test.ts test/ai/ai-sdk-generation-adapter.integration.test.ts`：退出 1；5 个文件中 4 个通过，54 项通过、1 项失败。

首次失败位置：`apps/server/test/ai/ai-provider-upstream.test.ts:85`，旧断言期待已知显式扩展被拒绝。用户确认后仅同步此用例的标题与已知扩展断言，内部 `adapter` 和客户端定价版本的拒绝断言保留。

3. 同一五文件定向命令经确认重跑：退出 0，55 项全部通过。
4. `pnpm --filter @thesis-ledger/schemas test`：退出 1；112 个文件中 111 个通过，1319 项通过、1 项失败。唯一失败为 `test/market-cash-assessment-v3.test.ts:110` 的“DSA实际新规范化输出与主仓合同逐字段一致”，错误 `Test timed out in 5000ms`。本轮未修改该用例、DSA Python 入口或超时设置；未自动重跑，后续 Server 检查未启动。

5. 用户确认仅单独重跑后，原分红用例在 3630ms 通过，未修改 5000ms 门限；其余 1319 项证据按输入复用。同轮 Server AI 包 396 项通过、76 项因未配置隔离数据库跳过。
6. 首次 Server 构建发现本次辅助函数参数及测试夹具的两处严格可选属性类型问题，共 3 条错误；用户确认修正后，定向夹具 3 项通过，Server typecheck／build、Schemas typecheck 和定向 Prettier 均退出 0。
7. 定向 ESLint 首次发现新增夹具未使用形参；用户确认仅修正该 lint 后，夹具 3 项、定向 Prettier／ESLint、边界、workspace 依赖、文件尺寸门禁全部退出 0。尺寸门禁保留 8 条存量提示，没有提高阈值或新增忽略。
8. 从 infra 执行 `./scripts/sync-code.sh thesis-ledger`，本次通过 `rtk proxy env PATH=... bash` 固定 Node 环境。启动预检因命令 PATH 遗漏 Docker CLI 而退出 1，未执行 Docker 操作。只读确认原环境可找到 `/usr/local/bin/docker`，且 Docker Desktop 附带 CLI 均存在可执行；未安装、重启或重跑。

当前待确认处理：用户恢复 Docker 后，先仅只读审计 operationId `fd8116c4-3faa-4f6c-862c-1c3510c74fc3` 的实际调用次数、费用、终态、Provider 保存状态和 V2；不新增调用、不重发验证。

### 历史保护核对（02:21）

2026-10-24 02:21:57（北京时间）只读核对：

- V2=false；本轮没有部署或目标配置写入，原模型调用次数不变，四条旧 AI 记录摘要保持。
- ProviderConfig、AiRoutingSettings、Asset 及其他受保护记录保持。
- 仅有用户此前允许的 AccountLedgerState、CashBalance 业务投影更新，以及 LedgerEvent 130→131 正常追加；原事件行保留。
- DSA 四张控制表摘要保持，包含来源启停、20 条路由及准入；镜像和挂载保持。

本轮 Review 结论：D9 本地完成，D10 目标代码更新及提交前保护通过；两条真实用途结果与最终保护因 Docker 不可达而待审计，G3 未开始，父项未完成。实际预算消耗待核实，不能继续沿用此前 0/19 的计数。

### 本次官方代码更新与真实用途请求

- 用户确认修正 PATH 后，从 infra 执行 `rtk proxy env PATH="/Users/yzin/.volta/bin:/Users/yzin/Library/pnpm:$PATH" bash ./scripts/sync-code.sh thesis-ledger`。默认沙箱因 `ps` 查询权限在锁前退出；依仓库规则保留检查、提升执行权限后，同一官方入口退出 0。Server／Worker 健康，镜像 ID 保持，更新只位于容器可写层。
- 2026-10-24 11:03:01（北京时间）提交前只读核对：17 张受保护表、四条旧 AI 记录、DSA 四张控制表、来源启停／20 条路由／准入、挂载、镜像及非 V2 环境摘要均保持；V2=false。六个运行模块与共享授权合同均匹配宿主构建，目标可解析显式扩展和 `stopOnFirstFailure=true`。
- 正式 `validation-plan` 返回 201，范围精确为原启用的策略编写分析和研究，模型均 `openrouter/free`，预计费用 0 USD；其余四条用途保持停用。计划原最大值为 6 次，实际请求明确 `stopOnFirstFailure=true`、`allowTextFallback=false`，不允许失败后切换格式。
- 2026-10-24 11:05:16（北京时间）仅向 `test-and-save` 提交一次，operationId 为 `fd8116c4-3faa-4f6c-862c-1c3510c74fc3`。之后执行会话句柄不可读取，未重新提交；只读审计被 Docker daemon 不可连接阻断，API 同时为 ECONNREFUSED。
- 真实外部调用次数、实际费用、两条用途终态及是否原子保存新配置尚无法确认；19 次共享预算冻结，不记作 0 次或成功。G3 新业务调用未提交，本轮没有开启 V2，也未安装／重启 Docker 或更换更新入口。
- 后续恢复必须先核对现有请求和目标模块、Provider 状态、V2 与保护基线，不能自动重发验证。机器回执为[显式兼容配置回执](2026-10-24-g3-explicit-compatibility.json)。

