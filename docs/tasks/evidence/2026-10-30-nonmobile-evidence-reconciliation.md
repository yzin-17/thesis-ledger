# 剩余非移动端任务的证据对账

## 本次范围与输入

2026-10-30 用户确认启动剩余非移动端任务，先核对现行 Task 和证据，并维持交接的授权及数据保护边界。本记录保存本次对账依据；当前状态、执行叶和完成条件仍由各原 Task 维护，不另建活动计划。

本次对账阶段读取任务索引、八份相关活动 Task、必要 Spec、D58～D60 的仓库证据和私有验收包；只做本地读取、源码指纹比对及文档更新。新增模型请求、外部来源请求、业务请求、运行态检查、Docker 操作、通知、stage 和 commit 均为 0。未建立新的调用额度，未重跑已过测试或浏览器验收。

写前基线保存在 `/tmp/thesis-ledger-nonmobile-audit-20261030/`，包含十份原任务/索引/TODO、三份关联 Spec 及三仓 HEAD/索引指纹。仓库内本报告保留必要结论，临时文件不是验收结论的唯一依据。

当时工作树：主仓 `main` 有 1,717 个变化路径，DSA `yzin` 有 8,470 个，infra `main` 有 124 个；均为接续前已有现场，不作为本轮写集。移动端、Longbridge、RQData 及延期 TODO 的范围沿用交接。

## 已验记录的适用性

| 证据 | 已有事实 | 本次复用边界 |
| --- | --- | --- |
| [D58 正式验收](2026-10-29-g3-formal-acceptance.md) | 公开 `test-and-save` 的有认证 V2 用途先失败且未覆盖配置，后独立验证成功；正式 Qwen 研究失败/成功均保留，成功报告、11 条真实引用、完整 trace、Web 及重建反读通过 | 研究用途测试、正式 Chat JSON Mode 流式及目标报告子场景；不代收所有用途、协议或完整期限 |
| [D59 默认研究](2026-10-29-g3-openrouter-formal-retest.md) | 报告 `e55cf8da-a0db-4617-80ff-350111e804e6`，单次默认 `openrouter/free`，实际 Nvidia 模型；81.568 秒成功，9125/9155 Token、2 条断言、5 条结构化数字及 11 条真实 Tool 绑定；重建后报告/材料/trace 一致 | 当前研究合同的合法结果、显式默认正向消费、Chat 流式 `native_schema` 和实际零费用子场景 |
| [D60 真实 Web](2026-10-30-g3-frontend-closeout.md) | 47 个只读响应，正文、11 来源、刷新、历史、抽屉/完整阅读与实际/模拟隔离均通过；写请求、阻断请求、页面错误及新增模型请求均 0 | 研究 Web 的对应阅读及范围断言；不代收在途重启、长任务故障、其他客户端或整个 UI 父项 |

本次反读 D58 `validation-02-result.json`：HTTP 201，`authMode=api_key`、`credentialConfigured=true`、`health=healthy`；对应输入明确为研究 V2。这证明准确研究用途的测试并保存，不能当作有认证非流式连接的新增结果。

D59 的 `original-validation.json` 中生成 Zod、冻结完整性、数字校验、范围关联及真实 Tool 绑定均为 true；`wire-verification.json` 为单次请求、2029 帧、DONE 完整、无非法 JSON、原始正文/SDK/数据库一致；`persistence-verification.json` 为新进程反读一致、17 份 trace、11 材料且找回未重提。D60 的浏览器断言和运行保护 JSON 与仓库回执一致。

费用口径保持区分：D59 的上游 `usage.cost`、`upstream_inference_cost` 及业务费用实际均为 0；D58 的业务配置估算 0 与网关估算指标分别留存，不能把网关指标当成实际非零账单，也不能以 D59 的零费用代收非零授权/结算。

与 D60 保存的源码摘要比较，本轮检查 Server、Desktop、packages 及根依赖输入共 2,653 项，发现两处后续变化：`apps/desktop/src/features/providers/AiResearchDefaultSettings.tsx`、`apps/desktop/src/features/strategy/security-lot-size.api.ts`。相关 AI/Research Server、Schema 与研究报告阅读源码在该比对中一致。本轮保留两处变化；旧默认设置界面的证据只支持原输入，不作为本次重新验证该组件的证明。没有由源码指纹推断当前容器、配置或业务数据仍与 D60 完全相同。

最近已验运行记录是 D60 的 V2 开启、默认 OpenRouter/free 修订 7；本轮未实时反读。D58 验收结束关闭 V2 的记录属于历史。新闻准入于 2026-10-29 23:31:34 到期，本轮未续期；冻结旧材料可读不代表新生成已具备新闻资格。

## 原任务中的精确映射

### AI 配置与测试后保存

责任入口：[AI 配置 Task](../2026-09-21-ai-provider-model-usage-configuration.md)。

- T2.5 在当前 Task 已勾选完成，索引不再把它列为剩余实现。
- T5.2 与 AC-03：D58 补研究用途的有认证流式生成；有认证非流式连接仍未验。连接测试会实际执行 `sdk.generate`；目录读取成功也不能单独证明认证。下一小叶已写回 T5.2.AUTH-CONNECTION，未执行。
- AC-09/T6：研究流式正向和已完成超时治理按匹配输入复用；一次 81～85 秒成功不能证明 300 秒操作墙钟到期、停顿及取消的全部目标场景。
- AC-10/11/13：D59 补研究零价结算；其他业务、未知/单边零价及真实非零费用仍有独立缺口。
- AC-17～20：显式默认的真实研究创建/冻结/应用路由正向已补；D59 未改变排序或制造目标提交竞争，不扩写成新的排序/并发证明，策略等用途也不由研究代收。
- AC-23/24 与 T6：D58 的公开用途测试并保存和失败不覆盖原配置可以复用，不能继续写成所有真实测试均未验；其他用途、费用、协议及完整期限仍开放。
- AC-27/30：真实报告、失败审计、重建反读和 D60 Web 已补；旧“目标 AiRun 为零”只属于原检查点。其他真实业务及完整运行条件不因此关闭。

### SDK G1 与输出模式

责任入口：[SDK Task](../2026-09-19-vercel-ai-sdk-integration.md)。

研究后继 Spec §5.3 已明确 `ResearchResultV1 | ResearchResultV2`，新功能用 V2、旧 Prompt/旧记录按 V1 独立读取。SDK 与工作台 Spec 只补这一已有后继合同的引用，不变更领域校验，不要求重生成旧报告。

G1 的研究助手结果按 D58/D59 的真实 V2 合同及 D60 Web 复用，支持适用的 AC01/19/25/28/40 子断言。参数优化仍缺完整 changes/reason/evidenceRefs 的实源合法结果；discovery 仍缺精简 DTO、冻结 seed 装配及合法实源结果，AC36 等义务保留。两类都需要具体样本、允许模型及新的当次调用/费用授权，原十次账本和冻结余额不恢复。

协议只按已观测矩阵计：D58 是 Chat 流式 `json_mode`，D59 是 Chat 流式 `native_schema`；Responses 的 JSON Mode/流式用途、JSON Mode 非流式及相应 Token、费用、期限和失败终态差集保持未通过。不把两个成功样本扩成全协议、全输出模式或长期 SLA。

### 工作台与 UI

责任入口：[工作台 Task](../2026-08-25-ai-research-workbench.md)、[UI Task](../2026-09-08-ui-interaction-consistency.md)。

工作台“已保存当前默认及认证下至少一次真实研究，核对模型/Token/来源链”的 smoke 已由 D59/D60 满足，本轮将这一条由未勾选改为完成。它采用现行 V2 后继合同，V1 兼容义务保留。目标任务处于 queued/running 时重启，以及实际外部来源长任务的部分失败/超时/citation 关联仍缺对应证据，两项不变。

UI T4 复用 D60 的真实正文/来源/刷新/历史/模式隔离，剩余按工作台两项及 T2/T19 依赖管理。T2/T3/T4/T5/T6/T8 父项全部保持未勾选，不重新遍历已通过视觉、菜单、键盘或恢复入口。

## 其余原责任的接续条件

以下是本次读取时的缺口记录，后续状态只回写各原 Task：

| 原责任 | 尚缺条件及最小解除输入 |
| --- | --- |
| [策略 T19](../2026-09-09-strategy-risk-ai-optimization.md) | 真实探索→回测对比→封存→采纳→风险预览；需明确样本/市场、模型/预算、行情资格及所用指标/风险修复证据。SDK 合法候选不关闭整个闭环 |
| [摘牌 L3-V](../2026-10-09-history-data-on-demand.md) | 合格摘牌身份、可靠窗口及兼容来源输入和明确接续；扩搜保持停止，不重做普通窗口/适配改造 |
| [研究 T13c/G4b](../2026-10-18-research-evidence-evolution.md) | 合格交易日历/经济价格及可追溯比较/复核路径；需明确标的、历史窗口、权限和请求预算；原 T10～T14、G4a 匹配证据复用 |
| [现金补期通知](../2026-08-30-cash-account-funding-and-transfer.md) | 原记录通知路由为空；需渠道、接收范围及明确发送授权。资金和 Scheduler 已过条件不重做，不配置渠道或发送消息 |
| [研究 T15b/T16a/T16b/G5](../2026-10-18-research-evidence-evolution.md) | G3 已过；仍需真实对照的模型/费用授权和评价输入，再有明确激活决定才能进入生产阶段快照、执行器及目标恢复/启用 |
| D41 独立候选 | 仅按用户明确启动该候选的指令接续；旧 GLM 冻结、双模型及完整响应条件不被 G3 成功代收 |

Longbridge、RQData 和其他明确延期项继续由 [TODO](../../TODO.md)承接，本轮没有新增、移出或启动 TODO。文档对账时未发现已确认的独立代码缺口；随后单次连接揭示的审计缺陷及本地修复见下节。其他剩余门禁不能用重复本地验证关闭。

## 写集、验证及审查

文档对账阶段的写集为四份原 Task、任务索引、三份关联 Spec 及本报告；随后连接审计修复另修改配置 Spec、AI 服务及新增 helper/测试，见下节。研究主 Task、策略、摘牌、现金及 TODO 保持写前内容。

文档验收检查通过：九份写集文档的相对链接/锚点无失效，写前基线至当前的空白检查通过；三仓 HEAD/索引一致，五份未拥有任务/TODO 与写前摘要相同。原 checkbox 仅关闭工作台真实研究 smoke，无重新打开项；新增一条未执行的 AUTH-CONNECTION 子叶，其余未勾选条目只更新差集说明。未执行代码测试、构建、浏览器、运行态或真实服务验收，不能把文档检查当作这些层级的通过。

本次文档对账的规划审查：就绪（Ready，仅本次文档范围），依据和责任边界已明确；唯一产品验收勾选变化是工作台真实研究 smoke。剩余任务保持未完成，该阶段结束时下一叶 AUTH-CONNECTION 待单次授权及只读预检；随后获准的执行结果见下节。请求授权源于已确认交接中的调用/费用边界，`spec-driven-workflow` 不额外创造批准门槛。本次不是总任务最终验收，不归档活动 Task。


<a id="authenticated-connection"></a>

## 获准的单次认证连接与审计缺口

用户随后明确授权使用现有 OpenRouter/free 认证，最多一次非流式连接、费用上限 0、失败即停，仅允许测试自身的健康及审计记录。本次授权 1/1 已执行，未追加调用。

只读预检确认目标双角色仍为镜像 `1654b11a1f4b…`，默认修订 7、V2 开启，OpenRouter/free 已启用、api_key 凭据存在、双向零单价 USD、无模型默认额外参数。私有包为 `.recovery-artifacts/ai-auth-connection-20261030/`。初次本机 GET 误经宿主 HTTP 代理返回 404；改为直连 loopback 后，源码规定的 `/api/v1` 路径与容器内 GET 均为 200。修正仅涉及本地请求方式，没有消耗模型次数。

正式 `POST /api/v1/ai/providers/openrouter/test` 显式提交 `model=openrouter/free`、`testKind=connection`、`budgetAuthorized=false`，独立 requestId 为 `00764775-2bdd-4334-8246-b923465d16ca`。SDK 重试固定 0，未指定 purpose/mode，无 fallback。HTTP 201/healthy，约 9.709 秒，返回 mode 为 json_validated，输入 17、输出 156 Token，费用 status=known、source=provider_reported、amount=0 USD。实际免费路由的上游模型未在该测试接口返回，保留未知，不把请求模型当实际模型。

读回唯一新增健康审计 `161676ee-b1dd-4546-8d21-3c4182977cc5` 时，发现 details 错误标记 native_schema 和 research-generation-v2。源码 `testRecordDetails` 在 purpose 缺省时查找 research 路由，导致连接最小探针借用了配置中的业务标签；真实连接未执行研究合同。该错误审计保持原样，修复范围只限未来事实归因，责任回写 T5.2.CONNECTION-AUDIT。

保护反读：39 张原表中仅 ProviderConfig 的健康写入时间变化，其配置/凭据稳定摘要保持；其他 38 张整表计数和摘要一致，AiRun 15、AiToolCall 165 均不变。ProviderHealth 仅更新本次状态/时间，ProviderHealthCheck 591→592；默认设置、修订与创建能力保持。连接完成后的容器 ID、镜像、挂载及三个运行开关与预检一致；最终文档/索引保护见本节末。认证连接本身通过，完整审计与 T5.2/T6 仍不标记完成。


### 审计修复的本地交付

按既有完整 AC-24、准确合同 AC-36 及补充归因断言 AC-37，在原 Task 拆出 CONNECTION-AUDIT 和独立 CONNECTION-TARGET。Spec/Task 先更新，随后只修改 AI 内的测试审计 helper、原服务接线及服务级测试；没有改协议适配器、领域结果校验或历史审计。

连接成功/失败/取消现在明确记录 json_validated，不套业务用途/合同；用途审计只取匹配且启用的模型/用途/方式。定向用例还捕捉到已保存 V2 用途未把 contractRef 传给实际探针，导致回退 V1，已补准确透传；原公开 test-and-save 的已验结果不受该遗漏影响。存量服务 975→945 行，新职责归 AI 测试审计模块，无跨 feature 依赖或数据库变更。

验证与失败记录：新增测试先复现真实连接审计错标；初始取消信号及价格 fixture 不完整已修正，随后捕获 V2 合同丢失。首次合同接线落在价格错误响应分支，定向用例仍失败，已移到真实探针调用并复验。最终 5 项成功/失败/取消及两种用途模式通过；9 文件/93 项相关 Provider/SDK 回归通过。Server typecheck、build、写集 ESLint/Prettier 与边界检查通过。最初 prefer-const 已修正；直接 node 的 Volta 24 库存缺失，改用现有 pnpm exec node 26.13.0 完成只读边界检查，未安装 Node、依赖或修改锁文件。目标 Node/模块验收仍归 CONNECTION-TARGET。

实际命令为 `pnpm --filter @thesis-ledger/server exec vitest run` 加对应九份 AI 测试（完整 argv 保存在私有 provider-regression.json），独立定向文件为 test/ai/ai-provider-test-audit.test.ts；包级 `typecheck`、`build`，三份写集的 ESLint/Prettier，以及 `pnpm exec node scripts/check-boundaries.mjs`。构建后仅测试文件改为 const/格式调整，复验定向和类型；生产源码输入未再变化，不重复构建。

本地交付通过；目标尚未同步，原错误审计不回写，模型本次仍为 1/1、无剩余额度。目标同步已作为明确范围请求授权，等待期间只维护文档和保护核对。


### 本次最终核对与接续

十份文档的链接/锚点及全部十三份文档/源码写集的相对基线空白检查通过；三仓 HEAD/索引未变，未拥有的五份原任务/TODO 与写前内容一致。本轮只新增两项完成标记：工作台真实研究 smoke、CONNECTION-AUDIT 本地修复；未撤销旧通过项。认证叶完整审计、目标同步、完整 T5.2/T6 与其他非移动端责任继续开放。

代码与本地证据的一致性审查通过；目标运行态的修复验收尚未执行，不能把 93 项回归当成已部署。当前只等待 CONNECTION-TARGET 的正式快更/重启授权；后续按原优先级接续，原模型额度仍无可用余额，其他样本、来源资格、通知和激活条件保持。
