# 市场数据缓存与 Provider 路由交互 Spec

## 背景与问题

市场数据会被行情详情、估值、风险、回测等多个入口重复读取。实时行情和筹码摘要已有短时 Redis 缓存，日线已有精确范围读穿缓存，但基金净值历史仍只合并并发请求；现有缓存时长和边界也没有形成统一、可验证的上游保护策略。

市场数据页同时把 Provider 注册表、手动配置状态和路由顺序混在两个不够直观的区域中。现有勾选与上下移动作不能直接表达主、备关系；AKShare 内部使用东方财富、新浪或腾讯通道时，也没有向产品侧传递实际上游来源。

## 目标

1. 为实时行情、日线 Bar、基金净值历史和筹码摘要提供按能力区分的本地读穿缓存，减少对 DSA 及其上游数据源的重复请求。
2. 保持 `provider` 表示可路由 Provider，并以独立字段表达 Provider 内部实际使用的上游来源；腾讯被实际使用时必须可见。
3. 市场数据页列出 DSA 内置的全部 Provider，并明确区分已接入当前 ThesisLedger 路由的 Provider 与仅存在于 DSA 内部的 Provider。
4. 将每项路由改成明确的主数据源与可选备用数据源，下拉选项只来自当前 Provider 清单中启用、已配置且兼容该能力的项。

## 非目标

- 不把 Redis 或 PostgreSQL 伪装成 Provider。
- 不允许浏览器直接访问 DSA，也不把 Provider 凭证保存到 ThesisLedger。
- 不开放任意第三方适配器的在线代码创建；手动配置仅指对 DSA 已声明 Provider 的启停、凭证或设置调整。
- 不改变现有 Desired Policy revision、DSA Effective Policy、熔断和完整序列 fallback 语义。
- 不为分钟线设计新的缓存策略。
- 不把缓存状态作为市场数据页的产品信息；缓存仅作为服务端请求保护与失败回退机制。
- 不在缺少市场维度路由契约时，把仅支持特定市场的 DSA 内置 Provider 伪装成可用于当前路由的候选项。

## 现状与约束

- `ThesisLedger` 持有产品缓存与 Desired Policy；DSA 持有 Provider manifest、配置、健康状态和 Effective Policy。
- `provider` 必须保持实际执行的可路由 Provider ID，`servedFromCache` 独立表示是否由产品缓存返回。
- AKShare 是聚合适配器，可能在内部使用东方财富、新浪或腾讯；内部通道不等于一个可独立配置的 Provider。
- DSA 同时具备独立的 Tencent 日线适配器，因此可以把 `tencent` 注册成只支持 `DAILY_BAR / STOCK|ETF` 的独立 Provider。
- 日线历史在相同复权口径下大多不可变，但包含当前日期的请求仍需较短的新鲜窗口。
- DSA 的 `DataFetcherManager` 还内置 Tushare、TickFlow、pytdx、BaoStock、Yahoo Finance、Longbridge、Finnhub 和 Alpha Vantage；这些数据源的市场覆盖与凭证要求不同，当前路由契约又没有市场维度，不能仅凭存在对应 Fetcher 就加入任意股票/ETF 路由。

## 设计方案

### 分能力读穿缓存

- 实时行情按标准化标的缓存：新鲜缓存 15 秒，最后有效结果保留 24 小时用于上游失败回退。
- 日线 Bar 的缓存键包含标准化标的、timeframe、start、end 和 limit，防止不同范围误合并。
- 包含当前日期或未给 end 的日线请求缓存 15 分钟；完全结束于过去日期的日线请求缓存 30 天。
- 基金净值历史按标的、start、end 和 limit 精确缓存；开放区间缓存 6 小时，完全结束于过去日期的区间缓存 30 天，最后有效结果保留 90 天。
- 筹码摘要按标准化标的缓存 15 分钟，最后有效结果保留 7 天。
- 普通请求先读新鲜缓存；命中时标记 `servedFromCache=true`。显式 `refresh=true` 绕过新鲜缓存，但同一底层请求仍共享 single-flight 和分布式锁。
- 缓存成功写入失败不得覆盖已经获得的有效上游结果；上游失败时可使用最后有效缓存或既有 PostgreSQL 历史，并明确标记缓存/陈旧状态。

- DSA 成功返回后，响应写入 Redis，并把 Bar 以幂等 upsert 方式写入 PostgreSQL。
- DSA 失败时仍可使用 PostgreSQL 中同范围的历史记录，但必须标记为 `freshness=stale` 和 `servedFromCache=true`，保持现有消费方安全边界。

### 来源与 Provider 清单

- Bar 和 Quote 契约增加可选 `upstreamSource`，使用稳定 ID，例如 `eastmoney`、`sina`、`tencent`。
- DSA Provider manifest 增加 `origin=dsa` 和可选 `upstreamSources` 清单。
- DSA 注册独立 `tencent` Provider，只声明实际支持的日线能力。
- DSA Provider manifest 同时声明 `routeEligible`、`markets` 和 `configurationMode`。Provider 页面展示全部 DSA 内置数据源；只有 `routeEligible=true` 且能力匹配的 Provider 才能编辑配置、测试并进入路由下拉框。
- 当前已接入 ThesisLedger 路由的是 AKShare、efinance 和腾讯财经；其余 DSA 内置 Provider 作为完整清单展示，并明确其市场覆盖和配置方式。
- AKShare 内部通道成功后在数据对象上留下 `upstreamSource`；如果使用腾讯通道，产品展示为“AKShare · 腾讯财经”。
- Provider 注册表依据 `updatedAt` 区分“DSA 默认”与“手动配置”；这只是配置来源，不改变 Provider ID。

### 路由交互

- 每个能力/标的类型显示两个选择器：主数据源必选或明确为未配置，备用数据源可选。
- 备用下拉排除当前主数据源；选择与主数据源相同的值时自动去重。
- 选项只包含 `configured && enabled` 且 manifest 声明支持当前能力/标的类型的 Provider。
- `routeEligible=false` 的 DSA 内置 Provider 不进入路由下拉框，避免在缺少市场维度时生成必然失败或语义不准确的路由。
- 已保存但临时健康降级的 Provider 仍保留在路由中，避免健康抖动静默改写用户策略；健康状态在 Provider 清单中单独展示。
- 路由数组继续使用现有顺序契约，`[primary, fallback]` 分别对应主、备。

## 对外行为或接口变化

- `QuoteV1`、`BarV1` 新增可选 `upstreamSource`，旧客户端可忽略。
- DSA Control Provider manifest 新增可选 `origin`、`upstreamSources`、`routeEligible`、`markets` 和 `configurationMode`，并返回 DSA 内置 Provider 的完整清单。
- Desired Policy 请求结构不变，路由数组在新 UI 中最多由主、备两个选择器产生。

## 数据、状态或兼容性影响

- `MarketBar` 增加可空 `upstreamSource` 字段；既有记录保持为空。
- 旧 DSA 若不返回 `upstreamSource`，ThesisLedger 继续正常解析。
- 旧策略中超过两个候选的路由读取时只在 UI 中编辑前两个；提交后按主、备模型收敛为最多两个候选。
- Redis 缓存可丢弃并重建；PostgreSQL Bar 仍是可恢复历史，不承担 Provider 路由状态。
- 缓存策略只改变普通重复请求与失败回退，不改变 DSA Data Contract 的数据语义。

## 测试策略

### 关键可观察行为

- 实时行情、日线 Bar、基金净值历史和筹码摘要的相同普通请求连续执行两次时，第二次命中新鲜缓存且不重复调用 DSA。
- 显式刷新会再次调用 DSA，成功结果写入 PostgreSQL。
- 腾讯独立 Provider 出现在注册表且只声明真实能力；AKShare 内部腾讯取数会输出 `upstreamSource=tencent`。
- Provider 清单包含 DSA 当前内置的 11 个数据源，并区分 3 个当前可路由 Provider 与 8 个仅在 DSA 内部使用的数据源。
- 路由 UI 对每一项显示主、备选择器，过滤不兼容或不可用 Provider，并避免重复选择。
- 市场行情详情能显示腾讯财经，市场数据页不承担缓存状态展示。

### 优先测试层级

1. DSA Provider runtime、Contract facade 与 AkShare 通道单元测试。
2. ThesisLedger schema、MarketService 与缓存状态服务测试。
3. Desktop 组件契约测试与类型检查。
4. 真实浏览器交互和本地 DSA/Server 运行时抽查。

### 可复用的现有测试入口

- DSA 的 `test_thesis_ledger_provider_runtime.py`、`test_thesis_ledger_core_facades.py`、`test_etf_daily_routing.py`。
- Server 的 `apps/server/test/market/services.test.ts` 与风险行情契约测试。
- Desktop 的 Market Detail 组件测试及静态渲染测试基础设施。

### 需要新增的测试入口

- Provider 主备路由纯函数与组件渲染测试。
- 四类缓存的命中、精确键、刷新和失败回退测试。
- DSA Provider 完整清单与路由候选隔离测试。

### 关键边界与回归场景

- 不同 start、end 或 limit 不能共享缓存。
- PostgreSQL fallback 不得被误报为新鲜数据。
- Provider 不兼容当前能力时不得进入下拉选项。
- DSA 内置但未接入当前路由的 Provider 必须可见，但不得出现启停、测试、移除操作或进入路由候选。
- 腾讯作为 AKShare 内部通道和独立 Provider 两种情况必须保持不同 provenance。

## 风险与备选方案

- 仅依赖 PostgreSQL 范围推断会受到停牌、节假日与交易日历完整性的影响，因此本次用 Redis 精确请求键判断“新鲜命中”，PostgreSQL只负责持久保存与失败回退。
- DSA 内置 Fetcher 并不等于已经满足当前 Control/Data Contract 的可路由 Provider；完整列出并声明路由资格，比把市场范围不兼容的数据源直接放入路由更准确。
- 主备两个候选比任意长排序更易理解，但会收窄超过两个候选的策略；当前产品 Provider 数量和用户需求均以主备为明确边界。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：实时行情、日线 Bar、基金净值历史和筹码摘要的普通重复请求在各自新鲜窗口内只访问一次 DSA；缓存键不会跨标的或范围串用。
- AC2：显式刷新能够绕过新鲜缓存；上游失败时只返回明确标记的缓存/陈旧结果，日线成功结果继续写入 PostgreSQL。
- AC3：Provider 配置列出 DSA 内置的全部 11 个 Provider，展示市场覆盖与配置方式，并明确区分当前可路由和仅 DSA 内部使用的数据源。
- AC4：每个路由项使用主、备下拉框，选项来自已启用、已配置且兼容的 Provider，主备不会重复。
- AC5：DSA 将 Tencent 暴露为独立日线 Provider，并保留 AKShare 内部通道 provenance，不改变现有 Provider/fallback 语义。
- AC6：市场数据页不展示缓存规模或缓存来源卡片，实际使用腾讯时仍能在行情详情中显示“腾讯财经”。
- AC7：Schema、Server、Desktop、DSA 的针对性测试、类型/语法检查和浏览器交互验证通过，未破坏现有市场数据链路。
