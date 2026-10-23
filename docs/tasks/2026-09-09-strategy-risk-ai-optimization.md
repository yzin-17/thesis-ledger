# 策略驱动风险规则与 AI 多模型优化剩余任务

<a id="priority"></a>
> 排期（2026-10-18）：**P1｜T19 真实探索闭环，真实生成暂停**。等待原模型/行情/预算前置；实际消费 IR09/IR10 指标或 IR02 风险估值的场景先核对对应 [P0 修复](README.md#priority-p0)证据，其他已过 PARITY/T17/T18 不重做，不把全部修复设为所有策略的统一前置。
> [全局优先级与接续规则](README.md#priority-policy)。本次仅调整文档，不改变下列原任务编号、checkbox、验收条件或执行授权。

> 当前入口收敛（2026-10-17）：T00–T16 的实现与既有证据已收口；T17/T18 的本地实现及后继数据库证据保留。策略编辑、两版追溯、配置、结果与正向启动已补验；修复比例单位缺失及提交后切页时点，见[当前运行态证据](evidence/2026-10-17-ui-runtime-closeout.md#策略启动与后台反馈)。当前仅继续 T19 的真实探索业务闭环。
>
> 现行合同：[Spec](../specs/2026-09-09-strategy-risk-ai-optimization.md)。原步骤、测试矩阵、AC 追踪与 PR #35～38 记录保留在[历史实施记录](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md)，旧日期的未完成描述保留为历史；当前未通过条件以本页 T19 和承接验收为准。

## 现在做什么

T17 的新增结构、探索持久化和原子采纳已有后继隔离 PostgreSQL 证据，不重跑未变输入。T18 复用两种模式切换和风险空态的既有证据；文末策略实验交互验收已独立收口。下一步只补 T19 的真实 Provider、行情、探索与采纳闭环；本轮真实生成停止，保留未通过状态。

Canonical U02 的 Run 过滤与旧结果拒绝不能代替新增策略应用事务、预算或真实优化验收。10-17 用户在跨 Task 账本核对后明确停止本轮真实生成，T19 不发送模型、探针或用途请求；不修改数据源或设置默认来绕过前置。原预算和历史记录见 [SDK 当前入口](2026-09-19-vercel-ai-sdk-integration.md)。

## 剩余任务

### T17：从零探索契约、执行与采纳隔离

- [x] T17 本地实现及隔离 PostgreSQL 结构、探索持久化和采纳事务里程碑完成；真实 Provider/业务组合由 T19 验收。

**依赖：**T06–T12、T16。
**覆盖验收：**AC37、AC38、AC39，并回归 AC12–AC24、AC27、AC29。
**涉及范围：**`packages/schemas` 的实验来源与探索空间契约；Server 的隐藏种子、探索提示/输出、候选校验、持久化和采纳事务；必要的增量 migration 与结构门禁。不扩展任意代码执行、多标的组合、外部 Signal Source 或现有 V2 引擎支持矩阵。
**完成条件：**旧的现有策略优化请求保持可解析；探索请求创建 experiment-only v0 种子且不出现在策略库；Provider 返回的完整候选经过探索空间与 V2 双重校验后才可回测；采纳后原子发布用户可见正式 v1。
**验证方式：**Schema 与 Server 定向测试覆盖 existing/discovery 条件字段、旧输入、跨标的/周期、未知 AST、受支持候选、策略列表隔离、幂等采纳和失败回滚；数据库结构变更按 migration matrix 与隔离 PostgreSQL 门禁执行。

已有契约、探索种子与采纳实现及早期本地/目标证据见[原 T17](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md#t17从零探索契约执行与采纳隔离)。后继[策略中心 T03](../archive/tasks/2026-09-17-strategy-center-ux-consolidation.md)记录 2026-09-18 应用全部 13 条 migration、真实隔离数据库 3/3 通过，包含探索三字段/约束与从零采纳为正式 v1；[SDK T5](../archive/tasks/2026-09-19-vercel-ai-sdk-integration-history.md)记录本机 HTTP＋隔离 PostgreSQL 的 discovery 候选持久化。原“隔离数据库待执行”状态由这些证据收口，不以 CI 或当前 Run 过滤单独代替事务证明。

### T18：AI 策略实验信息架构与正式策略通用风险入口

- [x] T18 仓库实现与本地浏览器 smoke 里程碑完成；T17 数据库前置已补齐，完整目标业务及组合交互仍由 T19 验收。

**依赖：**T05、T13、T17。
**覆盖验收：**AC36、AC37、AC40，并回归 AC03、AC04、AC25、AC26。
**涉及范围：**Desktop 策略导航、实验工作区、探索表单、实验摘要和风险应用入口。复用现有 shadcn 组件、TanStack Query 与原子类，不新增页面级 CSS，不改变风险规则的确定性编译语义。
**完成条件：**用户从顶层“AI 策略实验”选择优化/探索模式；探索模式只要求标的、市场、资产类型、周期及共用实验设置；风险区域明确适用于全部正式 V2 策略，手动与 AI 来源无资格差异。
**验证方式：**Desktop 组件测试、类型检查与浏览器 smoke 覆盖两种模式切换、必填校验、创建 payload、正式策略枚举、V1/候选排除、实验结果中文语义、键盘/focus 和无控制台错误。

已有导航、探索表单和风险入口实现，模式切换与风险空态的历史本地浏览器 smoke 见[原 T18](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md#t18ai-策略实验信息架构与正式策略通用风险入口)。不因旧父步骤未勾选而重新实现这些界面。

### T19：探索闭环与目标运行态验收

- [ ] T19 待实施。

**依赖：**T17、T18。
**覆盖验收：**AC36–AC40，并回归 AC13–AC24、AC31、AC32。
**关联门禁：**真实外部 Provider 与在线行情仍受 T14 部署能力条件约束；不可用时必须保留未通过状态，不用 Fixture 替代。
**完成条件：**仓库级契约、Server、Desktop 与边界门禁通过；在具备目标 Provider/行情时完成一次“选择标的 → 探索 → 回测对比 → 封存测试 → 采纳 v1 → 风险规则预览”的真实闭环；环境不具备时准确记录为部署门禁未执行。
**验证方式：**按“定向测试 → 包级 typecheck/build → 仓库边界/复杂度 → 当前 Docker → 浏览器”的成本阶梯执行并记录证据；低层失败时不提前运行高成本门禁。


## 完成与证据边界

T17/T18 仅关闭自身本地与隔离里程碑；T19 仍按上述 AC 和全部必要目标条件收口。原 [必须覆盖的测试矩阵](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md#4-必须覆盖的测试矩阵)、[验收追踪](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md#7-验收追踪)和 [T14 部署条件](../archive/tasks/2026-09-09-strategy-risk-ai-optimization-history.md#t14完成跨模块集成隔离安全与真实小额验收)继续有效；旧接口和环境描述仅适用于记录时点，现行合同以 Spec 为准。

真实外部 AI 的鉴权、模型身份、usage/cost，在线 CN/HK/US Stock/ETF 与 CN NAV，以及完整 Desktop 视觉、键盘、focus 验收仍是独立条件。Fixture、旧 CI 或局部 smoke 不关闭这些门禁。完成后在本 Task 更新结果并链接证据，无需重写历史步骤。

<a id="strategy-parity-acceptance"></a>
## 策略实验执行一致性的剩余验收

本节承接[原 Task](../archive/tasks/2026-09-08-strategy-lab-execution-parity.md)的 T-06 与完整验收对账；现行行为与断言仍按[原 Spec](../specs/2026-09-08-strategy-lab-execution-parity.md)及其有效后继合同判断。原 T-01～T-05、T-07/T-08 的实现、单一路径和一年窗口证据保留，不重做旧实现，不恢复旧 V1 jobs API、客户端行情上传或旧握手。

- [x] PARITY-T06：逐项核对原 AC-01～AC-13 与现行链路，并补齐原 AC-12 的浏览器覆盖。
  - 10-16 结果：JSON 阻断/往返、真实两版创建与历史版编辑/配置、日期预设、已有真实结果、诊断和 1024px 布局通过；比例 0–1 标签/说明已修复，Desktop 843 项及类型、构建、定向检查通过。一次真实 prepare 在上游调用前因 `readyExecutionRouteTarget` 缺失阻断，未新建 Run；仅 AC-13 当前正向启动与提交后反馈保持未通过。逐项适用性和证据见[浏览器记录](evidence/2026-10-16-strategy-parity-browser.md)，不恢复旧 V1、trailing/ATR/risk sizing。
  - 10-17 完成：自建 `600519.SH` 正式 v2 经现有 HiThink 主源准备、真实运行成功，Run `3f3691ae-a025-40a9-8cc6-4ad1ee96ca81`，原 54 份成功结果与原七表摘要不变。修复即时切页及创建失败后重读任务：暂停请求时弹窗关闭且路由为 `/strategy/jobs`，模拟 503 后显示失败并重新 GET 策略/任务，没有新增 Run。失败刷新断言先失败后通过；定向 30 项、Desktop 860 项、类型/构建、定向 ESLint 和边界检查通过，最终正式同步入口退出 0。真实成功与受控失败分别记录，详见[当前证据](evidence/2026-10-17-ui-runtime-closeout.md#策略启动与后台反馈)。旧港股窗口拒绝保留为历史，不再阻塞本节。
  - 前置：使用当前 Canonical/正式 V2 策略和可合法复用的版本、快照及结果；原完成记录只证明各自日期和范围。T19 的外部模型条件不作为本节全部 UI 检查的统一前置。
  - 原 T-06 范围继续保留：相关测试/类型/lint/build/边界证据；本地页面的新建/编辑、历史版本、JSON 防丢失、任务配置、结果、1024px 布局；Console 错误/警告；实际结果与未覆盖边界记录。
  - 已有源码 CI 见[本次通过记录](https://github.com/yzin-17/thesis-ledger/actions/runs/38601670572)，仅覆盖 `main@da002744` 的源码输入；本轮未提交 docs 不宣称已被远端 CI 验证。涉及后续源码变化时再核对受影响检查。
  - 完成条件：全部原 AC 有可追溯的当前实现/验证或明确有效的后继适用依据；未覆盖的 UI、数据或运行条件保持未通过，单一路径不替代完整矩阵。

| 原断言 | 当前承接与核对目的 |
| --- | --- |
| AC-01 | 旧 V1 客户端传行情/载荷已被 [Canonical](../architecture/canonical-runtime.md)及[现行经济/冻结合同](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)取代；当前真实 Run 绑定 v2、请求区间与固定快照，执行/信号/基准均冻结实际 provenance。原基准缺失回归保留，不恢复旧路径。 |
| AC-02～04 | 原 Domain 行为证据保留；[正式 V2](../specs/2026-08-28-unified-backtest-v2.md)现行固定止损、固定止盈、最长持有期及固定金额/权益比例适用。旧 trailing/ATR/risk sizing 已退役，属于被替代范围，不能按未实现重启。 |
| AC-05～08 | [10-16 浏览器证据](evidence/2026-10-16-strategy-parity-browser.md#已通过的当前断言)：JSON 阻断与往返、真实两版创建/历史版编辑回测、固定金额/0–1 比例、默认一年及三个预设通过；旧 ATR 单位随能力退役。 |
| AC-09～10 | 同一记录与[原完成证据](../archive/tasks/2026-09-08-strategy-lab-execution-parity.md)覆盖结果图表/诊断、标题/关闭、可访问名称、中文/空态/终态/未知状态和 1024px；当前成功结果也可读，无终态伪进度条。 |
| AC-11～12 | 原 Domain/Server 与受影响检查复用未变输入；10-16 的实际编辑/配置/结果覆盖加上 10-17 的成功启动及受控失败完成 Web 矩阵。当前 Desktop 860 项及构建通过；不扩大为 Electron 全产品验收。 |
| AC-13 | [10-17 证据](evidence/2026-10-17-ui-runtime-closeout.md#策略启动与后台反馈)：同步校验、即时关闭/切页、真实创建/完成、后台失败提示通过。旧 queue/run 双请求由现行 V3 创建与服务端 Worker 生命周期取代；持久化后的恢复见[Scheduler 进程验收](../archive/tasks/2026-09-05-automation-execution-lease-hardening.md)，不主动重试原有失败任务。 |

原[验收标准](../specs/2026-09-08-strategy-lab-execution-parity.md#验收标准)与[全部历史任务/证据](../archive/tasks/2026-09-08-strategy-lab-execution-parity.md)完整保留。本节是唯一状态入口，已完成交接核对；T19 的真实 AI 组合业务仍未通过，不能由本节关闭。
