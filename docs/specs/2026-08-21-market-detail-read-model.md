# 持仓行情详情共享读模型与按能力加载优化规格

## 问题陈述

当前 Desktop 的持仓列表“查看”操作会直接并行调用 quote、日线、多个指标和筹码接口。接口数量多，开发环境的 React StrictMode 还会放大重复请求；ETF 会请求只支持股票的筹码摘要，所有标的都会请求当前 Contract V1 不支持的 ATR，导致 422、503 和长期加载状态混在一起。

同时，当前弹窗名称 `Position Detail` 混淆了两个领域：`Position` 负责账户下的数量和成本，quote、bars、指标、筹码和基金净值属于市场数据。未来 Mobile 需要复用同一套行情能力，但现有接口组合和客户端硬编码规则不适合作为共享能力层。

## 解决方案

在 ThesisLedger Server 增加客户端无关的 Market Detail Read Model，提供统一的只读聚合出口：

```text
GET /api/v1/market/:symbol/detail
```

Server 根据已确认的资产类型、Instrument Catalog 和 Effective Provider Policy 判定可用能力，只调用适用的底层能力，并以分段状态返回部分成功结果。Desktop 改为消费该读模型，负责请求去重、生命周期管理、分段展示和局部重试；Mobile 本阶段不新增详情页面，只保持共享 API 和现有只读 Portfolio/Risk 行为兼容。

本阶段保持 DSA Contract V1 兼容，不新增 DSA 批量详情接口，也不把 Indicator 计算迁移到 Desktop 或 ThesisLedger Server。MA、MACD、RSI 仍由 DSA 基于统一 `DAILY_BAR` 派生。

## 用户故事

1. 作为 Desktop 投资者，我希望点击“行情详情”后看到明确的持仓行情详情，而不是含义不清的“查看”弹窗。
2. 作为持有股票的投资者，我希望在同一个详情中看到实时行情、最近日线、MA/MACD/RSI 和可用的筹码摘要。
3. 作为持有 ETF 的投资者，我希望看到 ETF 支持的行情和技术指标，同时不触发不支持的筹码接口。
4. 作为持有场外基金的投资者，我希望看到最新单位净值和最近 NAV history，而不是证券实时价、K 线或筹码数据。
5. 作为投资者，我希望持仓数量和成本立即显示，不必等待外部行情数据返回。
6. 作为投资者，我希望一个非关键模块失败时，其他已成功的行情模块仍然可见。
7. 作为投资者，我希望能区分“当前标的不支持”“当前没有数据”“数据暂时不可用”和“数据陈旧”。
8. 作为投资者，我希望陈旧数据仍可查看，并且能看到明确的陈旧标记和来源信息。
9. 作为投资者，我希望只重试失败的模块，而不是重新请求所有已经成功的数据。
10. 作为投资者，我希望主动刷新时可以尝试获取更新数据，但上游失败时仍能保留可解释的陈旧回退结果。
11. 作为投资者，我希望打开同一详情不会因为开发环境 StrictMode 或快速切换标的而产生重复的有效请求。
12. 作为投资者，我希望不支持的模块默认不占据详情页空间，但可以在数据可用性或诊断区域了解原因。
13. 作为投资者，我希望遇到暂时不可用时看到可读提示，而不是 Provider 原始异常、内部堆栈或敏感信息。
14. 作为投资者，我希望错误提示带有可供支持人员定位的稳定诊断标识。
15. 作为未来的 Mobile 用户，我希望 Mobile 可以复用与 Desktop 相同的行情读模型，而不需要复制资产类型和 Provider 能力规则。
16. 作为未来的 AI 或策略系统调用方，我希望能够消费结构化的行情能力状态，而不是根据缺失字段猜测数据是否可用。
17. 作为系统维护者，我希望未知资产类型只进行只读解析和安全降级，不在查看详情过程中静默修改 Asset 身份。
18. 作为旧客户端维护者，我希望既有 quote、bars、indicator、chip 和 fund NAV Contract V1 路径继续可用，不因新读模型发布而破坏兼容性。
19. 作为测试人员，我希望能在 fixture 和 fault injection 环境中稳定复现 ready、stale、empty、unsupported、unavailable 和部分成功状态。
20. 作为发布维护者，我希望新 Server 接口可以先增量发布，Desktop 回滚到旧版本时仍可继续使用原有接口。

## 实施决策

### 领域边界与资产能力

- `Position` 只表达账户、资产、数量、成本和盈亏基础数据；Market Detail 只表达市场数据。
- 用户界面统一使用“持仓行情详情”；不继续使用 `Position Detail` 作为市场数据弹窗名称。
- 能力矩阵由 Server 权威计算，不由 Desktop 或 Mobile 复制 Provider 路由规则。
- STOCK 支持 quote、日线、MA/MACD/RSI 和 `CHIP_SUMMARY`。
- ETF 支持 quote、日线、MA/MACD/RSI，不支持 `CHIP_SUMMARY`。
- MUTUAL_FUND 支持最新 Fund NAV 和 NAV history，不请求证券 quote、日线指标或筹码。
- ATR 不进入当前正式能力枚举。
- 未知资产类型先通过已确认的 Asset/Instrument 身份和本地目录只读解析；仍无法确认时跳过类型相关能力，不自动写回身份。

### 共享读模型接口

- 新增 `GET /api/v1/market/:symbol/detail`，保留现有底层市场接口。
- `include` 采用细粒度枚举：`quote`、`bars`、`indicator:MA`、`indicator:MACD`、`indicator:RSI`、`chip`、`fund-nav`、`fund-nav-history`。
- 未传 `include` 时，默认返回当前资产类型的全部已支持能力；不把不支持能力发给 Provider。该规则是最终确认的方案决策，区别于最初只默认加载 quote/bars 的草案。
- `barsLimit` 和 `navLimit` 默认 30，最大 90；指标内部可获取所需的更长输入，但详情响应只返回受限展示数据。
- `refresh=1` 只表示用户主动刷新；服务端绕过 fresh cache 尝试更新，但仍允许既定的 stale fallback。
- `include` 含非法能力名称或参数超限时返回 400；能力名称合法但当前标的不支持时，整体请求仍返回 200，该 section 状态为 `unsupported`，且不调用 Provider。
- 合法请求使用分段结果，不因为单一 section 失败而返回整体错误。

共享响应保留现有 Quote、Bar、Indicator、Chip 和 Fund NAV 的数据形状，并为每个 section 增加独立状态：

```text
ready | stale | empty | unsupported | unavailable
```

每个失败 section 可携带稳定错误码、用户可读 message 和 request/diagnostic ID；不返回 Provider 原始异常或凭证信息。`loading`、请求取消和重试中属于客户端状态，不进入 Server wire shape。

指标 section 同时保留逐项 MA/MACD/RSI 状态和共同的日线依赖状态。共同 `DAILY_BAR` 输入失败时，界面只显示一条共同依赖提示，避免将同一故障渲染为三条重复错误。

### Server 编排与缓存

- Server 负责规范化 symbol、读取资产类型、计算能力矩阵、校验 include、聚合底层数据和归一化错误。
- 使用既有产品缓存、single-flight、Redis lock、fresh/last-valid/stale 语义；不由客户端通过时间戳强制绕过缓存。
- 详情接口内部按 section 独立编排，并使用有界的并发与现有 Provider fallback 规则。
- Indicator 继续经由 DSA Contract V1 从统一 `DAILY_BAR` 派生，Server 不直接访问 DSA native Provider manager。
- 本阶段不要求减少所有 Server → DSA 的独立 Contract 路径调用；本阶段验收重点是客户端请求收敛、无效能力不调用、Server 编排和用户体验。内部 Provider 调用次数另行通过 DSA gateway/cache 观测和优化。
- 不引入未记录的隐式 fallback，不把 unsupported 伪装成 unavailable，也不把空数据伪装成零值。

### Desktop 行为

- Desktop 通过共享 API client 请求 Market Detail，不再在组件内固定拼接七组 fetch。
- 客户端增加按 `symbol + include + limit` 去重的 in-flight coordinator；配合 AbortController，在没有消费者时取消请求。
- 支持整页显式重试和失败 section 的局部重试；unsupported 不提供重试。
- 持仓上下文立即显示；quote、bars、指标、chip/NAV 分段渲染，各 section 独立显示 loading、ready、stale、empty、unsupported 或 unavailable。
- unsupported 默认隐藏，但在数据可用性/诊断区域保留解释；unavailable 显示用户提示和诊断标识。
- 保持现有详情容器和主要布局，优先替换数据加载、状态语义和文案，避免无关 UI 重构。

### Mobile、兼容与发布

- Mobile 本阶段不新增详情入口，仅共享 API client/schema 类型并验证现有只读 Portfolio/Risk 行为不受影响。
- 新接口采用增量发布；Server 先发布，Desktop 后切换；不在新接口失败时静默退回旧的多请求逻辑。
- 旧客户端继续使用现有接口；回滚 Desktop 到旧版本时，旧接口仍可用。
- 本阶段不修改数据库 Schema，不修改 DSA Contract V1，不新增 Provider 和凭证配置。

## 测试决策

- 测试验证外部行为和契约状态，不绑定组件内部实现细节；优先使用现有 Server facade、Schema、API client、Desktop UI 和 fixture/fault injection seam。
- Schema/API client 测试覆盖响应解析、能力枚举、section 状态、参数限制和旧 Contract 兼容。
- Server 测试覆盖股票、ETF、基金、未知资产类型、include 选择、非法参数、unsupported 不触发 Provider、部分成功、stale、empty、unavailable、diagnostic ID、缓存、refresh 和 single-flight。
- Desktop 测试覆盖文案、资产类型请求矩阵、ETF 不请求 chip、任何标的不请求 ATR、基金请求 NAV、局部失败仍展示成功 section、局部重试、整页刷新、请求去重和取消。
- Mobile 测试保持现有只读导航、Portfolio/Risk 请求和类型兼容回归；本阶段不新增 Mobile 详情视觉验收。
- 浏览器验收必须检查 Network 面板和页面状态：StrictMode 不产生两组有效详情请求，ETF 不出现 ATR/chip 请求，股票/基金分别呈现正确详情，partial/stale/empty/unavailable 状态可见且无长期 Pending。
- 真实 Provider smoke 作为观测证据，不作为本阶段唯一阻断条件；fixture 和 fault injection 是阻断型确定性证据。
- 最终执行 Spec、Task、ADR、schema、Server、Desktop、Mobile、Contract 和视觉证据的一致性 Review。

## 范围外

- 不新增 Mobile 持仓行情详情页面或原生设备视觉验收。
- 不修改 DSA Contract V1，不新增 DSA 批量详情接口，不改变 DSA 原生分析链路。
- 不把指标计算迁移到 Desktop 或 ThesisLedger Server。
- 不实现分钟线、ATR、完整筹码分布或新的 Provider 能力。
- 不在查看详情过程中修复、确认或持久化 Asset 身份。
- 不把详情接口扩展为无界历史图表接口；超过 90 条的数据继续使用独立历史能力。
- 不修改现有 Portfolio/Risk API 的业务语义，不新增数据库迁移。

## 补充说明

- 本规格基于已确认的“Desktop 优先、Mobile 兼容、Server 共享读模型”方案。
- 现有代码中 `PositionDetail` 固定请求 `quote`、`bars`、MA/MACD/RSI/ATR 和 `chip`；现有 DSA Contract V1 明确不支持 ATR，`CHIP_SUMMARY` 的 MVP 路由只对 STOCK 开放。
- 实施前应先读取本规格、关联 Task、ADR-005、ADR-008、ADR-011、ADR-014 及三个仓库的 `AGENTS.md`。
