# 服务端标的目录聚合 Spec

> 任务标识：instrument-directory-server-read-aggregation
> 日期：2026-09-18
> 状态：已完成本地实现、分层验证和 Docker 运行态更新；浏览器和安装态门禁未执行
> 对应任务：[实施任务](../tasks/2026-09-18-instrument-directory-server-read-aggregation.md)

## 背景与问题

账户数据的成交记录和投资复盘都可能只拿到标的代码。当前账户数据页面从“当前持仓”反查名称；清仓后零数量持仓被正确删除，历史成交仍然存在，但名称反查失败并回退为代码。投资复盘等其他页面也存在同类风险。

项目已经有由 Server 维护的本地 `Instrument` 标的目录，以及目录 generation、active 状态和同步能力。标的名称是目录主数据，不应由 Ledger、Journal、Portfolio 或 Desktop 页面分别持久化一份。

## 目标

- 在 Server 的读模型聚合阶段，按业务结果中的 `symbol` 批量解析本地标的目录。
- Ledger 事件、Journal 复盘候选等主接口一次性返回业务数据和标的目录展示信息。
- Desktop 只消费主接口返回的目录信息，不为补名称再次请求目录，也不依赖当前持仓是否存在。
- 对目录缺失、目录中止用或历史 inactive 项提供可判断的结果；无法解析时安全回退为代码。
- 为后续风险中心、收益分析和其他 symbol 消费者提供同一个 Server 侧解析模块。

## 非目标

- 不向 Ledger 事件、Journal 记录或其他业务表重复写入 `instrumentName`。
- 不改变成交、复盘、持仓、收益计算和清仓投影语义。
- 不改变 DSA 目录同步、Provider 抓取或目录 readiness 策略。
- 本次不把所有历史页面一次性重写；第一批接入账户数据和投资复盘，其他消费者复用同一模块逐步迁移。

## 现状与约束

- `Instrument` 位于 `apps/server/src/market/instruments` 领域，现有搜索接口是模糊搜索，不能替代精确批量解析。
- `LedgerModule` 当前没有依赖 `MarketModule`；`JournalModule` 当前依赖 `LedgerModule`。新增依赖必须保持单向：目录主数据由 Market 拥有，Ledger/Journal 作为读取方消费。
- Ledger 的有效事件、审计事件和重放响应使用严格 Schema；新增展示元数据应放在响应侧的聚合字段，不修改事件事实 payload。
- 目录是本地同步后的参考数据。页面查询不应因名称补全而触发上游 Provider 请求；目录未命中时返回未解析代码并保留主业务结果。
- 当前工作区存在大量与本任务无关的用户修改；实施只能修改本任务涉及的文件，不能重置、覆盖、暂存或提交其他修改。

## 设计方案

### 服务端深模块

在 `market/instruments` 下提供 `InstrumentDirectoryService`，对调用方暴露小而稳定的批量接口：

```ts
resolveSymbols(symbols: readonly string[]): Promise<InstrumentDirectory>
```

该模块内部负责：

- 标准化并去重 `symbol`；
- 以代码和市场精确查询本地 `Instrument`；
- 优先返回当前 active 目录，必要时回退到最新可用的历史 inactive 目录；
- 返回目录 generation、已解析项和未解析代码；
- 一次批量查询，避免按行 N+1；
- 不调用远程 Provider，不把目录缺失误判为业务数据缺失。

`Asset` 继续负责账户资产身份确认和账本写入校验；`Instrument` 负责跨页面的目录展示主数据。调用方不直接访问 Prisma，也不复制名称解析规则。

### 统一响应侧聚合

Ledger、Journal 等响应增加同一语义的 `instrumentDirectory` 旁路字段，业务事实仍只保留 `symbol`：

```json
{
  "instrumentDirectory": {
    "generation": 123,
    "items": [
      {
        "symbol": "159516.SZ",
        "canonicalCode": "159516",
        "market": "SZ",
        "instrumentType": "ETF",
        "displayName": "示例标的",
        "active": true
      }
    ],
    "unresolvedSymbols": []
  }
}
```

Ledger 的有效事件、审计事件和重放响应都应在 Server 侧聚合所返回事件中的代码。Journal 复盘候选响应聚合候选项中的代码。前端通过响应内的 `symbol → displayName` 映射展示名称，目录未解析时展示代码，不发起第二个目录请求。

### 目录一致性与降级

- 业务接口成功读取但目录查询失败时，不丢弃业务结果；`instrumentDirectory` 返回空项或未解析代码，并记录可诊断错误。
- 目录 generation 作为响应元数据返回，供客户端缓存失效和诊断使用；不把 generation 当作业务账本 revision。
- 前端展示优先使用服务端目录项，缺失时使用 `symbol`；当前持仓不再参与历史事件和复盘候选的名称解析。

## 对外行为或接口变化

- 新增共享 `instrumentDirectory` Schema/类型。
- Ledger 事件有效、审计和重放读接口返回目录聚合字段。
- Journal 复盘候选读接口返回目录聚合字段。
- 既有业务字段、Ledger 事件 payload、Journal 持久化字段和命令接口保持不变。
- Desktop 不新增标的目录网络请求；现有主查询请求直接提供展示名称。

## 数据、状态或兼容性影响

- 不新增数据库表、字段或 migration。
- 不修改历史 LedgerEvent、Journal、TradePlan 或 Position 数据。
- 旧事件只要代码仍能在本地目录中解析，就能在读取时恢复名称；目录无法解析时仍显示代码。
- API Schema 更新需要同步 `packages/api-client`、Server 查询响应和 Desktop 测试 fixture。

## 测试策略

### 关键可观察行为

- 清仓后 Position 不存在时，Ledger 成交记录中的买入、卖出事件仍返回同一标的目录名称。
- 已平仓交易的 Journal 复盘候选仍返回目录名称。
- 同一响应包含多个重复代码时只产生一次目录解析结果。
- 目录缺失或仅存在不支持项时，业务结果仍返回，名称安全回退为代码。
- Desktop 只使用主查询响应中的目录数据，不出现额外的目录请求。

### 测试层级与证据边界

- Schema/纯函数测试：目录响应结构、标准化、去重和未解析语义。
- Server 定向测试：真实 Prisma 查询边界或可验证的数据库适配器，覆盖 active/inactive、重复代码和无匹配。
- Ledger/Journal 查询测试：响应聚合与业务数据保持完整。
- Desktop 定向测试：账户数据、投资复盘名称展示和代码回退；网络请求断言确认没有第二个目录请求。
- 受影响包 typecheck/build 和仓库边界门禁证明静态集成；不替代 Docker、浏览器已安装版本或真实目录同步运行态验收。

### 必要集成与真实运行态门禁

本次实现门禁要求 Server 查询与 Desktop 主接口契约通过。Docker 已通过独立运行态门禁；浏览器和安装态验收仍属于后续独立门禁，在未执行前不得将本地测试描述为已安装运行态通过。

## 风险与备选方案

- 直接让每个前端页面调用目录接口会产生二次请求和页面级缓存不一致，因此不采用。
- 把名称写入每条历史事件可以避免读取查询，但会重复存储、需要处理目录改名和历史修正，不作为本次方案。
- 只从 `Asset` 读取仍然会受账户关联和清仓影响；因此 `Instrument` 目录是主要展示来源，`Asset` 不承担跨页面名称主数据职责。
- active/inactive 目录存在同代码多版本时，解析模块必须使用确定的排序规则；发生无法安全判定的冲突时返回未解析，而不是猜测名称。

## 未决问题

### Blocking

无。

### Non-blocking

- Server 端是否增加短时内存缓存：默认先使用单次请求批量查询和数据库索引，只有定向测量证明必要时再增加按 generation 的缓存；不改变接口契约。

## 验收标准

- AC1：`InstrumentDirectoryService` 能按规范化后的 symbol 批量解析本地 Instrument 目录，返回 generation、解析项和未解析代码；不按行查询、不触发远程 Provider。
- AC2：Ledger 有效事件、审计事件和重放响应由 Server 聚合 instrumentDirectory；清仓导致 Position 删除后，历史成交仍能显示目录名称。
- AC3：Journal 复盘候选响应由 Server 聚合同一 instrumentDirectory；已平仓交易仍能显示目录名称。
- AC4：业务数据和目录解析失败解耦；目录未命中时业务结果不丢失，客户端安全回退显示 symbol。
- AC5：Desktop 账户数据和投资复盘只使用主接口响应中的目录信息，不新增目录请求或页面级名称持久化。
- AC6：受影响 Schema、Server、Desktop 定向测试、包级静态检查和 Docker 运行态检查通过；未执行的浏览器或安装态验收保持未通过状态。
