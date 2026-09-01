# 投资组合快照系统 Spec

- 日期：2026-08-28
- 状态：待评审
- 适用项目：`thesis-ledger`
- 类型：增量设计
- 目标版本：MVP
- 替代文档：[`2026-08-24-performance-snapshot-automation.md`](2026-08-24-performance-snapshot-automation.md)

## 背景与问题

当前项目已经有 `PortfolioSnapshot` 表、`PerformanceService.capture()`、收益历史查询和 `snapshot` 自动化任务，但它们仍是分散的历史缓存能力：

- `PortfolioSnapshot` 只有 `accountId`、`capturedAt`、金额和 JSON `payload`，不能表达来源、状态、创建时间或完整的数据质量；
- 全部账户是服务层对 `Account` 的虚拟聚合，项目没有持久化 `Portfolio` 实体；
- 当前投资组合账户范围已明确为启用的证券和基金账户；独立现金账户只保留账户级数据，不进入组合快照；
- 服务端已有手动创建 API，但 Desktop 没有创建快照的入口；
- 自动化任务只有通用 cron 和 `snapshot` 类型，不能持久化快照范围、实际/影子模式或币种口径；
- 交易和导入完成后没有统一的快照触发接缝；
- 收益分析可以消费历史快照，但没有独立的 Snapshot 查询、详情和状态契约。

本 Spec 将现有能力收敛为一个由 Server 负责创建、追加保存、查询和失效管理的快照领域服务，同时保留当前 `Account + Position + LedgerEvent` 的事实源边界。

## 目标

1. 建立以现有 `Account` 聚合为基础的 `PortfolioSnapshot` 领域模型，不在 MVP 新增持久化 `Portfolio` 实体。
2. 由 Server 的 `SnapshotService` 统一创建手动、日终、交易后和导入完成后的快照。
3. 让快照的业务时点、写入时点、来源、状态、范围、模式和估值质量可以被明确查询。
4. 保证快照金额和明细追加后不可编辑；错误通过失效记录和新快照处理。
5. 在单一币种和多币种场景下都不伪造跨币种金额；FX 合并必须显式选择并保留证据。
6. 允许单个标的缺少行情时创建 `PARTIAL` 快照，保留可用金额、缺失标的和估值质量。
7. 为收益分析提供新的快照查询契约，并以兼容适配方式保留现有 `/performance/history` 和 `/performance/summary`。
8. 让 Portfolio 页面、收益分析空状态和数据与自动化页面都能完成快照创建或配置，不要求用户直接调用 API。

## 非目标

- 不新增持久化 `Portfolio`、用户 owner 或多租户访问控制模型；当前单租户权限沿用既有网络安全边界，细粒度用户权限列入后续设计。
- 不在 MVP 新增 `PortfolioSnapshotAccount`、`PortfolioSnapshotPosition` 两张关系表；账户和持仓明细先使用版本化 JSON payload 保存，关系表作为后续性能优化。
- 不把 LedgerEvent 改造成新的事件溯源系统；Ledger 仍是资产事实源，Position、Cash 和 Snapshot 都是读取投影。
- 不回填完整的历史行情或重建历史快照；MVP 创建的快照使用创建时可获得的行情，并记录真实行情时点。
- 不支持分钟级或每个行情 Tick 的快照。
- 不在 Desktop、Mobile 或任何分析消费者中计算或隐式创建快照。
- 不在 MVP 实现外部账户同步接缝；`SYNC` 保留为来源枚举和后续扩展点。
- 不实现复杂 Snapshot Diff、SUPERSEDED 链、保留期限和归档策略；MVP 只实现 `VALID` 与 `INVALID`。
- 不把 Portfolio Snapshot 与 Backtest Artifact、Journal Review Snapshot 混用。

## 现状与约束

### 领域身份

当前代码没有 `Portfolio` 表。`Account` 是持仓、账本和现金的持有者；“全部账户”由 `mode` 过滤后在服务层聚合。MVP 使用以下稳定身份：

```ts
type SnapshotScope = 'account' | 'portfolio';
type PortfolioMode = 'actual' | 'shadow';
type Currency = 'CNY' | 'HKD' | 'USD';
```

- `scope = 'account'` 时必须有 `accountId`，快照只包含该账户；
- `scope = 'portfolio'` 时 `accountId` 必须为空，快照包含当前 `mode` 下所有启用的证券和基金账户；
- `mode` 是快照身份的一部分，实际和影子数据绝不混合；
- `portfolio` 不是可授权的独立实体，当前 MVP 不声称支持用户级 Portfolio 权限。

### 现有快照与事实源

现有 `PortfolioSnapshot` 由 `PerformanceService.capture()` 写入，历史查询由 `PerformanceService.history()` 读取。Ledger、Position、Cash Balance 和 Market 数据的现有边界继续有效：

- LedgerEvent 是交易、现金、费用、税和公司行动的事实源；
- Position 是 Ledger 的当前投影；
- Cash Balance 由 Ledger 事件计算，不创建现金 Position；
- Quote/Fund NAV 由 Server 通过现有 Market/DSA 边界读取；
- Snapshot 是 Ledger/Position/Market 的追加式历史派生记录，不取代事实源。

### 现有自动化

项目已有 `AutomationJob`、`AutomationRun`、`AutomationScheduler` 和 `snapshot` job type。当前 Snapshot handler 只读取实际模式的有效账户，并逐账户调用 `PerformanceService.capture()`；任务没有快照范围和模式设置。MVP 扩展该任务配置和执行接缝，不创建第二套调度器。

### 现有分析

收益分析已经读取 `PortfolioSnapshot`，但通过 Performance 专用方法直接读取旧表。Risk、AI、Report 和 Backtest 当前没有统一的 Portfolio Snapshot 引用；MVP 只迁移 Performance 作为第一个消费者，其他消费者保留当前行为。

## 设计方案

### 1. Snapshot 来源与状态

```ts
type SnapshotSource =
  | 'DAILY_CLOSE'
  | 'TRANSACTION'
  | 'IMPORT'
  | 'MANUAL'
  | 'SYSTEM';

type SnapshotStatus = 'VALID' | 'INVALID';

type SnapshotValuationStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
```

来源含义：

| 来源 | 触发方式 | MVP 状态 |
| --- | --- | --- |
| `DAILY_CLOSE` | 已启用的日终自动化任务 | 实现 |
| `TRANSACTION` | 成功提交 Ledger 命令后的触发请求 | 实现 |
| `IMPORT` | ImportDraft 最终提交并完成投影后的触发请求 | 实现 |
| `MANUAL` | 用户在 Desktop 主动创建 | 实现 |
| `SYSTEM` | 旧数据迁移、维护或受控重建 | 实现 |

`SYNC` 不进入本 MVP 的可创建来源。未来接入外部账户同步时，必须复用 `SnapshotService`，不能新增另一套 Snapshot 写入逻辑。

`VALID` 快照的事实字段不可修改。MVP 允许服务端将 `VALID` 标记为 `INVALID` 并保存原因，但不允许修改原金额、明细、时点或来源。`SUPERSEDED` 和替代关系后续再加入。

### 2. Snapshot 身份与数据模型

MVP 在现有 `PortfolioSnapshot` 表上做增量升级，不创建新的 Portfolio 根表。规范化后的最小字段如下：

```ts
interface PortfolioSnapshot {
  id: string;
  scope: 'account' | 'portfolio';
  accountId: string | null;
  mode: 'actual' | 'shadow';

  source: SnapshotSource;
  status: SnapshotStatus;
  valuationStatus: SnapshotValuationStatus;

  snapshotAt: Date;
  createdAt: Date;
  currency: Currency | null;

  marketValue: Decimal | null;
  costValue: Decimal | null;
  cashValue: Decimal | null;
  totalValue: Decimal | null;

  accountCount: number;
  positionCount: number;
  note: string | null;

  idempotencyKey: string;
  invalidatedAt: Date | null;
  invalidReason: string | null;

  payload: SnapshotPayloadV2;
}
```

数据库不变量：

- `scope = 'account'` 必须有 `accountId`；`scope = 'portfolio'` 必须没有 `accountId`；
- `mode`、`scope`、`source`、`status` 和 `valuationStatus` 由受控枚举契约校验；
- `idempotencyKey` 非空且唯一，手动创建也生成随机键，自动来源使用确定性业务键；
- `snapshotAt`、`createdAt` 都使用带时区语义的 PostgreSQL `timestamptz`；
- `marketValue`、`costValue`、`cashValue` 表示 `currency` 下已知的聚合金额；没有共同币种时为 `null`，不得把不同币种直接相加；
- `totalValue` 只有在共同币种且 `valuationStatus = 'COMPLETE'` 时才填写；
- `payload` 与顶层摘要属于同一次创建，顶层字段是查询索引，payload 是冻结明细。

`capturedAt` 是旧表和旧 API 的兼容名称。迁移后以 `snapshotAt` 为 SSOT；旧接口适配器可以继续返回 `capturedAt`，但不得在新领域类型中继续使用两个业务时点字段。

### 3. 冻结 payload

MVP 使用版本化 JSON，避免为了引入快照而立即重构 Position、Instrument 或 Asset 关系：

```ts
interface SnapshotPayloadV2 {
  version: 2;
  accountScopePolicy: 'account-v1' | 'investment-only-v1';
  summary: {
    marketValue: string | null;
    costValue: string | null;
    cashValue: string | null;
    totalValue: string | null;
    currency: Currency | null;
    valuationStatus: SnapshotValuationStatus;
  };
  accounts: Array<{
    accountId: string;
    mode: 'actual' | 'shadow';
    currency: Currency;
    marketValue: string | null;
    cashValue: string;
    totalValue: string | null;
    valuationStatus: SnapshotValuationStatus;
    missingSymbols: string[];
  }>;
  positions: Array<{
    accountId: string;
    symbol: string;
    instrumentId?: string;
    assetType: string;
    currency: Currency;
    quantity: string;
    averageCost: string;
    costBasis: string;
    marketPrice: string | null;
    marketValue: string | null;
    unrealizedPnl: string | null;
    priceAsOf: string | null;
  }>;
  nativeByCurrency: Array<{
    currency: Currency;
    marketValue: string | null;
    costValue: string;
    cashValue: string;
  }>;
  dataQuality: {
    missingSymbols: string[];
    missingCurrencies: Currency[];
  };
  projection: {
    ledgerRevisions: Record<string, string>;
    projectionGenerations: Record<string, string>;
  };
  fx?: {
    enabled: boolean;
    baseCurrency?: Currency;
    status: 'not_needed' | 'ready' | 'stale' | 'blocked';
    asOf?: string;
    rates: FxRateV1[];
  };
}
```

缺少 `accountScopePolicy` 的旧组合快照视为 `legacy-all-accounts-v0`。旧口径快照继续作为历史证据可见，但不得与 `investment-only-v1` 快照共同计算 TTWROR、XIRR 或区间收益，也不得静默重算或删除。

`instrumentId` 在当前持仓没有可确认目录关联时可以缺省；`symbol + accountId` 仍是当前 Position 的稳定引用。后续如果要求所有快照持仓必须关联 Instrument，另立目录迁移设计。

金额在数据库中使用 Prisma Decimal；JSON payload 和 API 响应使用规范十进制字符串。`FxRateV1` 复用当前共享 Market Schema，必须保留货币对、汇率、汇率日期、Provider、抓取时间、新鲜度和可用状态。

### 4. 时间和估值口径

- `snapshotAt` 是 Server 生成快照所描述的业务时点；公开手动创建接口不允许普通用户填写过去时间；
- `createdAt` 是记录成功写入数据库的时间；
- 日终任务使用任务时区计算业务日期和 `snapshotAt`；
- Import/Transaction 触发使用投影成功提交后的当前业务时间，不把历史 `observedAt` 或 `capturedAt` 伪装成有历史行情的快照；
- MVP 只使用创建时可获得的 Quote/Fund NAV，保存每个价格的 `priceAsOf`、Provider 和 freshness；不能声称这些价格等于过去 `snapshotAt` 的历史收盘价；
- 如果未来需要历史补录，必须新增支持历史行情/NAV 的独立能力，不能复用当前创建接口默默回算。

### 5. 单币种、多币种与 FX

快照与收益分析共用当前 FX 边界：

- 单账户单币种：直接以账户币种汇总；
- 全部账户同一币种：直接以该币种汇总；
- 全部账户多币种且 `fxMerge = false`：保留 `nativeByCurrency`，顶层共同币种金额为 `null`，不得生成跨币种总额；
- 全部账户多币种且 `fxMerge = true`：必须传入 `baseCurrency`，通过 DSA/现有 Market FX Contract 取得汇率；
- 汇率在 `snapshotAt` 口径读取，最近 7 个自然日内的陈旧汇率可用但必须标记；缺失或超过 7 天时，快照仍可保存原币种明细，但 `currency`、换算金额和 `totalValue` 保持 `null`，状态为 `PARTIAL` 或 `UNAVAILABLE`；
- 不使用 1:1 兜底，不把不同币种的金额、成本或现金直接相加；
- FX 证据写入 payload，不改变 Ledger、Position、Asset 或 TargetAllocation 的原始币种。

公开请求未提供 `fxMerge` 时默认关闭；未提供 `baseCurrency` 时默认使用 `CNY`。快照创建不会因为 FX 不可用而伪造本位币合计，原币种明细仍按上述规则保存。

### 6. 一次逻辑冻结与并发一致性

`SnapshotService.create()` 是唯一写入入口，创建流程为：

1. 根据 `scope + accountId + mode` 固定账户集合；
2. 读取账户、Position、有效 Ledger/Cash 投影以及每个账户的 `ledgerRevision`、`projectionGeneration`；
3. 在 `snapshotAt` 口径取得 Quote、Fund NAV 和 FX 证据；
4. 重新读取并校验账户集合的投影版本没有变化；
5. 计算摘要、账户明细、持仓明细、原币分桶和数据质量；
6. 在数据库事务内按唯一 `idempotencyKey` 写入 Snapshot；
7. 如果投影版本在读取期间变化，最多重试 3 次，仍不一致时返回 `SNAPSHOT_READ_CONFLICT`，不写入混合版本。

行情网络请求不在长事务中持有账户写锁；一致性依赖投影版本重检和唯一键，而不是新增分布式锁。Ledger 写入事务提交后才允许创建 `TRANSACTION` 或 `IMPORT` 触发请求。

### 7. 部分估值

单个标的行情缺失不阻塞整条 Snapshot：

- 该 Position 的 `marketPrice`、`marketValue`、`unrealizedPnl` 和 `priceAsOf` 为 `null`；
- 已知的成本、现金和可用市值继续保存；
- `valuationStatus = 'PARTIAL'`，缺失标的进入 `dataQuality.missingSymbols`；
- 只有所有必要金额和共同币种都可确认时，才填写 `totalValue` 并标记 `COMPLETE`；
- 数据库读取、账户不存在或无法建立快照身份时返回失败，不创建伪造的 `UNAVAILABLE` 成功记录；
- Performance summary 可以对 partial 快照返回“无法计算”及原因，但历史明细仍可读取。

估值状态的判定固定为：全部必要证券、现金和共同币种金额可确认时为 `COMPLETE`；至少有一部分金额可确认但存在缺失行情、缺失 FX 或无共同币种合计时为 `PARTIAL`；没有任何可用金额且无法形成有意义的明细估值时为 `UNAVAILABLE`。数据库或身份错误仍然是创建失败，不落一条 `UNAVAILABLE` 记录。

### 8. 幂等与触发请求

自动来源必须使用确定性业务键：

```text
DAILY_CLOSE:  daily-close:{scope}:{accountId|portfolio}:{mode}:{businessDate}
TRANSACTION:  transaction:{eventId}
IMPORT:       import:{importDraftId}:{revision}
SYSTEM:       system:{operation}:{key}
MANUAL:       manual:{randomUuid}
```

新增 `SnapshotTrigger` 作为事务后触发的持久化请求：

```ts
interface SnapshotTrigger {
  id: string;
  source: 'TRANSACTION' | 'IMPORT';
  scope: 'account' | 'portfolio';
  accountId: string | null;
  mode: 'actual' | 'shadow';
  idempotencyKey: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  requestedAt: Date;
  nextAttemptAt: Date | null;
  lastError: string | null;
}
```

Ledger 命令和 Import 提交在自己的事务内创建触发请求；现有 Automation Scheduler 轮询并调用 `SnapshotService.create()`。触发请求和 Snapshot 都以唯一键防止重试重复。

### 9. 自动快照策略

#### 日终

现有 `snapshot` Automation Job 增加明确设置：

```ts
interface SnapshotAutomationSettings {
  scope: 'account' | 'portfolio';
  accountIds?: string[];
  mode: 'actual' | 'shadow';
  fxMerge: boolean;
  baseCurrency?: Currency;
}
```

- `scope = 'portfolio'` 时创建一个虚拟组合快照；
- `scope = 'account'` 时只创建设置中列出的账户快照；
- 没有 `accountIds` 的账户范围不允许隐式扩展为全部账户；
- 日终业务日期和 cron 时区使用现有 AutomationJob 配置；
- MVP 继续使用现有中国交易日历作为市场任务保护；港股/美股精确收盘日历列入后续增强；
- 同一业务日期用 `DAILY_CLOSE` 幂等键去重。

#### 交易后

所有成功的 Ledger V2 写入命令在事务提交后创建账户范围的 `TRANSACTION` 触发请求。只有真正推进 Ledger/Projection 版本的命令创建触发请求；幂等重放和未推进版本的请求不得重复触发。修正、作废、恢复和跨账户移动使用实际产生的事件 ID/fact ID 作为幂等来源，不在 Ledger 事务中调用行情或写 Snapshot。

#### 导入完成

只有 ImportDraft 从未完成状态转为最终 `committed` 并完成 Position/Cash 投影后，才创建一条 `IMPORT` 触发请求。部分提交不创建最终导入快照；同一 Draft Revision 重试只能生成一条。

#### 外部同步

`SYNC` 只保留来源扩展点。未来同步模块必须提供稳定的 `syncJobId` 和提交后事件；本 MVP 不添加虚假的同步入口或自动快照。

### 10. SnapshotService

统一服务接口：

```ts
interface SnapshotService {
  create(command: CreateSnapshotCommand): Promise<PortfolioSnapshot>;
  list(query: SnapshotQuery): Promise<PortfolioSnapshotSummary[]>;
  get(snapshotId: string): Promise<PortfolioSnapshot>;
  invalidate(snapshotId: string, reason: string): Promise<PortfolioSnapshot>;
}
```

查询类型和列表摘要固定为：

```ts
interface SnapshotQuery {
  scope?: 'account' | 'portfolio';
  accountId?: string;
  mode?: 'actual' | 'shadow';
  source?: SnapshotSource;
  status?: SnapshotStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

interface PortfolioSnapshotSummary {
  id: string;
  scope: 'account' | 'portfolio';
  accountId: string | null;
  mode: 'actual' | 'shadow';
  source: SnapshotSource;
  status: SnapshotStatus;
  valuationStatus: SnapshotValuationStatus;
  snapshotAt: Date;
  createdAt: Date;
  currency: Currency | null;
  totalValue: Decimal | null;
  accountCount: number;
  positionCount: number;
}
```

只有该服务可以创建或改变 Snapshot 状态。Performance、Automation、Ledger、Import 和未来 Sync 都调用它，不复制估值、幂等或写入逻辑。

`CreateSnapshotCommand` 区分公开手动命令和内部触发命令：

```ts
interface CreateSnapshotCommand {
  scope: 'account' | 'portfolio';
  accountId?: string;
  mode: 'actual' | 'shadow';
  source: SnapshotSource;
  idempotencyKey: string;
  note?: string;
  fxMerge: boolean;
  baseCurrency?: Currency;
  snapshotAt?: Date; // 仅内部日终/触发/迁移命令允许
}
```

公开 Desktop 命令由 Server 填充 `source = 'MANUAL'`、随机幂等键和当前 `snapshotAt`；客户端不能提交 `source`、`idempotencyKey` 或历史 `snapshotAt`。

### 11. API 契约

由于当前项目没有持久化 `Portfolio`，MVP 保持 `/performance` 路由风格，不采用不存在的 `/portfolios/:portfolioId` 路由。

#### 手动创建

```http
POST /api/v1/performance/snapshots
```

请求：

```json
{
  "scope": "portfolio",
  "mode": "actual",
  "note": "调仓前",
  "fxMerge": false,
  "baseCurrency": "CNY"
}
```

服务端决定来源、幂等键和当前 `snapshotAt`。`scope = account` 时必须提供 `accountId`。

响应至少包含：

```json
{
  "id": "...",
  "scope": "portfolio",
  "accountId": null,
  "mode": "actual",
  "source": "MANUAL",
  "status": "VALID",
  "valuationStatus": "COMPLETE",
  "snapshotAt": "...",
  "createdAt": "...",
  "currency": "CNY",
  "marketValue": "...",
  "costValue": "...",
  "cashValue": "...",
  "totalValue": "...",
  "accountCount": 1,
  "positionCount": 3,
  "note": "调仓前"
}
```

#### 列表

```http
GET /api/v1/performance/snapshots
```

支持 `scope`、`accountId`、`mode`、`source`、`status`、`from`、`to`、`limit`、`cursor`。默认按 `snapshotAt DESC, id DESC` 排序。`limit=1&status=VALID` 是最近有效快照查询，不新增冗余 latest endpoint。

#### 详情

```http
GET /api/v1/performance/snapshots/:snapshotId
```

返回摘要、账户明细、持仓明细、来源、状态、数据质量、FX 证据、`snapshotAt`、`createdAt` 和备注。

#### 失效

MVP 不向普通 Desktop 用户开放失效操作；内部维护命令调用 `SnapshotService.invalidate()`。如果未来开放 API，必须要求原因并只允许状态字段变化。

#### 兼容接口

- 现有 `GET /api/v1/performance/history` 继续作为收益分析兼容读取入口，内部改为调用 Snapshot Query，并把 `snapshotAt` 映射为旧的 `capturedAt`；
- 现有 `GET /api/v1/performance/summary` 保留原请求形状，继续返回 TTWROR、XIRR、`xirrReason` 和明确的 partial/FX 原因；
- 旧版只传 `accountId/capturedAt/mode` 的内部调用在迁移期由适配器处理，新的 Desktop 不再依赖旧字段。

### 12. Desktop 交互

#### Portfolio 页面

不增加一级“快照”导航。Portfolio 页面显示：

```text
最后快照：今天 15:00 · 日终
[刷新] [创建快照] [查看历史]
```

从未创建时显示“暂无历史快照”，并提供“创建快照”。创建 Sheet 只展示当前范围、实际/影子模式、只读的当前时间和可选备注；不允许普通用户输入历史时点。

#### 收益分析页面

无历史快照时，主操作为“创建第一个快照”，次操作为“设置自动快照”。如果账户/行情尚未配置，创建按钮明确禁用并引导完成配置；配置完成后不要求用户离开页面才能创建。

创建成功后通过 TanStack Query Mutation 失效当前范围的快照、历史、summary、layers 和依赖配置查询；失败保留表单草稿；partial 成功显示“快照已创建，部分标的缺少估值”，不当作整个操作失败。

#### 快照历史

通过 Portfolio 或收益分析中的 Sheet/局部面板访问，不新增一级导航。列表显示 `snapshotAt`、来源、模式、范围、总资产、估值状态和 `createdAt`；详情显示账户、持仓、原币分桶和质量信息。冻结字段没有编辑入口。

#### 数据与自动化

在现有“数据与自动化”页面增加“收益快照”配置卡片或 Sheet：

- 任务类型固定为 `snapshot`；
- 配置名称、cron、时区、启停状态、实际/影子模式、组合/账户范围、账户列表和 FX 口径；
- 保存后显示下一次运行、最近一次运行、成功/失败和失败原因；
- 提供“立即创建”按钮，调用手动 Snapshot API，不绕过 `SnapshotService`；
- 任务失败提供重试，不把失败写成有效快照。

### 13. 消费者边界

MVP 只将 Performance 迁移到新的 Snapshot Query：

- Performance History 默认读取 `status = VALID`，但保留 partial 明细；
- Performance Summary 对缺少两个完整快照、partial 或 FX 阻断返回明确不可计算原因；
- Risk、AI、Report、Backtest 不在本 MVP 强制改读 Snapshot；
- AI 的 `snapshotId`、Risk 的快照时点和 Artifact 引用列入后续 Spec；
- 任何消费者在缺少快照时都不得静默调用 `SnapshotService.create()`。

### 14. 权限与一致性边界

MVP 运行在当前单租户 Server。既有 LAN Bearer Token 只保护服务入口，不新增用户身份和 Portfolio owner。服务端仍必须校验：

- `accountId` 存在且属于请求的当前模式；
- Portfolio 范围只包含当前模式下的有效账户；
- Snapshot 明细的账户和持仓与创建范围一致；
- 触发请求只能由已成功提交的 Ledger/Import 事务产生。

细粒度权限是后续前置条件，不作为本 MVP 验收项。

### 15. 数据迁移与兼容

迁移顺序：

1. 在现有表上增加 `scope`、`mode`、`source`、`status`、`valuationStatus`、`snapshotAt`、`createdAt`、`currency`、`totalValue`、计数、备注、幂等键和失效字段；
2. 将旧 `capturedAt` 映射为 `snapshotAt`，旧写入时间无法追溯时将 `createdAt` 设为迁移时间，并在 payload metadata 标记 `legacyCreatedAtUnknown`；
3. 根据旧 `accountId` 推断 scope，根据 payload.mode 推断 mode；旧数据来源统一标记 `SYSTEM`；
4. 将旧 positions payload 转成 `SnapshotPayloadV2`，无法补齐的 Instrument 关联保持缺省；
5. 为旧数据生成稳定的 `SYSTEM` 幂等键，保留原记录内容，不自动生成伪历史快照；
6. 上线新 Query 后继续保留旧 Performance history/summary 适配，确认所有调用方迁移后再决定是否移除旧字段。

如果数据库已有无法解析的旧 payload，迁移必须记录失败行并停止切换，不得静默丢弃或把金额置零。

## 测试策略

### 领域与服务端

- Snapshot scope/mode 校验、原币分桶、单币种聚合和多币种禁止直接相加；
- 直接/反向 FX、陈旧阈值、缺失 FX 和 `totalValue` 阻断；
- partial Position 仍能创建，缺失行情保留 null 和缺失列表；
- projection generation 变化时重试或返回 `SNAPSHOT_READ_CONFLICT`；
- 手动随机幂等键、自动确定性幂等键和并发重复请求；
- `VALID → INVALID` 只改变状态字段，冻结摘要和 payload 不变；
- 日终、交易后、导入完成触发的来源、范围、模式和重试行为；
- 旧表迁移、旧 `/performance/snapshots` 调用和 `/performance/history` 兼容读取。

### Desktop 与查询

- 创建第一个快照、创建中、成功、partial、失败和重试；
- 全部账户/单账户、实际/影子和 FX 口径不会串查询缓存；
- 快照历史列表、详情和默认排序；
- 自动化任务创建、编辑、启停、立即创建、失败原因和 Query 刷新；
- 键盘操作、窄屏 Sheet 底部操作区和无快照空状态；
- 保存后只失效快照及其依赖查询，不进行整页手写 refetch。

### 运行时门禁

- 新数据库迁移和已有数据库迁移各执行一次；
- 实际账户与影子账户各创建一条手动快照；
- 两个账户同一业务日期重复执行日终任务，验证只产生一条有效快照；
- 提交一笔交易和一次 Import，验证触发请求在事务提交后生成且重试不重复；
- 注入缺行情、陈旧行情、单币种和混合币种 fixture，核对 UI 与 API 状态；
- 宽屏、窄屏和真实 Desktop 运行验收与确定性测试分开记录。

## 风险与备选方案

### 保留虚拟 Portfolio

MVP 选择 `scope + accountId + mode`，避免引入当前架构不存在的 Portfolio owner 和迁移链。代价是未来多用户/多 Portfolio 必须再增加根实体和授权边界。

### JSON payload 而非子表

MVP 选择版本化 payload，降低迁移和跨模块改动；代价是按持仓查询和大规模历史分页能力有限。后续可在不改变 Snapshot 身份和 API 的情况下增加只读子表投影。

### 触发请求而非事务内创建

MVP 选择提交后持久化 `SnapshotTrigger`，避免在 Ledger 写事务内调用行情；代价是用户可能短暂看到“等待快照”，但不会丢失触发意图。

### 现有市场日历

MVP 使用当前 CN 日历保护市场任务；港股/美股的精确日终需要新的多市场日历契约，不能用同一 cron 假装完成。

## 未决问题

### Blocking

无。本文已经选择虚拟 Portfolio、JSON payload、单租户权限、现有 `/performance` 路由和 `SnapshotTrigger` 触发模型。

### Non-blocking

- 日终默认时间沿用现有 AutomationJob 的 cron 和 `Asia/Shanghai` 默认时区；产品可以在任务配置中调整，不改变 Snapshot 契约。
- 快照历史使用 Sheet/局部面板，不新增一级导航；如果后续历史规模需要独立路由，只增加读取入口，不改变列表契约。
- `SUPERSEDED`、同步快照、历史行情补录、子表投影和细粒度用户权限分别作为后续 Spec，不影响 MVP 验收。

## 验收标准

- **AC1：** 同一 `scope + accountId + mode` 的快照只包含声明范围；全部账户是当前模式下所有有效账户的虚拟组合，实际与影子不混合。
- **AC2：** 旧 `PortfolioSnapshot` 数据可以迁移到版本化模型；新快照包含来源、状态、`snapshotAt`、`createdAt`、估值状态、范围、模式、计数和冻结 payload。
- **AC3：** 所有手动、日终、交易后和导入快照都通过 `SnapshotService.create()` 创建；收益、风险、AI 等消费者不会因缺少快照隐式创建。
- **AC4：** 快照摘要和 payload 在同一次逻辑冻结中生成；投影版本变化会重试或返回稳定冲突，不写入跨版本数据。
- **AC5：** 单个标的行情缺失时仍能创建 `PARTIAL` 快照，保留可用金额、null 估值和缺失标的；数据库或身份错误不会生成伪成功快照。
- **AC6：** 单币种全部账户可以得到共同币种汇总；多币种关闭 FX 时不生成跨币种总额，开启 FX 时只使用有来源和时点的 DSA 汇率，阻断或陈旧状态可查询。
- **AC7：** 手动、日终、交易后和导入来源使用规定的幂等键；并发或重试不会产生重复自动快照，手动快照不被业务日期去重。
- **AC8：** `VALID` 快照的金额、明细、时点和来源不可编辑；失效只改变状态、原因和管理时间，原冻结内容保持不变。
- **AC9：** Desktop Portfolio/收益分析可以创建手动快照；创建中、成功、partial、失败和重试状态可见，失败不丢备注草稿。
- **AC10：** Desktop 可以查看快照列表和详情，默认按 `snapshotAt DESC, id DESC` 排序，且不新增一级快照导航。
- **AC11：** 数据与自动化页面可以配置 Snapshot Job 的范围、模式、cron、时区、启停和 FX 口径，并显示最近运行状态。
- **AC12：** Performance history/summary 通过新 Snapshot Query 消费，旧接口保持兼容；partial、快照不足和 FX 阻断返回明确原因。
- **AC13：** 每个成功 Ledger 命令和最终 Import 提交都能在事务提交后创建对应触发请求；Import 部分提交和失败不会伪造完成快照。
- **AC14：** 现有单租户网络安全边界继续有效；细粒度用户/Portfolio 权限不被伪装成已实现能力。
- **AC15：** Server、Domain、Schema、Desktop、迁移、确定性测试和真实运行时验收均有对应任务与证据，任务文档无未定义占位项。
