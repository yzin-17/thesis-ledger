# 架构与开源复用方案

## 1. 架构决策

项目采用：

> **Investment OS 独立主仓 + daily_stock_analysis Fork 服务 + 外部数据 Provider**

三者职责明确分离。

```text
Investment OS
= 产品主体 + 用户资产事实源

DSA Fork
= 金融分析能力服务

External Provider
= 原始外部数据来源
```

不直接把 `daily_stock_analysis` 作为 Investment OS 主仓继续开发，也不把官方 DSA Docker 镜像作为不可修改的长期黑盒依赖。

原因：

1. Investment OS 的长期核心是个人资产、交易流水、风险规则和投资行为，这些数据模型必须完全自主控制。
2. DSA 已经具备大量成熟行情、技术分析、筹码、通知和 AI 能力，完全重写会造成明显重复开发。
3. DSA 后续仍可能被 InStock、Qlib、自研 Quant Worker 等能力替换或补充，因此它不能成为整个系统的架构中心。
4. 将两者通过稳定 Contract 解耦，可以同时获得开源复用效率和长期架构自主权。

---

# 2. 总体架构

```text
                    ┌─────────────────┐
                    │  React Native   │
                    │  iOS / Android  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Electron + React│
                    │    Desktop      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Investment OS  │
                    │     NestJS      │
                    │                 │
                    │ System of Record│
                    └────────┬────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
       PostgreSQL          Redis         DSA Adapter
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │    DSA Fork     │
                                    │ Python/FastAPI  │
                                    └────────┬────────┘
                                             │
                     ┌───────────────────────┼────────────────────┐
                     ▼                       ▼                    ▼
                  AKShare                easy-tdx               AData
                                             │
                                             │
                                      后续其他 Provider
```

后期进一步扩展：

```text
                    Investment OS
                         │
               Quant Service Contract
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      DSA Fork       InStock Module    Qlib
          │
          ↓
     Vibe Research
```

Investment OS 不依赖具体 Quant 实现。

---

# 3. 主仓职责

Investment OS 是整个产品的唯一业务主仓。

建议结构：

```text
investment-os/
├── apps/
│   ├── mobile/
│   ├── desktop/
│   └── server/
│
├── packages/
│   ├── domain/
│   ├── schemas/
│   ├── api-client/
│   ├── risk-types/
│   ├── strategy-types/
│   └── shared/
│
├── services/
│   └── dsa-adapter/
│
└── infra/
    └── docker/
```

长期原则：

> **任何即使没有 DSA，仍必须存在的功能，都应该属于 Investment OS。**

因此以下能力必须放在主仓。

### Account

```text
Account
Broker
Platform
Currency
AccountType
```

### Ledger

```text
BUY
SELL
DIVIDEND
FEE
TAX
INTEREST
TRANSFER_IN
TRANSFER_OUT
CASH_DEPOSIT
CASH_WITHDRAW
BONUS
SPLIT
MERGE
ADJUSTMENT
```

Ledger 是唯一真实资产事实源。

```text
Ledger
   ↓
Position
   ↓
Portfolio
```

不得长期维护两个独立 Portfolio。

---

# 4. Investment OS 负责的领域

## 4.1 资产与账户

Investment OS：

```text
Account
Ledger
Position
Portfolio
Portfolio Snapshot
Asset Allocation
Performance
```

DSA 不作为这些数据的最终事实源。

即使 MVP 阶段为了快速验证复用了 DSA Portfolio 能力，也只属于过渡实现。

---

## 4.2 Screenshot Import

完整流程属于 Investment OS：

```text
Screenshot
↓
Upload
↓
Vision Extraction
↓
Import Draft
↓
Asset Matching
↓
Validation
↓
User Review
↓
Commit
↓
Ledger
```

其中 Vision 可以调用 DSA 或其他模型服务：

```text
Investment OS
      │
      ▼
DSA / Vision Provider
      │
      ▼
Structured Candidate
```

但：

> Vision 返回结果永远只能是候选数据，不能直接修改 Ledger。

Investment OS 负责：

```text
confidence
asset match
duplicate detection
amount validation
dry-run
confirm
rollback
```

---

# 5. Risk Engine

风险规则属于 Investment OS。

```text
RiskRule
↓
RiskEvaluation
↓
RiskEvent
↓
Notification
```

Rule 类型：

```text
Price
PnL
Drawdown
Indicator
Chip
Position
Portfolio
Event
Strategy
```

例如：

```text
price
   ↓
DSA Quote

MA20
   ↓
DSA Indicator

ChipPeak
   ↓
DSA Chip

Position Cost
   ↓
Investment OS

Portfolio Weight
   ↓
Investment OS
```

最后：

```text
Investment OS Risk Engine
```

负责判断。

因此 DSA 可以：

```text
计算 MA
计算 RSI
计算筹码
获取实时价格
```

但不应决定：

```text
用户是否违反止损计划
用户仓位是否过高
是否创建正式 RiskEvent
```

---

# 6. Notification

Notification 的业务编排属于 Investment OS。

```text
RiskEvent
↓
Notification Policy
↓
Channel
```

Investment OS 负责：

```text
severity
routing
cooldown
dedup
quiet hours
digest
delivery result
```

DSA 已有成熟飞书等通知实现，可在早期直接复用底层 Channel Adapter。

长期：

```text
NotificationProvider
├── Feishu
├── WebPush
├── Email
└── Webhook
```

应该由 Investment OS 统一管理。

换句话说：

```text
DSA Feishu implementation
       ↓
可以复用

DSA Notification business logic
       ↓
不成为长期核心
```

---

# 7. DSA Fork 职责

DSA 定位为：

> **Market / Quant / AI Capability Service**

主要负责以下能力。

## 7.1 Market Data

```text
Quote
Kline
Financial
Fundamental
Money Flow
News
Announcement
```

继承 DSA 多 Provider 和 fallback 能力。

Investment OS 只能通过统一接口使用：

```ts
interface MarketService {
  getQuote(symbol: string): Promise<Quote>;

  getBars(
    symbol: string,
    timeframe: Timeframe,
    range: TimeRange,
  ): Promise<Bar[]>;

  getFundamentals(symbol: string): Promise<Fundamentals>;
}
```

不得让业务模块调用：

```text
AKShare
easy-tdx
AData
```

---

# 8. Indicator Engine

优先使用现有成熟实现。

例如：

```text
MA
EMA
MACD
RSI
ATR
KDJ
BOLL
CCI
OBV
```

API：

```text
POST /quant/indicators
```

输入：

```json
{
  "symbol": "600519.SH",
  "timeframe": "1d",
  "indicators": ["MA20", "MA60", "RSI14"]
}
```

输出：

```json
{
  "symbol": "600519.SH",
  "marketTime": "...",
  "provider": "...",
  "values": {}
}
```

Investment OS 不关心指标具体由：

```text
DSA
InStock
TA-Lib
自研
```

中的哪个实现。

---

# 9. Chip Engine

筹码属于 Quant Service，而不属于 Investment OS 核心资产领域。

```text
OHLCV
turnover
floatShares
       ↓
Chip Engine
       ↓
ChipDistribution
```

统一 Contract：

```ts
interface ChipDistribution {
  symbol: string;
  date: string;

  buckets: {
    price: number;
    weight: number;
  }[];

  averageCost: number;

  mainPeak?: number;
  secondaryPeak?: number;

  profitRatio: number;

  range70: [number, number];
  range90: [number, number];

  concentration?: number;
}
```

V0.1：

```text
DSA 实现
```

同时通过 Spike 与：

```text
InStock CYQ
第三方软件
```

进行 Benchmark。

若 InStock 明显更合理：

```text
Contract 不变
↓
替换 Implementation
```

客户端和 Risk Engine 不受影响。

---

# 10. AI

AI 能力可以继续复用 DSA，但数据访问必须反转。

错误：

```text
AI
↓
读取 DSA Portfolio
↓
生成分析
```

正确：

```text
AI
↓
Investment OS Tool
↓
Portfolio / Risk / Ledger
```

以及：

```text
AI
↓
Quant Tool
↓
Quote / Chip / Indicator
```

例如：

```text
getPortfolio
getPositions
getRisk

getQuote
getKline
getIndicators
getChipDistribution

getFinancials
getNews
getAnnouncements
```

其中：

```text
Portfolio / Position / Risk
    → Investment OS

Quote / Indicator / Chip
    → DSA
```

AI 不需要知道底层区别。

---

# 11. 数据所有权

这是整个架构最重要的规则。

## Investment OS PostgreSQL

保存：

```text
User
Account
Ledger
Position
Snapshot
Import
RiskRule
RiskEvent
Journal
Strategy
Backtest Metadata
Notification
```

---

## DSA 数据

只允许保存：

```text
Market Cache
Analysis Cache
Technical Data
AI Context
Provider State
Research Result
```

不得把 DSA 数据库作为：

```text
Account Source of Truth
Ledger Source of Truth
Portfolio Source of Truth
```

---

# 12. API 边界

## Investment OS API

例如：

```text
/accounts

/ledger
/transactions

/positions
/portfolio

/imports
/imports/screenshot

/risk-rules
/risk-events

/journal

/strategies
/backtests

/notifications
```

这些全部由主仓提供。

---

## Quant API

Investment OS 通过 Adapter 调用：

```text
/market/quote
/market/bars

/quant/indicators
/quant/chip

/research/stock
/research/news
/research/financials
```

不要把 DSA 的原始 API 直接暴露给客户端。

必须：

```text
Client
  ↓
Investment OS
  ↓
DSA Adapter
  ↓
DSA
```

而不是：

```text
Mobile ─────────→ NestJS
   └────────────→ DSA

Desktop ────────→ NestJS
    └───────────→ DSA
```

否则客户端会重新和 DSA 强耦合。

---

# 13. DSA Adapter

Investment OS 增加明确的防腐层：

```text
DsaAdapter
```

负责：

```text
DSA Request
DSA Response
      ↓
Normalization
      ↓
Investment OS Domain Model
```

例如 DSA 返回：

```json
{
  "code": "600519",
  "price": 1418.22
}
```

Adapter 转换成：

```ts
Quote {
  symbol: "600519.SH",
  price: 1418.22,
  currency: "CNY",
  marketTime: ...,
  provider: ...
}
```

业务代码永远不知道 DSA 原始返回结构。

这样未来：

```text
DSA
↓
Custom Quant Worker
```

只需要更换 Adapter。

---

# 14. Docker 部署

开发阶段：

```yaml
services:

  postgres:
    ...

  redis:
    ...

  investment-os:
    ...

  dsa:
    ...
```

逻辑：

```text
investment-os
      │
      └── http://dsa:8000
```

外部只暴露：

```text
Investment OS API
```

DSA 默认只在 Docker Network 中开放。

避免：

```text
Internet
  ↓
DSA API
```

---

# 15. 为什么使用自己的 DSA Fork

部署不直接固定官方：

```text
daily-stock-analysis:latest
```

而使用：

```text
investment-os-dsa:<version>
```

来源：

```text
upstream
ZhuLinsen/daily_stock_analysis
        │
        ▼
      Fork
        │
        ▼
investment-os-dsa
```

原因：

```text
Bug Fix
Provider Patch
API Contract
Chip Extension
Vision Extension
AI Tool
Security Fix
```

都可能需要自己的改动。

---

# 16. Upstream 管理

Git：

```text
origin
→ 自己 Fork

upstream
→ ZhuLinsen/daily_stock_analysis
```

原则：

### 尽可能保留上游结构

不要因为代码风格：

```text
重排目录
大规模重命名
替换框架
```

### 自己的扩展尽量隔离

例如：

```text
investment_os/
adapters/
extensions/
```

或通过少量 hook 接入。

目标：

> 降低 upstream merge 成本。

---

# 17. InStock 的位置

InStock 不是一个独立部署产品。

只作为：

> Quant Capability Source

优先研究：

```text
Chip
Indicator
K-line Pattern
Screener
Strategy Template
```

吸收方式：

```text
算法
模块
设计
测试案例
```

而不是：

```text
docker compose
├── Investment OS
├── DSA
└── 整个 InStock
```

避免同时运行多个功能高度重叠的平台。

---

# 18. Vibe-Trading 的位置

V0.5 前：

```text
不部署
```

V0.5+ 根据 Strategy Research 需要决定：

```text
参考设计
或
独立 Research Worker
```

重点借鉴：

```text
PIT
OOS
Walk Forward
Monte Carlo
Shadow Account
Agent Research Loop
```

不能成为账户事实源。

---

# 19. Strategy / Backtest

Strategy 的定义归 Investment OS：

```text
Strategy
StrategyVersion
StrategyRun
BacktestJob
BacktestResult
```

具体计算可以交给 Worker：

```text
Investment OS
      │
      ▼
Backtest Contract
      │
      ▼
Quant Worker
```

未来：

```text
DSA
Vibe
AKQuant
LEAN
自研
```

都能成为实现。

Strategy Schema 不依赖某个引擎：

```text
Universe

EntrySignal
ExitSignal

StopLoss
TakeProfit

Sizing

ExecutionModel
CostModel

RiskConstraint

Benchmark
```

---

# 20. 最终模块归属

| 模块                  | Investment OS |    DSA Fork |          其他 |
| ------------------- | ------------: | ----------: | ----------: |
| User                |             ✓ |             |             |
| Account             |             ✓ |             |             |
| Ledger              |             ✓ |             |             |
| Position            |             ✓ |             |             |
| Portfolio           |             ✓ |             |             |
| Snapshot            |             ✓ |             |             |
| Screenshot Workflow |             ✓ |      Vision |             |
| Asset Matching      |             ✓ |             |             |
| Quote               |      Contract |           ✓ |    Provider |
| Kline               |      Contract |           ✓ |    Provider |
| Financial           |      Contract |           ✓ |    Provider |
| Indicator           |      Contract |           ✓ | InStock 可替换 |
| Chip                |      Contract |           ✓ | InStock 可替换 |
| RiskRule            |             ✓ |             |             |
| RiskEvent           |             ✓ |             |             |
| Alert Evaluation    |             ✓ |      提供行情输入 |             |
| Feishu              |            编排 | Adapter 可复用 |             |
| AI Tools            |             ✓ |   AI Engine |             |
| Journal             |             ✓ |             |             |
| Strategy Definition |             ✓ |             |             |
| Backtest Job        |             ✓ |      Worker |   Vibe/LEAN |
| Behavior Analysis   |             ✓ |          AI |        Vibe |
| Execution           |   后期 Contract |             |  vn.py/LEAN |

---

# 21. MVP 架构

V0.1 不要求所有职责立即迁移完成。

允许：

```text
DSA Portfolio
DSA Alert
DSA Notification
```

暂时帮助验证产品。

但必须明确：

```text
Experimental Implementation
≠
Long-term Ownership
```

V0.1 的关键不是重构，而是验证：

```text
Screenshot
↓
Portfolio
↓
Quote
↓
PnL
↓
Risk
↓
Feishu
↓
AI
```

闭环是否有价值。

---

# 22. 演进路线

## V0.1

```text
Investment OS Shell
+
DSA Fork
```

Investment OS 先承担：

```text
API Gateway
Screenshot Workflow
Domain Contract
客户端接口
```

最大化复用 DSA。

---

## V0.2

把 Market Contract 稳定下来：

```text
Quote
Bar
Asset
Indicator
Chip
```

建立：

```text
Provider Health
Freshness
Completeness
Fallback
```

---

## V0.3

正式把：

```text
Account
Ledger
Position
Portfolio
```

迁移到 Investment OS。

NestJS + PostgreSQL 成为资产事实源。

---

## V0.4

迁移：

```text
RiskRule
RiskEvent
Notification Policy
```

DSA 只提供 Quant 输入。

---

## V0.5

独立 Strategy / Backtest Contract。

---

## V0.6+

逐步变成：

```text
Investment OS
    │
    ├── DSA Quant
    ├── Custom Quant
    ├── Research Worker
    └── AI Provider
```

最终 DSA 是可替换组件，而不是技术债务中心。

---

# 23. 架构原则

## 原则一

> Investment OS 拥有用户事实，DSA 拥有计算能力。

## 原则二

> Fork 是为了获得修改权，不是为了让 Fork 成为产品本身。

## 原则三

> 所有第三方服务必须通过 Contract / Adapter。

## 原则四

> 客户端只依赖 Investment OS API。

## 原则五

> 资产、收益和风险的关键数值由确定性代码产生。

## 原则六

> AI 和 Quant Worker 可以替换，Ledger 不可以。

## 原则七

> MVP 优先复用，成熟后再逐步收回核心业务所有权。

---

# 24. 最终技术栈

最终目标保持：

```text
Mobile
React Native

Desktop
Electron + React

App Core
NestJS

Database
PostgreSQL

Cache / Queue
Redis

Quant / Market / AI
Python

Infrastructure
Docker
```

因此不再纠结：

> Node 还是 Python 做所有后端？

实际架构是：

```text
TypeScript
负责产品领域

Python
负责金融计算生态
```

两者职责不同。

这也是当前项目最适合长期维护的边界。
