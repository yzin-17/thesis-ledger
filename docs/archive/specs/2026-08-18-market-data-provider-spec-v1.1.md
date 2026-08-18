# 市场数据与标的中心 Spec

> 版本：v1.1  
> 日期：2026-08-17  
> 状态：Draft  
> 默认方案：AKShare Primary + efinance Fallback

## 1. 背景

当前持仓录入需要用户手动填写证券代码和名称，体验较差；同时现有 DSA 对 ETF、场外基金覆盖不足。

系统后续需要支持：

- A 股、ETF、场外基金统一搜索；
- 实时或准实时行情；
- 股票 / ETF 历史行情；
- 场外基金净值与历史净值；
- 主数据源异常时自动切换备用数据源；
- 用户自行启用、配置和调整多个数据源；
- 后续接入 Tushare、RQData、JQData 或商业数据源；
- Portfolio、Risk、Backtest、Alert、AI 等业务模块不依赖具体 Provider。

因此市场数据能力统一抽象为：

```text
Instrument
    +
Provider
    +
Capability Router
```

## 2. 核心目标

1. 建立统一 `Instrument` 标的模型。
2. 当前默认使用免费、覆盖广的数据源。
3. 提供一个覆盖股票、ETF、场外基金的备用 Provider。
4. Provider 按“能力 + 标的类型”路由。
5. 支持 Provider 自动 Fallback。
6. 支持最近数据缓存降级。
7. 用户可启用、停用、测试、排序数据源。
8. 后续新增 Provider 时不修改 Portfolio、Risk、Backtest 等业务代码。
9. 所有行情结果均保留数据来源、更新时间和新鲜度信息。

## 3. 非目标

当前阶段不实现：

- 券商交易接口；
- Level-2 行情；
- 交易所级低延迟行情；
- 港股、美股、期货、期权完整支持；
- 商业数据授权体系；
- 字段级多数据源混合；
- Elasticsearch；
- 多地域高可用行情集群。

## 4. 数据源决策

### 4.1 默认数据源

| Provider | 角色 | 定位 |
|---|---|---|
| AKShare | Primary | 默认主数据源 |
| efinance | Fallback | 默认备用数据源 |
| DSA | Optional | 股票分析能力 |
| Tushare / RQData / JQData | Future | 用户自行配置的增强 / 专业 Provider |

### 4.2 AKShare

主要承担：

- A 股标的与行情；
- ETF 标的与行情；
- 场外基金主数据；
- 场外基金净值；
- 股票 / ETF 历史数据；
- 后续可扩展的指数、债券等数据。

当前定位：

```text
AKShare = DEFAULT PRIMARY PROVIDER
```

### 4.3 efinance

主要承担 AKShare 的备用能力：

- A 股行情；
- A 股历史行情；
- ETF 行情 / 历史行情；
- 场外基金净值 / 历史净值；
- 基金相关基础数据。

当前定位：

```text
efinance = DEFAULT FALLBACK PROVIDER
```

### 4.4 已知限制

AKShare 和 efinance 的部分国内证券 / 基金数据可能依赖相同或相关的东方财富上游，因此：

```text
AKShare + efinance
```

可以覆盖：

- SDK / 实现层异常；
- 单个库版本兼容问题；
- 单个 Provider 解析失败；
- 部分接口异常。

但不能保证覆盖：

- 东方财富整体接口异常；
- 同一 IP 被上游限流；
- 上游协议整体变化；
- 网络层对同一上游不可达。

因此当前双源方案定位为：

> 免费 MVP 阶段的功能冗余，而不是严格意义上的完全异构高可用。

未来如用户配置 Tushare、RQData 等 Provider，可进一步形成真正异构的数据源路由。

## 5. 总体架构

```text
Web / Electron / React Native
            │
            ▼
        NestJS API
            │
            ▼
┌──────────────────────────────┐
│      Market Data Domain      │
│                              │
│ Instrument Service           │
│ Quote Service                │
│ History Service              │
│ Fund Service                 │
│ Provider Router              │
└──────────────┬───────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
 PostgreSQL           Redis
 标的/映射/配置      行情/健康状态
      │
      └────────┬────────┘
               ▼
     Python Market Data Sidecar
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   AKShare  efinance   Future
   Primary  Fallback   Provider
```

### 5.1 NestJS 负责

- 对前端提供统一 API；
- Provider Router；
- Provider Fallback；
- Provider 配置；
- 路由优先级；
- 缓存；
- 健康状态；
- 熔断；
- 权限与日志。

### 5.2 Python Sidecar 负责

- AKShare Adapter；
- efinance Adapter；
- 调用 Python SDK；
- Provider 原始数据转换；
- Provider 错误标准化；
- Provider Health Check。

前端和业务模块禁止直接调用 AKShare / efinance。

## 6. Instrument 统一模型

不要使用 `Stock` 表示所有投资标的。

```ts
type InstrumentType =
  | 'STOCK'
  | 'ETF'
  | 'LOF'
  | 'MUTUAL_FUND'
  | 'INDEX'
  | 'BOND'
  | 'CONVERTIBLE_BOND';

type PriceMode = 'MARKET_PRICE' | 'NAV';

interface Instrument {
  id: string;
  canonicalSymbol: string;
  code: string;
  name: string;
  type: InstrumentType;
  exchange?: 'SSE' | 'SZSE' | 'BSE';
  currency: 'CNY';
  priceMode: PriceMode;
  pinyin?: string;
  pinyinInitials?: string;
  active: boolean;
}
```

### 6.1 canonicalSymbol

内部唯一标识不直接使用六位代码。

推荐：

```text
CN:SSE:STOCK:600519
CN:SSE:ETF:510300
CN:FUND:MUTUAL_FUND:000001
```

UI 显示仍使用：

```text
600519.SH
510300.SH
000001
```

避免 `000001` 股票与 `000001` 场外基金发生冲突。

## 7. Provider Symbol Mapping

不同 Provider 可能使用不同标识方式。

```ts
interface InstrumentProviderMapping {
  instrumentId: string;
  providerId: string;
  externalSymbol: string;
  externalMarket?: string;
  externalType?: string;
  enabled: boolean;
}
```

禁止把 AKShare / efinance 特有代码格式写进 `Instrument` 主模型。

## 8. Provider Capability

Provider 能力必须显式声明。

```ts
type MarketDataCapability =
  | 'INSTRUMENT_LIST'
  | 'INSTRUMENT_SEARCH'
  | 'REALTIME_QUOTE'
  | 'DAILY_BAR'
  | 'MINUTE_BAR'
  | 'FUND_NAV'
  | 'FUND_NAV_HISTORY'
  | 'FUNDAMENTALS';

interface ProviderCapability {
  capability: MarketDataCapability;
  instrumentTypes: InstrumentType[];
  enabled: boolean;
  experimental?: boolean;
}
```

### 8.1 默认能力矩阵

| Capability | 类型 | AKShare | efinance |
|---|---|---:|---:|
| 标的主数据 | STOCK | ✅ | ✅ / 辅助 |
| 标的主数据 | ETF | ✅ | ✅ / 辅助 |
| 标的主数据 | MUTUAL_FUND | ✅ | ✅ / 辅助 |
| 实时行情 | STOCK | ✅ Primary | ✅ Fallback |
| 实时行情 | ETF | ✅ Primary | ✅ Fallback |
| 日线 | STOCK | ✅ Primary | ✅ Fallback |
| 日线 | ETF | ✅ Primary | ✅ Fallback |
| 基金 NAV | MUTUAL_FUND | ✅ Primary | ✅ Fallback |
| 基金历史 NAV | MUTUAL_FUND | ✅ Primary | ✅ Fallback |

实际 Capability 必须通过 Provider Contract Test 后再启用。

## 9. Provider Interface

```ts
interface MarketDataProvider {
  readonly id: string;

  getCapabilities(): Promise<ProviderCapability[]>;

  listInstruments?(
    options?: ListInstrumentOptions
  ): Promise<ProviderInstrument[]>;

  getQuotes?(
    instruments: ProviderInstrumentRef[]
  ): Promise<ProviderQuote[]>;

  getBars?(
    instrument: ProviderInstrumentRef,
    options: BarQuery
  ): Promise<ProviderBar[]>;

  getFundNav?(
    instrument: ProviderInstrumentRef
  ): Promise<ProviderFundNav>;

  getFundNavHistory?(
    instrument: ProviderInstrumentRef,
    options: DateRange
  ): Promise<ProviderFundNav[]>;

  healthCheck(): Promise<ProviderHealth>;
}
```

新增 Provider 时原则上只需要：

```text
1. 实现 Adapter
2. 声明 Capability
3. 注册 Provider
4. 提供 Config Schema
```

## 10. Capability Router

Router 不使用一个全局 Provider 处理所有数据。

真正路由维度：

```text
Capability + InstrumentType
```

例如：

```text
REALTIME_QUOTE + STOCK
REALTIME_QUOTE + ETF
FUND_NAV + MUTUAL_FUND
DAILY_BAR + ETF
```

## 11. 默认路由

```yaml
REALTIME_QUOTE:
  STOCK:
    - AKSHARE
    - EFINANCE
    - CACHE
  ETF:
    - AKSHARE
    - EFINANCE
    - CACHE

DAILY_BAR:
  STOCK:
    - AKSHARE
    - EFINANCE
  ETF:
    - AKSHARE
    - EFINANCE

FUND_NAV:
  MUTUAL_FUND:
    - AKSHARE
    - EFINANCE
    - CACHE

FUND_NAV_HISTORY:
  MUTUAL_FUND:
    - AKSHARE
    - EFINANCE

INSTRUMENT_LIST:
  STOCK:
    - AKSHARE
    - EFINANCE
  ETF:
    - AKSHARE
    - EFINANCE
  MUTUAL_FUND:
    - AKSHARE
    - EFINANCE
```

## 12. 用户配置后的路由

未来用户启用 Tushare：

```yaml
REALTIME_QUOTE:
  STOCK:
    - TUSHARE
    - AKSHARE
    - EFINANCE

FUND_NAV:
  MUTUAL_FUND:
    - TUSHARE
    - AKSHARE
    - EFINANCE
```

Portfolio、Risk、Backtest 无需修改。

## 13. Fallback

```text
Request
   │
   ▼
Provider Router
   │
   ▼
AKShare
   │
   ├── Success ─────────────→ Return
   │
   └── Failure / Timeout
          │
          ▼
       efinance
          │
          ├── Success ──────→ Return
          │
          └── Failure
                 │
                 ▼
             Redis Cache
                 │
          ┌──────┴──────┐
          ▼             ▼
        STALE       UNAVAILABLE
```

## 14. 禁止字段级混源

禁止：

```text
price  = AKShare
volume = efinance
high   = AKShare
low    = efinance
```

一次行情结果尽量全部来自同一个 Provider，Provider 整体失败后再切换备用 Provider。

## 15. Quote 标准格式

```ts
interface Quote {
  instrumentId: string;
  price: number;
  previousClose?: number;
  open?: number;
  high?: number;
  low?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  amount?: number;
  asOf: string;
  provider: string;
  fallbackUsed: boolean;
  freshness: 'FRESH' | 'STALE';
}
```

必须保留：

```text
provider
asOf
fallbackUsed
freshness
```

## 16. Provider Health

```ts
type ProviderStatus =
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'ERROR'
  | 'DISABLED';

interface ProviderHealth {
  status: ProviderStatus;
  latencyMs?: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  message?: string;
}
```

## 17. Timeout / Retry / Circuit Breaker

推荐默认：

```text
Timeout:
2 ~ 5 秒，Provider 可单独配置

Retry:
最多 1 次，仅网络异常 / Timeout

Circuit Breaker:
连续失败达到阈值后临时熔断

Recovery:
半开状态探测恢复
```

禁止对免费数据源无限重试。

## 18. Instrument Sync

标的搜索不实时查询上游。

正确流程：

```text
AKShare / efinance
        │
        ▼
 Instrument Sync
        │
        ▼
   PostgreSQL
        │
        ▼
  Local Search API
```

同步策略：

- 首次启动同步；
- 每天非交易时段同步；
- AKShare 为默认主同步源；
- AKShare 同步失败时尝试 efinance；
- 两者均失败则保留上一版本；
- 支持新增、退市、改名；
- 保存拼音 / 拼音首字母。

## 19. 标的搜索

支持：

```text
600519
600519.SH
贵州茅台
茅台
gzmt
guizhoumaotai
```

MVP 使用：

```text
PostgreSQL + pg_trgm
```

暂不引入 Elasticsearch。

## 20. 持仓录入

当前：

```text
账户
证券代码
名称（可选）
数量
成本价
```

改为：

```text
账户

标的
[ 搜索代码 / 名称 / 拼音 ]

数量 / 份额
成本
```

搜索结果：

```text
贵州茅台          600519.SH    股票
沪深300ETF       510300.SH    ETF
华夏成长混合A     000001       场外基金
```

用户选择后只保存 `instrumentId`，名称、类型、交易所均来自 Instrument。

## 21. Redis

Redis 负责：

- 最新行情；
- Provider Health；
- Circuit Breaker；
- Provider 短期缓存；
- Instrument Sync Lock。

Key 示例：

```text
quote:{instrumentId}
provider-health:{providerId}
provider-circuit:{providerId}
```

## 22. PostgreSQL

PostgreSQL 负责：

- Instrument；
- InstrumentProviderMapping；
- DataSourceConfig；
- ProviderRoute；
- 历史行情（需要本地持久化时）；
- 场外基金 NAV 历史。

## 23. 行情采集

前端不直接访问数据源：

```text
AKShare / efinance
        │
        ▼
Market Data Collector
        │
        ▼
      Redis
        │
        ▼
      NestJS
        │
        ▼
   所有客户端
```

优势：

- 减少上游请求；
- 降低限流风险；
- 统一刷新时点；
- 同一客户端看到的数据更一致；
- 更容易做 Fallback。

## 24. Python Sidecar

建议：

```text
apps/
  api/
    NestJS

services/
  market-data-python/
    app/
      providers/
        akshare/
        efinance/
      normalize/
      health/
      main.py
```

内部 API：

```http
GET  /providers/akshare/instruments
POST /providers/akshare/quotes
GET  /providers/akshare/funds/{symbol}/nav

GET  /providers/efinance/instruments
POST /providers/efinance/quotes
GET  /providers/efinance/funds/{symbol}/nav

GET  /providers/{provider}/health
```

## 25. Market Data API

### 标的搜索

```http
GET /api/instruments/search?q=茅台&type=STOCK,ETF
```

### 实时行情

```http
GET /api/market/quotes?instrumentIds=CN:SSE:STOCK:600519
```

### 历史行情

```http
GET /api/market/instruments/{instrumentId}/bars?period=1d&start=2026-01-01&end=2026-08-17
```

### 基金 NAV

```http
GET /api/market/funds/{instrumentId}/nav
```

### 数据源配置

```http
GET   /api/data-sources
POST  /api/data-sources/{id}/test
PATCH /api/data-sources/{id}
GET   /api/data-source-routing
PUT   /api/data-source-routing
```

## 26. 数据源设置页

入口：

```text
设置
└── 数据源
```

AKShare：

```text
AKShare
● 已启用

角色：主数据源
类型：免费 / 无需凭证

股票
ETF
场外基金
实时行情
历史行情
基金净值

状态：正常

[测试连接]
```

efinance：

```text
efinance
● 已启用

角色：备用数据源
类型：免费 / 无需凭证

股票
ETF
场外基金
实时行情
历史行情
基金净值

状态：正常

[测试连接]
```

未来：

```text
Tushare
○ 未启用

Token
[••••••••••••]

[测试连接]
```

## 27. 数据源优先级

优先级不是全局唯一排序，而是按 Capability 设置。

```text
股票实时行情
☰ AKShare
☰ efinance
```

```text
ETF 实时行情
☰ AKShare
☰ efinance
```

```text
场外基金 NAV
☰ AKShare
☰ efinance
```

未来：

```text
股票实时行情
☰ Tushare
☰ AKShare
☰ efinance
```

## 28. Provider 配置模型

```ts
interface DataSourceConfig {
  id: string;
  providerType:
    | 'AKSHARE'
    | 'EFINANCE'
    | 'DSA'
    | 'TUSHARE'
    | 'RQDATA'
    | 'CUSTOM';
  name: string;
  enabled: boolean;
  endpoint?: string;
  encryptedCredentials?: string;
  timeoutMs: number;
  config: Record<string, unknown>;
}

interface ProviderRoute {
  capability: MarketDataCapability;
  instrumentType: InstrumentType;
  providers: string[];
}
```

## 29. 凭证安全

未来带 Token / 用户名 / 密码的 Provider：

- 前端不保存明文；
- 服务端加密；
- API 仅返回 masked value；
- 日志禁止输出完整凭证；
- Test Connection 禁止输出凭证；
- 删除 Provider 时同步清理 Credential。

## 30. DSA 定位

DSA 不作为统一行情中心。

定位：

```text
DSA Provider
└── 股票分析能力
```

可继续复用：

- 股票分析；
- DSA 特有指标；
- DSA 特有分析结果。

以下统一由 Market Data Domain 管理：

```text
Instrument
Quote
Bar
Fund NAV
Provider Routing
```

## 31. 错误与降级展示

### Fresh

```text
¥1,483.20
14:31:08
```

### Fallback

```text
¥1,483.20
14:31:08

当前使用备用数据源
```

### Stale

```text
¥1,483.20
最后更新 14:25:13

行情暂时不可用，当前显示最近数据
```

### Unavailable

```text
--
行情暂不可用
```

Provider 原始错误只进入日志 / 诊断页。

## 32. Provider Contract Test

AKShare 和 efinance 必须通过统一测试：

```text
healthCheck
getCapabilities
listInstruments
getQuotes
getBars
getFundNav
getFundNavHistory
normalization
timeout
invalid symbol
upstream unavailable
```

## 33. 标的测试集

至少覆盖：

```text
600519    A 股 / SSE
000001    A 股 / SZSE
510300    ETF / SSE
159915    ETF / SZSE
000001    场外基金
```

验证：

- 股票 `000001` 与基金 `000001` 不冲突；
- SSE / SZSE 正确；
- ETF 类型正确；
- Provider Mapping 正确；
- AKShare / efinance 返回值可归一化成同一 DTO。

## 34. Fallback Test

模拟：

```text
AKShare Timeout
```

期望：

```text
AKShare
   ↓
efinance
```

返回：

```ts
provider = 'EFINANCE';
fallbackUsed = true;
freshness = 'FRESH';
```

再模拟：

```text
AKShare failure
+
efinance failure
```

有缓存：

```text
freshness = 'STALE'
```

无缓存：

```text
UNAVAILABLE
```

## 35. 同源故障测试

由于两个 Provider 可能共享部分东方财富上游，需要额外验证：

```text
上游整体不可用
IP 限流
网络不可达
```

此时不能不断在：

```text
AKShare ↔ efinance
```

之间重复切换。

应：

```text
AKShare failure
↓
efinance failure
↓
Circuit Breaker
↓
Cache
```

避免形成请求风暴。

## 36. 实施阶段

### Phase 1：统一模型 + 双 Provider

实现：

- Instrument；
- InstrumentProviderMapping；
- MarketDataProvider；
- ProviderCapability；
- ProviderRouter；
- AKShareProvider；
- efinanceProvider；
- Python Sidecar；
- PostgreSQL Instrument Sync；
- Local Search；
- Redis Quote Cache；
- 股票 / ETF / 基金 Fallback。

默认：

```text
STOCK
AKShare → efinance → Cache

ETF
AKShare → efinance → Cache

MUTUAL_FUND NAV
AKShare → efinance → Cache
```

### Phase 2：Provider 管理

实现：

- 数据源设置页；
- Provider 启用 / 停用；
- Test Connection；
- Capability 展示；
- Provider Health；
- Capability Routing；
- 拖拽优先级；
- Circuit Breaker；
- 诊断日志。

### Phase 3：扩展数据源

优先：

```text
Tushare
RQData
JQData
其他商业数据源
Custom HTTP Provider
```

## 37. MVP 验收标准

### Instrument

- [ ] 支持 A 股搜索。
- [ ] 支持 ETF 搜索。
- [ ] 支持场外基金搜索。
- [ ] 支持代码搜索。
- [ ] 支持名称搜索。
- [ ] 支持拼音 / 首字母搜索。
- [ ] 股票与基金相同代码不冲突。
- [ ] 持仓仅保存 `instrumentId`。

### Market Data

- [ ] AKShare 可获取股票行情。
- [ ] AKShare 可获取 ETF 行情。
- [ ] AKShare 可获取场外基金 NAV。
- [ ] AKShare 失败后股票自动切换 efinance。
- [ ] AKShare 失败后 ETF 自动切换 efinance。
- [ ] AKShare 失败后基金 NAV 自动切换 efinance。
- [ ] Quote 包含 Provider。
- [ ] Quote 包含 `asOf`。
- [ ] Quote 包含 `freshness`。
- [ ] 两个 Provider 都失败时使用最近缓存。

### Provider

- [ ] AKShare 与 efinance 实现统一 Contract。
- [ ] Capability 显式声明。
- [ ] Router 按 Capability + InstrumentType 工作。
- [ ] Provider 可启用 / 停用。
- [ ] Provider 支持 Health Check。
- [ ] Provider 支持独立 Timeout。
- [ ] 业务层不直接依赖 AKShare / efinance。

### 扩展性

新增 Provider 时不修改：

```text
Portfolio
Risk
Backtest
Alert
AI
```

## 38. 最终架构

```text
                   Investment OS
                         │
                         ▼
                  Market Data API
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
      Instrument Service        Market Service
             │                       │
             ▼                       ▼
        PostgreSQL                  Redis
             │                       │
             └───────────┬───────────┘
                         ▼
                  Capability Router
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       AKShare        efinance          DSA
       Primary        Fallback       Optional
                                          │
                                          ▼
                                     股票分析

                         Future
                           │
               Tushare / RQData / ...
```

## 39. 最终决策

当前默认：

```text
Primary:
AKShare

Fallback:
efinance

Last Resort:
Redis Cache
```

能力路由：

```text
股票实时行情
AKShare → efinance → Cache

ETF 实时行情
AKShare → efinance → Cache

股票历史行情
AKShare → efinance

ETF 历史行情
AKShare → efinance

场外基金 NAV
AKShare → efinance → Cache

场外基金历史 NAV
AKShare → efinance
```

架构原则：

> 业务依赖能力，不依赖 Provider。

当前 `AKShare + efinance` 的目标是：

> 免费、覆盖股票 + ETF + 场外基金，并提供基础 Fallback 能力。

同时明确接受二者部分能力可能存在的同源风险。

未来如需更高可靠性或商业化：

> 通过 Capability Router 引入 Tushare、RQData 或正式授权数据源，无需重构业务层。
