# 市场数据 RouteTarget V2 Spec

> 任务标识：market-data-route-target-v2
> 日期：2026-09-16
> 状态：Phase 1 实现中
> 对应任务：[市场数据 RouteTarget V2 实施任务](../tasks/2026-09-16-market-data-route-target-v2.md)

## 背景与问题

当前 ThesisLedger Control Contract 使用 `ProviderId[]`。`akshare` 适配器同时拥有多个上游，并在适配器内部自行回退，导致配置中的 Provider、实际请求上游、健康状态、熔断状态和响应 provenance 不能一一对应。ETF 日线还需要将主目标切换为 `tencent/tencent`，备用目标为 `akshare/eastmoney`。

## 目标

- 使用结构化 `RouteTarget { providerId, upstreamSource }` 表达一个可执行目标，每条能力路由最多包含主、备两个目标。
- DSA 按目标顺序顺序执行；适配器不得跨 source 隐式回退。健康、熔断、延迟、错误和请求预算均以目标为作用域。
- Desired/Effective Policy、Provider manifest、Server DSA client 和 DSA runtime 对同一目标使用相同字段与错误语义。
- ETF `DAILY_BAR` 的默认目标为 `tencent/tencent → akshare/eastmoney`。
- 记录实际命中的目标、目标序号、Effective Policy revision、Provider revision 和 source，供后续缓存与消费者迁移使用。

## 非目标

- 本 Spec 不实现 PostgreSQL BarSeries、Redis 热点视图、交易日历 TTL 或指标纯计算。
- 本 Spec 不迁移 Risk、Performance、Backtest 等消费者，也不实现公开市场数据 endpoint 的最终 `/api/v2` 切换。
- DSA native analysis 继续使用自己的 Provider 策略、缓存和熔断 namespace。

## 设计方案

```ts
type RouteTarget = { providerId: string; upstreamSource: string };
type RouteMatrixV2 = Record<string, Record<string, RouteTarget[]>>;
```

Control Contract V2 的 envelope 固定包含 `contractVersion=2`、`consumer=thesis-ledger`、`requestId`。Policy 还包含正整数 `revision`、`enabled` 和 `routes`。目标必须存在于 Provider manifest，source 必须由该 Provider 声明，主备不得重复且最多两个。空路由表示该能力不可用，不由 DSA 自动补默认值。

Effective Policy 为每个目标返回 `routeIndex`、configured、enabled、eligible、health、circuit 和 reason。执行失败后仅进入下一个已配置目标；所有目标失败时返回稳定错误和目标级诊断，不暴露上游原始响应。

## 对外行为或接口变化

- 主仓 Schema 新增 V2 RouteTarget、Desired/Effective Policy 和 Route provenance 类型；BarSeries V2 由 Phase 2 单独定义，Phase 1 不冻结其 wire contract。
- Server DSA client 提供显式 V2 handshake、Policy apply/effective 解析入口；BarSeries 解析由 Phase 2 Reader 定义。
- DSA Control endpoint 接受 V2 Policy；V2 读取同一持久化投影但返回 source-pinned Effective Policy。
- DSA runtime 为 V2 route 返回 `providerId`、`upstreamSource`、`routeIndex`、`providerRevision` 和目标列表；V1 内部测试路径的旧字段暂不移除。

市场详情的 bars/indicator 不再由旧 V1 helper 或客户端 V1 view adapter 组合；最终公开响应由 Phase 2 的 BarSeries V2 契约负责，客户端直接解析 V2。Desktop 仅允许使用明确命名的展示模型连接图表组件，不得重新生成 V1 wire 字段。

## 数据、状态或兼容性影响

Control Policy 的 revision 仍是单调递增并以 SQLite/Server 持久化记录为准。目标级健康状态使用包含 source 的 scope key，旧 scope 仍可被 V1 路径读取。Provider manifest 必须与实际 source-specific adapter 能力一致；未声明 source 的目标 fail-closed。

## 测试策略

- Schema/Contract：非法 Provider、非法 source、重复目标、三目标路由和缺失字段必须拒绝；合法 ETF 主备策略必须可解析。
- DSA runtime：验证 source pinning、无适配器内部 fallback、主目标失败后的有序备用、目标级健康/熔断隔离和精确 provenance。
- Server：验证 V2 payload 经过 Schema 解析后才发送，V2 handshake/effective 响应版本和字段被校验。
- 真实 Provider、Docker、公开 `/api/v2`、缓存和消费者验收均属于后续门禁，不能由 fixture 测试替代。

## 风险与备选方案

V2 先以显式分支接入，避免在共享脏工作树中让旧 V1 消费者收到结构化路由。最终公开 endpoint 切换时必须直接使用 V2 wire shape，不增加 V1 wire 兼容层。source-specific adapter 缺失时返回 unsupported_source，不得退回默认 source。

本阶段不宣称 600 秒 Provider request cooldown 是延迟预算。DSA 适配器调用尚未统一具备可取消的 per-target deadline，因此健康主源 5 秒和主源失败后总计 10 秒仍是后续运行态门禁；在实现安全的 adapter-enforced timeout 前，不得勾选该门禁。

## 未决问题

### Blocking

无。

### Non-blocking

- 公开 endpoint 的最终路径切换依赖 Phase 2 BarSeries 完成；在此之前仅验证契约就绪和 Server/DSA 本地互操作。

## 验收标准

- AC1：RouteTarget Schema 限制目标字段、唯一性和每条路由最多两个目标。
- AC2：Provider manifest source 声明与 Policy 校验一致，未声明 source fail-closed。
- AC3：DSA runtime 只调用被选定的 adapter/source；适配器内部不得触发其他 source。
- AC4：回退按 Policy 顺序执行，健康、熔断、错误和请求预算作用域精确到目标；延迟记录按目标保存，但 deadline 仍属未通过的运行态门禁。
- AC5：成功结果包含实际目标、目标序号、Effective Policy revision、Provider revision 和请求目标列表。
- AC6：ETF `DAILY_BAR` 默认策略可表达并可应用 `tencent/tencent → akshare/eastmoney`。
- AC7：Server 与 DSA V2 handshake、apply、effective 的契约字段一致，且旧 V1 本地测试不被无关破坏。
- AC8：Phase 1 定向测试与受影响包 typecheck/build 通过；真实 Provider、Docker、公开 endpoint 切换和延迟 deadline 保持独立未通过门禁。
