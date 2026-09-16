# 组合估值按需查询与 ETF 行情上游保护 Spec

> 任务标识：`PORTFOLIO-VALUATION-DEMAND-GUARD-V1`
> 日期：2026-09-14
> 状态：功能、运行态与 T4 `AccountDataPage` 行为保持型拆分验收完成（最终一致性 Review 仍有非阻塞提交范围问题）
> 对应任务：[`../tasks/2026-09-14-portfolio-valuation-demand-guard.md`](../tasks/2026-09-14-portfolio-valuation-demand-guard.md)

## 背景与问题

组合估值需要根据持仓数量、成本、现金、已实现收益和市场价格生成账户或组合读模型。当前 ETF 估值在产品侧请求一个标的时，DSA 的 AKShare 适配器可能调用 `ak.fund_etf_spot_em()` 拉取全市场 ETF 快照。2026-09-14 的目标开发运行态记录显示，一次 `510300.SH` 估值触发了 1611 只 ETF 的全市场请求，上游耗时 20.18 秒，ThesisLedger Server 对应请求耗时 23.286 秒。

同一时间窗口还出现两条耗时完全相同的组合估值请求。当前 Desktop 在路由根部常驻全组合估值查询，账户页另有选中账户估值查询；持仓保存 mutation 会失效整个 portfolio query root，保存成功回调又执行全局 `refresh()`。因此一次账户内持仓快照保存会同时放大组合级和账户级查询需求。

现有 [市场数据缓存与 Provider 路由交互 Spec](2026-09-08-market-data-cache-and-provider-routing.md) 已定义实时行情 15 秒 fresh cache 和 24 小时 last-valid cache，但没有约束“单标的 Data Contract 请求不得由全市场抓取实现”，也没有让分布式锁租约覆盖真实 Provider 延迟。本 Spec 在不改变 Ledger 事实源和组合估值业务口径的前提下，补充交互式行情读取、上游请求预算和按需查询契约。

## 目标

1. 将 DSA `REALTIME_QUOTE` 的单标的请求语义固化为不允许隐式全市场抓取的安全不变量。
2. 为 ETF 单标的行情建立跨请求、跨 Server 实例且对 DSA 重启安全的频率控制、并发合并、重试预算和失败收敛规则，降低上游限流或封禁风险。
3. 保留明确的 fresh、stale、last-valid、unavailable 和 Provider provenance，不用旧值伪装实时行情。
4. 让 Desktop 只在实际消费组合汇总的路由查询全组合估值；账户页只查询选中账户，并对持仓/现金/Ledger 变更执行精确失效。
5. 消除 mutation 自身失效与页面 `onSaved -> refresh()` 叠加造成的重复请求，并用可观察的请求次数验收交互。
6. 为组合估值、Server 行情读取和 DSA Provider 调用增加可关联的阶段耗时与请求来源证据。
7. 收敛 `AccountDataPage` 的职责：页面只保留具体账户业务编排，账户选择状态机、选择器视图和“全部账户”只读汇总由边界明确的模块负责。

## 非目标

- 不通过高频定时预热、页面轮询或保存后强制刷新全市场数据解决冷缓存延迟。
- 不在本 Spec 中新增或启用全市场 ETF 定时采集任务；全市场能力如有其他合法批量消费者，应继续通过独立入口和独立验收管理。
- 不让浏览器直连 DSA，不把 Provider 凭证、Provider-specific 实现或原始响应移入 ThesisLedger 主仓。
- 不改变 Ledger 是持仓与现金事实源、Position 是投影的既有领域边界。
- 不改变组合收益、现金物化、FX 合并或场外基金 NAV 的业务口径。
- 不在缺少测量证据时提前重构 realized PnL、LedgerEvent 物化或 FX 读取；这些只作为后续性能候选。
- 不承诺第三方 Provider 永不封禁；本 Spec 只建立可验证的请求抑制、预算和失败收敛机制。

## 现状与约束

### 已直接确认的代码与运行态事实

- `GET /api/v1/portfolio/valuation` 会经 `PortfolioService.value()`、`valuePortfolioPosition()` 和 `MarketService.getQuote()` 同步等待 DSA Quote。
- ThesisLedger 实时行情 Redis fresh cache 为 15 秒，last-valid 为 24 小时；进程内 `singleFlight` 只能合并单个 Server 进程内的同键请求。
- 当前 Redis 分布式锁租约为 6 秒，等待者最多轮询 6 秒；未获得锁后会直接执行上游工作。该租约短于已观察到的 20.18 秒 Provider 调用。
- DSA AKShare ETF 全市场缓存 TTL 为 1200 秒，efinance 单标的与 ETF 全市场缓存 TTL 为 600 秒；这些缓存目前属于进程内状态。
- efinance 代码已存在 `get_quote_snapshot(symbol)` 单标的路径；其历史运行态曾成功，但实施时仍必须重新验证当前依赖版本和真实返回字段。
- DSA/Fetcher 与 Server 客户端存在多层 retry/fallback。实际成功样本没有重试，但失败时存在放大外部请求的风险。
- `/accounts` 路由既消费选中账户估值，也因 `AppRoutes` 根部 hook 常驻而触发全组合估值；持仓保存同时存在 portfolio root invalidation 和父级全局 refresh。
- 当前工作树包含用户已有的账户永久删除、Desktop、Mobile、Server 和 Schema 未提交修改；实施必须避开、兼容并保留这些修改。

### 跨仓职责

- `thesis-ledger` 拥有 Portfolio 估值编排、产品级 Redis 缓存与锁、Desktop TanStack Query 生命周期及可观察 HTTP 行为。
- `daily-stock-analysis` 拥有 Provider Adapter、单标的/全市场访问形态、Provider 频率控制、熔断、Effective Policy 和真实上游调用。
- `thesis-ledger-infra` 拥有 Compose 拓扑、超时配置、镜像组合及目标开发运行态验收。
- 主仓 Spec 只规定跨仓可验证契约，不复制 DSA Provider 实现细节；具体实现和测试仍写入各自仓库。

## 设计方案

### 1. 单标的 Quote 契约

`GET /api/v1/thesis-ledger/market/quote?symbol=<symbol>` 与 `REALTIME_QUOTE` 请求只表达一个标准化标的。其稳定不变量为：

- 只允许执行单标的 Adapter；
- 不得调用 `fund_etf_spot_em()`、`get_realtime_quotes(['ETF'])` 或其他全市场/分页全量接口；
- 单标的主 Provider 不覆盖、熔断、限流或失败时，只能尝试下一个满足单标的访问形态的 Provider；
- 没有可用单标的 Provider 时返回结构化 `unavailable`，由 ThesisLedger 决定是否使用 last-valid；不得为提高成功率隐式退回全市场抓取。

DSA 的 Provider capability 必须反映安全可执行能力。若 AKShare 当前 ETF Quote Adapter 只能通过全市场快照实现，则它不能作为 `REALTIME_QUOTE / ETF` 单标的路由候选。efinance 单标的 snapshot 可以作为候选，但必须通过当前依赖版本的契约测试和一次受控真实 Provider 验收后，才能声明目标运行态可用。

如果实施或目标运行态验收确认当前可用 Provider 均无法提供满足 Contract 的 ETF 单标的 Quote，T1/I1 必须立即停止受影响工作并向用户请示。未取得用户决定前，不得恢复全市场 fallback、擅自接入新的外部 Provider、改变 Quote 数据语义、放宽 unavailable/fail-closed 规则，或用高频预热掩盖能力缺失。

既有 Desired Policy 仍保留历史意图和 revision；升级后 DSA 重新计算 Effective Policy。已保存但不再满足单标的约束的 Provider 不进入本能力的执行序列，并通过现有 policy/health/provenance 状态暴露降级，不静默伪装为已执行主 Provider。

### 2. 上游请求预算与防封禁规则

DSA 为 `provider + capability + instrumentType + symbol` 维护上游请求资格：

- ETF 单标的默认最小上游刷新间隔为 600 秒，复用当前 efinance 单标的缓存边界；允许通过受控配置延长，不允许在缺少新的上游证据和 Spec 决策时缩短。
- 显式刷新只绕过 ThesisLedger 产品 fresh cache，不绕过 DSA 的最小请求间隔、熔断或限流保护。
- 每个 ETF 单标的逻辑请求对每个候选 Provider 最多执行一次真实上游调用；超时、限流或响应不可解析后不得在 Fetcher、Provider runtime 和 Server 三层叠加重放同一 Provider。
- Provider fallback 只在不同的合格单标的 Provider 之间发生；每个候选各自受独立请求预算约束。
- 最近尝试时间、下一次允许时间和限流/熔断状态必须在 DSA 自有持久状态中跨进程重启保留。重启后缓存缺失但尚未到允许时间时，应返回受保护的 unavailable，而不是立即重新打上游。
- 当前目标拓扑仍是一个 DSA 实例；多 DSA 实例不在本 Spec 的支持声明内。目标拓扑变化前必须补充共享 Provider 配额协调设计。

随机 User-Agent 只有在确实写入请求头并由测试可观察时才算防护；仅生成或记录字符串不能作为验收证据。日志不得记录凭证、Cookie 或完整敏感响应体。

### 3. Server 缓存、锁与失败收敛

`MarketService` 继续作为 Portfolio 的深模块，向调用方隐藏 Redis、DSA、Provider 和锁细节。`PortfolioMarketReader` 接口不暴露 Provider-specific 参数。

ThesisLedger 到 DSA 属于远程但自有的 seam：生产环境由 `DsaClient` HTTP Adapter 接入，Server 测试通过内存 Adapter 验证同一接口。DSA 到第三方 Provider 属于真实外部 seam，确定性测试使用可计数的 mock Adapter，并只通过 Provider runtime 的对外接口断言行为，不让 Portfolio 或 Desktop 测试穿透到 Provider 实现。

- 保留实时行情 15 秒 fresh cache 和 24 小时 last-valid 语义；变更这些产品级时间窗不属于本 Spec。
- 同一进程继续使用 single-flight；跨 Server 实例使用带 owner token 的 Redis 锁。
- 锁租约必须由 DSA Quote 超时预算和安全余量派生，不得继续使用短于请求预算的固定 6 秒值；长请求需要可靠续租或足以覆盖单次请求的租约。
- 未获得锁的等待者在 owner 完成或租约状态变化后必须重新读取 fresh/last-valid cache。等待预算耗尽时返回 stale 或 unavailable，不得无条件再次执行上游工作。
- Quote 调用在 DSA 超时后不得由 `DsaClient` 自动重放同一个可能仍在执行的外部请求。
- 上游失败、请求资格未到或 circuit open 时，存在 last-valid 才能返回 `stale=true`、`servedFromCache=true` 的旧值；没有旧值时保持 unavailable/null，不使用零值。

### 4. Desktop 按需查询与精确失效

将账户目录查询与全组合估值查询分开管理：

- 账户目录可以由多个路由共享。
- 全组合估值只在实际读取组合汇总的路由或视图状态启用；`/accounts` 不因根布局常驻 hook 自动请求全组合估值。
- `/accounts` 选择具体且存在的账户时，只启用 `valuation(mode, accountId)`；选择“全部账户”时，只启用 `valuation(mode, all)`。两种估值查询互斥，不能同时 active。
- `/accounts?accountId=all` 表示“全部账户”选择；该视图按当前 `PortfolioMode` 展示只读组合汇总和持仓明细，新增、编辑、删除等账户内操作仍要求先选择具体账户。
- 离开消费路由后，未激活的查询可以保留在 TanStack Query cache，但不得因无关 mutation 立即 refetch。

mutation 成功后的 query orchestration 只能有一个责任点。持仓、现金或 Ledger 变更根据服务端返回的影响范围执行精确失效：

| 交互事件 | 立即失效并在有活跃消费者时重取 | 无活跃消费者时仅标记 stale、进入对应页面后再取 |
| --- | --- | --- |
| `/accounts` 新增或编辑持仓快照 | 受影响账户的 valuation、Ledger events、audit；若“全部账户”或其他组合汇总视图 active，则重取对应 mode 的全组合 valuation | 对应 mode 的全组合 valuation |
| 持仓身份从账户 A 移到账户 B | A、B 两个账户的 valuation、Ledger events、audit；若组合汇总视图 active，则重取全组合 valuation | 对应 mode 的全组合 valuation |
| 删除或清空持仓 | 受影响账户的 valuation、Ledger events、audit；若组合汇总视图 active，则重取全组合 valuation | 对应 mode 的全组合 valuation |
| 保存现金余额或现金纠正 | 受影响账户的 valuation、Ledger events、audit/reconciliation；若组合汇总视图 active，则重取全组合 valuation | 对应 mode 的全组合 valuation |
| 创建、停用或永久删除账户 | accounts；删除前后受影响的活动账户查询；若组合汇总视图 active，则重取全组合 valuation | 对应 mode 的全组合 valuation |

持仓保存完成后，`/accounts` 选择具体账户时，网络层允许最多一次 selected-account valuation 请求且 all-account valuation 为 0；选择“全部账户”时，允许最多一次 all-account valuation 请求且 selected-account valuation 为 0。任何选择状态都不得执行 `invalidate root + onSaved refresh + explicit refetch` 叠加。编辑允许变更账户或标的身份时，mutation 结果或调用上下文必须包含新旧影响范围，不能只按新账户失效。

`t=Date.now()` 与 `no-store` 不参与 TanStack Query 身份和业务失效；在 query 生命周期由 TanStack Query 统一管理后移除时间戳参数。是否保留 HTTP `no-store` 由现有安全缓存策略决定，不将其作为修复重复请求的手段。

#### `AccountDataPage` 模块边界

后续拆分必须保持现有 URL、DOM 层级、文案、账户选择、未保存草稿确认和查询互斥行为，不借机重设计页面或改变 mutation 失效契约：

- 账户选择状态机负责解析 `accountId`、`tab`、`entry`、`setup`，处理冷深链、账户目录 pending/error/empty、sessionStorage 记忆及导航更新；对页面只暴露当前选择和少量语义化动作。
- 账户选择器作为无数据请求的展示组件，只接收账户列表、当前账户和选择/管理回调，不拥有路由或查询生命周期。
- “全部账户”视图拥有且只拥有 active all-account valuation 的读取及 loading/error/summary/table 展示；具体账户页不得同时启用该查询。
- `AccountDataPage` 保留具体账户的 Ledger、audit、reconciliation、持仓/现金编辑和 overlay 编排。本轮不强行抽取会形成大参数袋的薄包装组件。
- `cashSaveImpact`、`clearPositionsImpact`、`removePositionImpact` 等单账户 impact helper 保留语义化入口；相同返回形状代表它们当前共享同一个失效契约，不视为需要合并调用点的功能缺陷。

### 5. 可观察性

同一 trace 下至少记录以下阶段的耗时、缓存结果和调用原因：

- Portfolio：positions/account currencies、realized PnL、position valuation、Ledger cash materialization、FX、aggregation；
- MarketService：fresh hit、lock wait、DSA call、last-valid fallback；
- DSA：Provider 候选、是否真实上游调用、资格拒绝/circuit、单标的调用耗时和 fallback；
- Desktop：通过测试或浏览器 Network 证据记录一次交互触发的 valuation 请求数量和 query key，不把前端脚本发起位置当作耗时来源。

指标与日志必须保留 `traceId`、标准化 symbol、Provider、cache/freshness、duration 和稳定错误码；不得记录凭证或敏感上游响应。

## 对外行为或接口变化

- 现有 Portfolio 与 DSA Quote URL、成功响应 Schema 保持兼容，不要求新增浏览器可见参数。
- DSA `REALTIME_QUOTE / ETF` 的可执行 Provider 集合可能收窄：只保留经验证的单标的 Adapter。
- 既有 Provider policy revision 不删除；Effective Policy 可能因单标的安全约束进入降级或 unavailable，并通过现有状态返回。
- Desktop query key 继续以 mode 和可选 accountId 区分；变更的是启用条件和 mutation 失效范围，不改变页面 URL。
- Quote 的 stale、servedFromCache、provider、upstreamSource 和时间来源必须继续保持真实语义。

## 数据、状态或兼容性影响

- ThesisLedger 主数据库不新增或修改业务表。
- Redis 增加或调整行情锁/等待状态键；这些是可丢弃临时状态，不作为业务事实源。
- DSA 自有持久状态需要保存 Provider 请求资格/冷却信息；具体 Schema 与非破坏升级由 DSA 仓库负责，不写入主仓 Prisma。
- 旧 Desktop 可以继续调用现有估值接口；部署顺序应为 DSA 单标的保护完成并验证后，再部署 Server 锁与 retry 修复，最后部署 Desktop 查询治理。
- DSA 或 Server 回滚时不得删除 PostgreSQL、Redis 或 DSA 数据卷；旧版本不能读取新增可选状态时，应忽略或通过 DSA 自有兼容迁移处理。

## 测试策略

### 关键可观察行为

- 单个 ETF Quote 在 fresh/进程缓存均为空时，最多调用一个合格单标的 Adapter，不调用任何全市场 ETF 函数。
- 主单标的 Provider 失败时，只尝试下一合格单标的 Provider；全部失败时返回 unavailable 或 Server last-valid stale。
- 同一 symbol 的并发请求在单进程和两个 Server 实例模拟中只产生一次 DSA 调用；等待者不会在 6 秒后自行调用上游。
- DSA 重启后仍处于最小请求间隔时，不进行新的上游调用；显式刷新也不能突破保护。
- `/accounts` 选择具体账户并保存持仓快照后，全组合 valuation 请求数为 0，选中账户 valuation 请求数不超过 1；选择“全部账户”后只请求一次全组合 valuation，不再请求单账户 valuation。
- 所有缓存、失败和 fallback 响应保留真实 freshness、Provider 和时间来源。

### 测试层级与证据边界

1. DSA 单元/契约测试证明 Adapter 访问形态、Provider 资格、持久请求预算、fallback 和 unavailable 语义；fixture 不能证明真实 Provider 当前可用。
2. Server 市场模块测试证明锁租约、等待后重读缓存、单次 DSA 尝试、stale/unavailable 和阶段日志。
3. Desktop 组件/查询测试证明路由启用条件、精确失效和请求次数；mock request 不能证明部署后的跨服务行为。
4. 目标 Docker 集成门禁证明当前镜像、Redis、DSA 和 Server 的冷/热缓存闭环；真实 Provider 只执行受控最小次数。
5. 浏览器门禁证明真实 `/accounts` 保存路径的 Network 次数、页面结果和错误状态。

### 可复用或需要新增的测试入口

- 复用 DSA `test_thesis_ledger_provider_runtime.py`、`test_efinance_realtime_quote.py` 和 Control Contract 测试；通过单标的与 universe mock Adapter 的调用计数新增禁止 universe Adapter、持久冷却和重启后保护测试。
- 复用 Server `apps/server/test/market/services.test.ts` 与 portfolio 测试；新增双实例锁、超时后不重放和阶段耗时断言。
- 复用 Desktop portfolio/account-data 测试；新增 route-aware query、mutation 精确失效和 Network 调用计数测试。
- 真实 Provider 验收只覆盖一个代表性 CN ETF、单次允许窗口和一次受控失败/冷却场景，不扩展成高频压力测试。

### 必要集成与真实运行态门禁

- DSA + Server 门禁：目标 Compose 中确认单 ETF 冷请求不出现全市场函数日志，并验证并发请求合并、last-valid fallback 和重启后的请求预算。
- Desktop 门禁：在 `/accounts` 保存、编辑、删除和清空一个持仓快照，确认每次交互的 query key 与 Network 请求数量符合本 Spec。
- 只有两个门禁都通过，才能声明“上游保护与按需查询”在目标开发运行态完成；单元测试、build 或 healthy 容器不能替代。

## 风险与备选方案

- efinance 单标的 snapshot 仍可能被限流、字段缺失或返回无效内容。安全默认是 stale/unavailable，不恢复全市场 fallback。
- 将 AKShare 从 ETF 单标的 Effective Policy 中排除会改变用户看到的主备执行结果，但继续保留一个不符合请求形态的“主 Provider”会制造不可控延迟和封禁风险，因此不采用。
- 仅提高 Server 锁 TTL 可以减少重复请求，但不能消除单标的请求拉全市场，也不能跨 DSA 重启保护上游，因此不能作为完整方案。
- 仅把 Server fresh TTL 提高到 600 秒会降低调用频率，但会把产品 freshness 与 Provider 请求预算混为一体，因此不采用；两者分别管理并保留真实时间来源。
- 若后续确有全市场批量采集需求，应另建 Spec，定义调用者、市场时段、最小间隔、共享缓存、故障恢复和运行门禁；本 Spec 不预先创建该基础设施。

## 未决问题

### Blocking

- 条件性门禁：如果 T1 或 I1 确认当前依赖与目标运行态没有任何可用的 ETF 单标的 Quote Adapter，必须向用户说明已验证的 Provider、失败证据、仍可行的备选路线及各自风险，并等待用户选择。该条件实际发生前不阻塞 T1 的只读盘点和确定性实现；一旦发生，T1/I1 及所有依赖其成功能力的后续工作停止。

### Non-blocking

- 默认 600 秒最小上游刷新间隔沿用当前 efinance 单标的缓存边界。若未来需要更高实时性，必须先取得上游限制证据并更新本 Spec；在此之前允许配置延长，不允许缩短。
- 当前只声明单 DSA 实例目标拓扑。增加 DSA 副本属于后续容量设计，不影响当前任务实施，但上线前必须确认 infra 未改变该拓扑。

## 验收标准

- AC1：DSA `REALTIME_QUOTE / ETF` 单标的路径在成功、失败、fallback、显式刷新和冷缓存场景均不调用全市场 ETF 接口；无合格单标的 Provider 时返回结构化 unavailable。
- AC2：ETF 单标的真实上游调用默认按 `provider + capability + instrumentType + symbol` 至少间隔 600 秒；该资格在 DSA 重启后仍有效，显式刷新不能绕过。
- AC3：每个 ETF 单标的逻辑请求对每个合格 Provider 最多执行一次上游调用；Server 超时不自动重放仍可能执行中的 Quote，请求失败不会在多层 retry 中放大。
- AC4：同 symbol 并发请求在单进程和多 Server 实例场景只产生一次 DSA 调用；未获锁的等待者重新读取缓存，等待结束后不会无条件执行上游工作。
- AC5：fresh、last-valid、stale、unavailable、provider、upstreamSource 和时间来源保持真实；旧值不伪装实时值，缺失事实不填零。
- AC6：`/accounts` 不常驻请求全组合估值；选择具体账户时 all-account valuation 为 0、selected-account valuation 不超过 1；选择“全部账户”时 all-account valuation 不超过 1、selected-account valuation 为 0；两套查询始终互斥。
- AC7：持仓、现金、Ledger 与账户变更按新旧影响范围精确失效账户 valuation、events、audit/reconciliation；全组合 valuation 有活跃消费者时最多重取一次、无活跃消费者时仅标记 stale；不存在 root invalidation 与父级 refresh 双轨。
- AC8：Portfolio、MarketService、DSA 和 Desktop 请求证据可通过同一 trace 关联，能够区分数据库、锁等待、DSA、Provider、缓存和客户端触发次数，不记录敏感值。
- AC9：DSA、Server、Desktop 的定向测试和包级检查通过；目标 Docker 冷/热/并发/重启门禁及浏览器保存路径 Network 门禁通过，且证据明确区分 fixture、构建、真实 Provider 与目标运行态。
- AC10：若确认没有可用的 ETF 单标的 Quote Adapter，实施在引入全市场 fallback、新 Provider、语义降级或高频预热前停止，并向用户提交证据与备选路线请示；未获决定时不继续受影响任务。
- AC11：`AccountDataPage` 拆分后不再直接拥有账户选择状态机、选择器 JSX 和 all-account valuation 查询；具体账户与“全部账户”的 URL、草稿确认、loading/error、查询互斥、只读汇总和账户管理可见性保持不变，定向 UI/查询测试、Desktop typecheck 与 build 通过。
