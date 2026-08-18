# 个人投资中台：开源项目调研与复用策略

> 调研快照：2026-07-31。GitHub Star、项目状态和许可证可能变化，实施前需再次核验。
>
> 本文是 `2026-08-18-stock-investment-os-spec.md` 的配套研究文档，重点回答：哪些功能值得借鉴、哪些组件可以直接接入、哪些项目值得 fork，以及未来各阶段该关注什么。

## 1. 结论摘要

当前最合理的策略不是从零开发，也不是直接 fork 一个量化框架，而是采用“核心域 + 专项 Worker/库”的组合：

1. **Ghostfolio：主仓 fork 的唯一强候选，但取决于 AGPL 许可策略。**
   - 与目标技术栈高度重合：NestJS + PostgreSQL + Redis + TypeScript。
   - 已具备账户、交易流水、持仓/组合、收益、导入、数据 Provider 等核心财富管理能力。
   - 最大问题是 AGPL-3.0；若未来希望闭源商业化，不宜直接以其代码作为主仓基础。
2. **daily_stock_analysis：产品功能重合度最高，适合作为 A 股 MVP 功能参考或 Sidecar，不建议在技术栈固定时作为主仓 fork。**
   - 图片持仓导入、多行情源、飞书、AI、风险提醒、自动化已经很成熟。
   - MIT 许可友好，但核心是 Python/FastAPI，与 NestJS/PostgreSQL/Redis + React Native/Electron 的目标架构差异较大。
3. **Vibe-Trading：未来 Agent、策略、回测、交易行为复盘的核心参考。**
   - Shadow Account、数据 fallback、PIT/防未来函数、策略验证、自我改进 Agent 很值得借鉴。
   - 不适合主仓 fork，适合 V0.5+ 作为研究 Worker 或设计来源。
4. **TradingAgents / FinRobot：AI 架构参考，不作为核心业务底座。**
   - TradingAgents 借鉴多角色研究、Risk/Portfolio Manager、decision log、checkpoint。
   - FinRobot 借鉴“确定性计算，LLM 负责解释”的原则。
5. **Portfolio Performance：Ledger/收益/资产配置语义的重要参考。**
   - TTWROR、IRR、税费、现金流、再平衡、证券/账户层级指标值得直接写进我们的领域模型和测试标准。
6. **QuantStats / PyPortfolioOpt / Riskfolio-Lib：优先直接作为 Python Analytics Worker 的库，而不是重写。**
7. **vn.py / Lean：只有进入模拟盘、自动交易、券商网关后再引入。**
8. **Qlib / RD-Agent：V2 高级量化、因子研究、机器学习和自动研究阶段再接入。**

## 2. 项目优先级矩阵

| 项目 | Star 快照 | 许可证 | 最值得借鉴 | 与本项目重合度 | 建议 |
|---|---:|---|---|---:|---|
| daily_stock_analysis | ~59.7k | MIT | 图片导入、A股多源行情、飞书、AI报告、告警、自动化 | 85% 产品 / 35% 架构 | 深度参考；可做 PoC fork/Sidecar |
| TradingAgents | ~95.1k | Apache-2.0 | 多 Agent、Risk/Portfolio Gate、决策日志、复盘 | 45% | AI Worker 参考 |
| Qlib | ~46.9k | MIT | 因子、ML、组合、回测、PIT 数据 | 35% | V2 研究 Worker |
| vn.py | ~44.1k | MIT | 事件引擎、模拟盘、交易网关、OMS、风控 | 35% 当前 / 75% 未来实盘 | V2/V3 接入，不 fork App |
| Vibe-Trading | ~28.9k | MIT | Agent、Shadow Account、fallback、回测验证、行为复盘 | 65% | V0.5+ 重点参考/Worker |
| Lean | ~21.0k | Apache-2.0 | 专业事件驱动回测、优化、实盘、插件式引擎 | 30% 当前 / 70% 未来 | 后期回测/执行备选 |
| RD-Agent | ~14k | MIT | 自动因子挖掘、模型优化、研究闭环 | 20% | V2/V3 |
| QUANTAXIS | ~10k | MIT | 多账户、QIFI、OMS、行情/交易全栈 | 35% | 账户/OMS 概念参考 |
| Ghostfolio | ~9.0k | AGPL-3.0 | NestJS、Postgres、Redis、Ledger、Portfolio、Provider | **90% 架构 / 75% 产品** | **条件式主仓 fork 候选** |
| FinRobot | ~7k | Apache-2.0 | 确定性计算 + LLM 解释、可追溯报告、多 Agent | 35% | AI 架构参考 |
| QuantStats | ~7k | Apache-2.0 | 收益/风险统计、图表、HTML tear sheet | 30% | 直接依赖 |
| PyPortfolioOpt | ~6k | MIT | 均值方差、Black-Litterman、HRP、CVaR | 25% | V2 直接依赖 |
| Riskfolio-Lib | ~4k | BSD-3-Clause | 多种风险度量、组合优化 | 25% | V2 直接依赖 |
| Portfolio Performance | ~4k | EPL-1.0 | Ledger、TTWROR、IRR、税费、再平衡 | 60% 领域 | 领域模型参考，不 fork |
| Hikyuu | ~3k | Apache-2.0 | A股策略系统拆分、止损、资金管理、滑点 | 40% | Backtest/Strategy 参考 |
| OpenBB | >1k | AGPL-3.0 | Provider/数据目录/API 平台化 | 25% | 架构参考，注意许可 |

> Star 只是成熟度和社区信号之一，不能替代代码质量、许可证、维护状态、测试覆盖和领域适配度评估。

## 3. Ghostfolio：最值得做 Fork Spike 的项目

仓库：https://github.com/ghostfolio/ghostfolio

### 3.1 为什么它特别重要

Ghostfolio 和其它候选最大的不同在于，它不是量化研究框架，而是长期使用的个人财富管理产品，并且底层技术非常接近已经确定的架构：

```text
Ghostfolio
├── TypeScript / Nx
├── NestJS API
├── PostgreSQL
├── Prisma
├── Redis
└── Angular Web/PWA
```

我们的目标：

```text
Investment OS
├── React Native
├── Electron + React
├── NestJS
├── PostgreSQL
└── Redis
```

因此真正需要替换的是客户端和 A 股能力，而不是整个后端基础设施。

### 3.2 可直接借鉴/复用的领域

Ghostfolio 已经有：

- User / Account / Platform
- Order（交易活动）
- AccountBalance（账户快照）
- SymbolProfile
- MarketData
- Watchlist
- Tags
- Import
- Portfolio Service
- Data Provider Interface
- Redis Cache
- Data Gathering Queue
- API Key / Auth

它的 `DataProviderInterface` 已经包含：

```ts
canHandle()
getAssetProfile()
getDividends()
getHistorical()
getQuotes()
search()
getName()
getTestSymbol()
```

这个设计和我们计划的 `MarketDataProvider` 高度一致，值得直接作为接口设计参考。

### 3.3 需要扩展的地方

Ghostfolio 的交易类型目前偏财富管理：

```text
BUY
SELL
DIVIDEND
FEE
INTEREST
LIABILITY
```

我们的 A 股 Ledger 建议扩展为：

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

另外需要新增：

- A 股股票/ETF/场外基金资产语义
- T+1、涨跌停、停复牌、除权除息
- A 股 Provider（AKShare/easy-tdx/AData）
- 截图持仓导入
- 实时 Risk Engine
- Chip Engine
- Feishu Notification Provider
- Strategy / Backtest
- AI Tool Layer
- React Native / Electron 客户端

### 3.4 是否 fork

**建议做一个技术 Spike，而不是立刻决定。**

推荐验证：

1. Fork 后保留 `apps/api`、`prisma`、核心 libs。
2. 加一个 `AshareProvider`，验证 600519 的资产搜索、报价、历史行情。
3. 加一类 A 股交易流水，验证 Portfolio 计算是否容易扩展。
4. 接一个 Electron PoC，完全绕开 Angular UI。
5. 评估把 Angular Web 删除/降级后的维护成本。

若以上 5 项顺畅，开发成本可能显著低于从零实现 Portfolio/Ledger。

### 3.5 许可证决策门槛

Ghostfolio 是 **AGPL-3.0**。AGPL 的设计目标之一，就是让通过网络使用修改版程序的用户能够获得对应源代码；因此如果未来提供网络服务且基于修改版 Ghostfolio，许可证义务需要在产品和商业模式层面提前评估。

决策：

- **项目接受开源/AGPL：** Ghostfolio 是主仓 fork 首选。
- **项目希望未来保持核心服务闭源：** 不应直接复制/修改 Ghostfolio 代码作为核心；只学习领域模型、接口和架构思想，重新实现。
- 商业化前对具体组合、部署和分发方式做正式许可证审查。

## 4. daily_stock_analysis：MVP 产品功能参考库

仓库：https://github.com/ZhuLinsen/daily_stock_analysis

这是目前功能表与我们最接近的成熟项目。

### 4.1 MVP 可直接借鉴

#### 图片持仓导入

值得复用的设计：

```text
图片
→ Vision/OCR
→ 代码/名称/持仓字段
→ 置信度
→ 标的补全
→ 用户确认
→ 导入
```

增强点：

- 多 Vision Provider fallback
- 股票代码/名称/拼音/别名补全
- 图片、CSV/Excel、剪贴板统一 Import Pipeline

我们的截图导入应沿用“识别与提交分离”的思想，严禁识别后直接修改 Ledger。

#### 多行情源

已有 AkShare、Tushare、Pytdx、Baostock 等，免费源可零配置运行。

值得借鉴：

- Provider 优先级
- fallback
- 市场能力边界
- 实时与历史源分离
- 免费源失败的明确降级，而不是静默返回错误数据

#### 通知中心

支持飞书、企业微信、Telegram、Discord、Slack、邮件。

我们未来可以增加：

- Notification Provider
- 渠道路由
- 按 severity 过滤
- cooldown
- quiet hours
- 去重 TTL
- digest 聚合
- 通知结果持久化

这些不应只写成一个 `sendFeishu()`。

#### AI 决策报告

值得借鉴的输出结构：

- 核心结论
- 评分
- 趋势
- 买卖关注位
- 风险警报
- 催化因素
- 操作检查清单

但所有价格、盈亏、指标、仓位等数值必须由确定性代码计算，AI 只负责解释。

### 4.2 不直接复制的部分

其“回测”更多用于历史 AI 推荐信号的验证，并不等价于我们规划的通用 Strategy Backtest Engine，因此不能用它替代 V0.5 的回测底座。

### 4.3 Fork 判断

优点：MIT、A股、截图导入、飞书、多源行情、AI 都已经有。

缺点：Python/FastAPI 为主，Portfolio/Ledger 不是核心，客户端和数据库架构不匹配。

结论：

- 不建议作为正式主仓 fork。
- 可 fork 做 **MVP 行为验证**。
- 更合适的是研究后把能力迁入 NestJS 核心，或暂时作为 Python Sidecar。

## 5. Vibe-Trading：策略研究与行为复盘参考

仓库：https://github.com/HKUDS/Vibe-Trading

### 5.1 最值得借鉴：Shadow Account

它已经覆盖我们原本 V0.7 想做的方向：

```text
券商/交易记录
→ 行为指标
→ 识别交易偏差
→ 提取隐含规则
→ Shadow Strategy
→ 回放/反事实比较
→ 复盘报告
```

可进入本项目规划：

- 平均持仓周期
- 胜率、盈亏比、最大回撤
- disposition effect（处置效应）
- overtrading（过度交易）
- momentum chasing（追涨）
- anchoring（锚定）
- 实际交易 vs 计划交易
- 未执行止损
- 过早止盈
- 反事实：若严格按计划执行，收益/回撤会怎样

### 5.2 数据完整性与回测安全

特别值得复制的工程原则：

- Provider 返回部分 symbol 时继续从 fallback 补齐，而不是把缺失标的静默删除。
- 所有 universe 请求要检查 completeness。
- 历史分析使用 Point-in-Time 约束。
- 明确防 look-ahead bias。
- OOS（样本外）验证。
- live 状态获取失败时 fail closed。

这些应写入我们的 Market/Backtest 验收标准。

### 5.3 Agent

后续可借鉴：

- persistent memory
- research tools
- strategy generation
- backtest feedback loop
- tool sandbox
- long-context compression

不建议把 Vibe-Trading 直接变成主应用；更适合未来形成 `research-worker`。

## 6. TradingAgents：AI 多角色与决策日志

仓库：https://github.com/TauricResearch/TradingAgents

值得借鉴的不是“让一群 Agent 炒股”，而是职责边界：

```text
Data/Tools
  ↓
Technical / Fundamental / News / Sentiment Analyst
  ↓
Bull vs Bear Debate
  ↓
Trader Proposal
  ↓
Risk Manager
  ↓
Portfolio Manager
  ↓
Final Advice
```

我们的 AI V0.6 可以简化为：

```text
Research Agent
→ Risk Critic
→ Portfolio Context
→ Final Analysis
```

后续增加：

- decision log
- 已实现收益反馈
- alpha vs benchmark 反馈
- reflection/lessons
- checkpoint/resume

AI 输出永远不直接下单。

## 7. FinRobot：AI 计算边界

仓库：https://github.com/AI4Finance-Foundation/FinRobot

最重要的一条设计原则：

> **Deterministic Compute, LLM Narration**

进入本项目的硬性约束：

以下数据只能由确定性代码产生：

- 当前价
- 成本
- 盈亏
- 收益率
- 持仓占比
- MA/MACD/RSI/ATR
- 筹码估算
- 回测指标
- 风险指标
- 估值模型数值

LLM 只负责：

- 解释
- 比较
- 总结
- 生成研究假设
- 组织报告
- 调用工具

并为 AI 报告保留数据 provenance（数据源、时间、工具输入摘要）。

## 8. Portfolio Performance：Ledger 与收益计算标准

仓库：https://github.com/portfolio-performance/portfolio

它对本项目最大的价值不是代码，而是“投资组合记账到底怎样才算正确”。

建议正式加入：

### 8.1 收益指标

- TTWROR（Time-Weighted Rate of Return）
- IRR / XIRR（Money-Weighted Return）
- Portfolio / Account / Security / Trade 多层收益
- Benchmark 对比

不能只有：

```text
(当前市值 - 买入成本) / 买入成本
```

### 8.2 现金流与税费

Ledger 必须清楚区分：

- 外部现金流
- 买卖产生的内部资金变化
- 手续费
- 税费
- 股息
- 利息
- 转入转出

否则 TTWROR/IRR 会失真。

### 8.3 资产配置

增加：

- 分类树：资产类别 / 行业 / 风格 / 账户 / 平台
- Target Allocation
- Rebalancing Gap
- 目标仓位对应的建议调整金额

V0.3 后进入路线图。

## 9. QuantStats：收益分析和报告直接复用

仓库：https://github.com/ranaroussi/quantstats

可作为 `analytics-worker` 的直接依赖，负责：

- Sharpe / Sortino
- volatility
- max drawdown
- rolling metrics
- monthly/yearly heatmap
- drawdown plots
- benchmark comparison
- HTML tear sheet

注意：部分“win rate”等指标是基于收益周期，不等于逐笔交易胜率；我们的 Backtest Engine 要保留 trade-based metrics。

## 10. PyPortfolioOpt / Riskfolio-Lib：V2 组合优化

仓库：

- https://github.com/PyPortfolio/PyPortfolioOpt
- https://github.com/dcajasn/Riskfolio-Lib

规划到 V2：

- Mean-Variance
- Black-Litterman
- HRP
- Mean-Semivariance
- CVaR
- Risk Parity
- 更复杂风险度量

对用户暴露的产品能力不是“选择优化算法”，而是：

```text
当前组合
→ 预期风险/收益
→ 约束
→ 建议目标权重
→ 与当前权重差异
→ 再平衡建议
```

## 11. Hikyuu：A 股 Strategy Engine 领域拆分

仓库：https://github.com/fasiondog/hikyuu

值得借鉴的策略系统拆分：

- Market Environment
- Condition
- Signal
- Stop Loss
- Profit Goal
- Money Management
- Slippage
- Portfolio
- Capital Allocation

因此我们的策略 DSL/Schema 不应只写：

```ts
if (ma20 > ma60) buy();
```

而应逐步支持：

```text
Universe
EntrySignal
ExitSignal
StopLoss
TakeProfit
Sizing
ExecutionModel
CostModel
Benchmark
RiskConstraint
```

## 12. vn.py：未来模拟盘与实盘执行层

仓库：https://github.com/vnpy/vnpy

当前 MVP 禁止自动交易，因此暂不接入。

V2/V3 进入模拟盘/实盘时重点研究：

- Event Engine
- Gateway
- OMS
- Risk Manager
- Paper Account
- Data Recorder
- Portfolio Manager
- Algo Order（TWAP 等）
- RPC/Web Trader

未来架构建议：

```text
NestJS Investment OS
       ↓
Execution Contract
       ↓
    vn.py Worker
       ↓
Broker Gateway
```

不要在 NestJS 内自己重写券商交易网关。

## 13. QuantConnect LEAN：专业回测/执行备选

仓库：https://github.com/QuantConnect/Lean

LEAN 是成熟的事件驱动算法交易引擎，拥有可插拔数据、Brokerage、交易模型、优化、回测和 live trading。

对我们有两个用途：

1. V0.5 决定自研 Backtest Engine 前，用它作为“成熟引擎复杂度基准”。
2. V2/V3 若需要跨市场专业回测/实盘，可把策略执行委托给独立 LEAN service。

不建议 fork 成 App；它是引擎，不是个人资产产品。

## 14. Qlib / RD-Agent：高级量化研究

仓库：

- https://github.com/microsoft/qlib
- https://github.com/microsoft/RD-Agent

V2 才进入：

### Qlib

- Alpha158 / Alpha360
- 特征工程
- ML 模型
- Portfolio Strategy
- Backtest
- Point-in-Time 数据
- 在线预测

### RD-Agent

- 自动提出因子假设
- 自动实现
- 自动实验
- 因子挖掘
- 模型优化
- 研究迭代闭环

未来形态：

```text
AI Research
→ 产生候选因子/策略
→ Sandbox
→ Backtest
→ OOS Validation
→ Human Review
→ Strategy Registry
```

绝不能自动从实验进入真实交易。

## 15. QUANTAXIS：账户和 OMS 概念

仓库：https://github.com/yutiansut/QUANTAXIS

本项目不采用其 Mongo/ClickHouse/RabbitMQ 等全套基础设施，但值得研究：

- QIFI 账户模型
- 父子账户/OMS
- 模拟与实盘统一接口
- 大规模行情存储的经验
- 账户/订单/成交/持仓的状态转换

在未来多券商、子账户、策略账户出现后重新评估。

## 16. OpenBB：Provider/Data Platform 思路

仓库：https://github.com/OpenBB-finance/OpenBB

值得借鉴：

- 多 Provider 统一数据接口
- provider capability discovery
- Python/REST/MCP 多消费方式
- 数据平台与上层应用解耦

但本项目只需小规模实现，不要把 MVP 做成通用金融数据平台。

## 17. 小于 1k Star 但战略相关项目

Star 低不代表不值得使用，尤其是新项目和单一能力库。

### OpenAshare

关注：

- 本地优先 A 股 AI Workspace
- Portfolio + AI 上下文
- 持仓集中度和再平衡 UX

适合作为产品交互参考。

### stock-screener

关注：

- PostgreSQL / Redis
- 定时刷新
- 市场队列
- 锁
- 交易日历
- Watchlist/筛选器

适合研究后台任务架构。

### AKQuant

关注：

- Rust + Python Backtest
- T+1
- 涨跌停
- Walk Forward
- Grid Search
- ML

它与 AKShare 生态贴近，但项目较新。V0.5 前做 benchmark，再决定是否作为 Backtest Worker。

### easy-tdx / AData / mootdx / AKShare

这些仍是免费 MVP 数据层的重要候选，不属于完整产品 fork 范畴。

## 18. 调研后新增到产品路线图的功能

### V0.1

新增：

- Screenshot Import Review（置信度 + 人工确认）
- Notification cooldown / dedup
- Provider health state
- AI 输出 provenance

### V0.2

新增：

- Provider completeness check
- 部分结果 fallback 补齐
- 数据异常/陈旧检测
- Provider capability matrix
- 行情数据版本/来源记录

### V0.3

新增：

- TTWROR
- XIRR
- tax/fee/cash-flow semantics
- Target Allocation
- Rebalance Gap
- 多层收益：Portfolio / Account / Security

### V0.4

新增：

- 规则 cooldown
- severity
- quiet hours
- rule dedup
- rule audit log

### V0.5

新增：

- PIT contract
- look-ahead test
- OOS validation
- strategy result reproducibility metadata
- trade-based 与 period-based metrics 分离

### V0.6

新增：

- Deterministic Compute, LLM Narration
- Decision Log
- Risk Critic / Portfolio Gate
- Tool provenance
- Agent checkpoint/resume

### V0.7

新增：

- Shadow Account
- Behavior Bias Detection
- 实际 vs 计划交易
- Counterfactual Replay
- 自动复盘结论

### V2

新增：

- HRP / Black-Litterman / CVaR / Risk Parity
- Factor Research
- Qlib
- RD-Agent
- Research Sandbox

### V3

新增：

- Paper Trading
- Execution Gateway
- OMS
- vn.py / LEAN integration
- Broker read/write connection
- 实盘安全限额和审批链

## 19. 推荐架构：核心 NestJS + 专项 Worker

```text
React Native                 Electron
      │                         │
      └──────────── API ────────┘
                    │
                 NestJS
                    │
        ┌───────────┼───────────┐
        │           │           │
   PostgreSQL     Redis       Queue
        │           │           │
        └───────────┼───────────┘
                    │
        ┌───────────┼──────────────────────┐
        ↓           ↓                      ↓
 Market Worker  Analytics Worker      Research Worker
 AKShare        QuantStats            Vibe/Qlib/RD-Agent
 easy-tdx       PyPortfolioOpt        （后期）
 AData          Riskfolio
        │
        └──────────────────────┐
                               ↓
                         Execution Worker
                         vn.py / LEAN
                         （V3）
```

原则：

- NestJS 始终是业务事实源和公开 API。
- Python/C++/Rust 项目作为可替换 Worker。
- Worker 不拥有 Portfolio/Ledger 的业务真相。
- AI 不拥有金融数值计算权。
- 实盘执行永远和研究 Agent 隔离。

## 20. Fork 决策表

### 方案 A：从零开发核心 + 借鉴现有项目

适用：未来可能闭源商业化，技术栈必须完全掌控。

优点：

- 许可证最干净
- 数据模型完全按 A 股和个人持仓设计
- 客户端架构最一致

缺点：

- Portfolio/Ledger/收益计算/导入等工程量大

**当前默认推荐。**

### 方案 B：Fork Ghostfolio

适用：接受 AGPL 开源路线。

```text
Ghostfolio
├── 保留 NestJS API
├── 保留 Prisma/Postgres
├── 保留 Redis/DataProvider/Portfolio
├── 扩展 Ledger
├── 新增 A-share Provider
├── 新增 Risk/Chip/Strategy/AI
├── 新增 React Native
└── 新增 Electron
```

这是最快获得成熟 Portfolio 基座的方案。

### 方案 C：Fork daily_stock_analysis

适用：最快验证 A 股 AI/截图/推送产品，而不坚持目标后端栈。

不建议作为长期技术底座，但可用于快速试错。

## 21. 下一步实施建议

在正式创建业务代码前做两个 Spike：

### Spike 1：Ghostfolio Fork Feasibility

验收：

- 本地跑通 NestJS/Postgres/Redis
- 新增 `AshareProvider`
- 导入一条 A 股 BUY
- 正确计算当前 Position/Performance
- Electron 调用 API
- 记录需要删除/替换的 Ghostfolio 模块
- 输出 AGPL 许可决策

### Spike 2：daily_stock_analysis Capability Audit

验收：

- 截图识别 Pipeline
- 飞书通知 Pipeline
- Provider fallback
- Risk/Alert 机制
- AI 报告 Schema

只提炼设计和可复用 MIT 代码，不把它变成主业务仓。

完成两项 Spike 后，再锁定“从零 core”还是“Ghostfolio fork”。

## 22. 主要参考仓库

- Ghostfolio: https://github.com/ghostfolio/ghostfolio
- daily_stock_analysis: https://github.com/ZhuLinsen/daily_stock_analysis
- Vibe-Trading: https://github.com/HKUDS/Vibe-Trading
- TradingAgents: https://github.com/TauricResearch/TradingAgents
- Portfolio Performance: https://github.com/portfolio-performance/portfolio
- QuantStats: https://github.com/ranaroussi/quantstats
- PyPortfolioOpt: https://github.com/PyPortfolio/PyPortfolioOpt
- Riskfolio-Lib: https://github.com/dcajasn/Riskfolio-Lib
- Hikyuu: https://github.com/fasiondog/hikyuu
- vn.py: https://github.com/vnpy/vnpy
- QuantConnect LEAN: https://github.com/QuantConnect/Lean
- Qlib: https://github.com/microsoft/qlib
- RD-Agent: https://github.com/microsoft/RD-Agent
- QUANTAXIS: https://github.com/yutiansut/QUANTAXIS
- FinRobot: https://github.com/AI4Finance-Foundation/FinRobot
- FinGPT: https://github.com/AI4Finance-Foundation/FinGPT
- FinRL: https://github.com/AI4Finance-Foundation/FinRL
- OpenBB: https://github.com/OpenBB-finance/OpenBB
