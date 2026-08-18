# 个人投资中台：开源项目调研与复用策略

> 调研快照：2026-07-31。GitHub Star、项目状态和许可证可能变化，实施前需再次核验。
>
> 本文是 `2026-08-18-stock-investment-os-spec.md` 的配套研究文档，重点回答：哪些功能值得借鉴、哪些组件可以直接接入、哪些项目值得 fork，以及未来各阶段该关注什么。

## 1. 结论摘要

本轮重新调整评估标准：**技术栈只作为迁移成本，不作为主仓选择的核心评分项。** 主仓优先看现成功能覆盖、扩展机制、A 股适配、维护活跃度和许可证。

建议权重：

```text
功能覆盖与需求重合度   45%
扩展性 / 插件化能力    25%
A 股领域适配           15%
维护活跃度 / 社区       10%
许可证                  5%
技术栈                  不计入主评分，仅记录迁移成本
```

按这个标准，结论调整为：

1. **daily_stock_analysis：当前主仓 fork 首选。**
   - 已覆盖多源 A 股行情、筹码、图片智能导入、持仓/账户/账本、组合风险、止损接近预警、告警中心、飞书等多渠道通知、AI Agent、多 Agent、策略体系、回测验证、Web 和 Electron 桌面端。
   - 持仓模块已经不是简单“当前仓位表”，而是账户 + 交易 + 现金流水 + 公司行动 + 快照的账本体系，并支持 FIFO / AVG、CSV Parser Registry、幂等导入和超卖校验。
   - MIT 许可证、极高社区活跃度和快速迭代，使它比从零实现更适合作为产品母体。
   - 主要缺口：截图导入目前更偏自选/标的识别，需要接到持仓导入；现有回测更偏 AI 建议验证，不等于完整通用 Strategy Backtest Engine；移动端仍需补 React Native。
2. **InStock（myhhub/stock）：A 股量化功能最值得并入/借鉴的第二候选。**
   - 约 13.6k Star，Apache-2.0；高度聚焦 A 股。
   - 已有 200+ 条件综合选股、32+ 技术指标、61 种 K 线形态、筹码分布（CYQ）、策略模板、选股验证回测、自动交易、批处理、数据库历史沉淀和 PC/移动 Web。
   - 对本项目最重要的是现成的筹码算法、A 股选股/指标/形态/策略体系和交易适配经验。
   - 缺口是个人持仓/多账户/截图导入/通知/LLM Agent 不如 daily_stock_analysis 完整，因此更适合作为能力来源，而不是优先于 daily_stock_analysis 做主仓。
3. **Vibe-Trading：策略研究、Agent 与行为复盘的核心扩展来源。**
   - Shadow Account、PIT/OOS/look-ahead 约束、Walk Forward、Monte Carlo、策略研究闭环值得在 V0.5+ 引入。
   - 如果未来重心从“个人持仓风控”转向“AI 量化研究”，它的重要性会明显上升。
4. **Ghostfolio：降级为财富管理领域参考，不再因为 NestJS 技术栈成为首选 fork。**
   - Ledger、Performance、Account、Provider 等能力成熟，但 A 股筹码、策略、AI、实时风控、飞书、截图等缺失较多。
   - 只有在产品重心变成“财富管理/资产配置”且接受 AGPL 时，才值得重新考虑主仓 fork。
5. **TradingAgents / Qlib / vn.py / LEAN 等作为专项扩展，不与主产品仓竞争。**
   - TradingAgents：AI 决策组织。
   - Qlib / RD-Agent：高级因子和自动研究。
   - vn.py / LEAN：模拟盘、自动交易和执行。
   - QuantStats / PyPortfolioOpt / Riskfolio-Lib：分析与组合优化直接复用。

### 推荐总体策略

```text
Fork daily_stock_analysis
        │
        ├── 保留/增强 Portfolio / Ledger / Alert / Notification / AI
        ├── 扩展“截图识别 → 持仓导入”
        ├── 引入 InStock 的筹码 / 指标 / 形态 / 选股设计
        ├── V0.5+ 引入 Vibe-Trading 的策略研究能力
        ├── V2 引入 Qlib / Portfolio Optimization
        └── V3 通过 vn.py / LEAN 接执行层
```

除非 fork spike 发现 daily_stock_analysis 的核心模块耦合严重、测试难以支撑改造，否则**不建议先重写后端再移植功能**。

## 2. 项目优先级矩阵

| 项目 | Star 快照 | 许可证 | 功能贴合度 | 扩展价值 | 推荐角色 |
|---|---:|---|---:|---:|---|
| **daily_stock_analysis** | ~59.7k | MIT | **95%** | **高** | **主仓 fork 首选** |
| **InStock / myhhub/stock** | ~13.6k | Apache-2.0 | **82%** | 高 | A 股筹码/指标/选股/策略能力来源；次级 fork 候选 |
| **Vibe-Trading** | 20k+ | MIT | 72% | **很高** | V0.5+ 策略/Agent/行为复盘扩展 |
| Ghostfolio | ~9k | AGPL-3.0 | 65% | 高 | Wealth/Ledger/Performance 参考，不优先 fork |
| TradingAgents | 1k+ | Apache-2.0 | 50% | 很高 | 多 Agent 决策架构 |
| Qlib | 1k+ | MIT | 45% | 很高 | V2 因子/ML/组合研究 |
| vn.py | 1k+ | MIT | 40% 当前 / 80% 实盘阶段 | 很高 | V3 Execution/OMS/Broker Gateway |
| LEAN | 1k+ | Apache-2.0 | 40% 当前 / 75% 实盘阶段 | 很高 | 专业 Backtest/Execution 备选 |
| Portfolio Performance | 1k+ | EPL-1.0 | 55% | 中 | Ledger / Performance 语义参考 |
| Hikyuu | 1k+ | Apache-2.0 | 50% | 中高 | A 股 Strategy/Risk 领域模型参考 |
| QuantStats | 1k+ | Apache-2.0 | 30% | 高 | 直接依赖 Analytics |
| PyPortfolioOpt | 1k+ | MIT | 25% | 高 | V2 Portfolio Optimization |
| Riskfolio-Lib | 1k+ | BSD-3-Clause | 25% | 高 | V2 Advanced Risk |

> Star 只用来筛成熟社区项目；最终排序以需求贴合和扩展性为主。

## 3. Ghostfolio：财富管理领域参考与备选 fork

仓库：https://github.com/ghostfolio/ghostfolio

### 3.1 为什么仍值得研究

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

**不再作为第一优先级 Spike；先完成 daily_stock_analysis fork 评估。若后续确认需要更强财富管理语义，再做 Ghostfolio 对照 Spike。**

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

## 4. daily_stock_analysis：主仓 fork 首选

仓库：https://github.com/ZhuLinsen/daily_stock_analysis

这是目前功能表与我们最接近的成熟项目，也是当前优先级最高的 fork 候选。

截至当前主线，已经具备：

- A 股/港股/美股/ETF 多市场行情与多源 fallback
- 筹码分布、技术指标、资金流、公告、基本面
- 图片/CSV/Excel/剪贴板智能导入与置信度确认
- 多账户 Portfolio、交易账本、现金流水、公司行动、每日快照
- FIFO / AVG 成本法、实时估值、集中度/回撤/止损接近风险
- 告警规则 CRUD、后台评估、持久化 cooldown、通知结果、MA/RSI/MACD/KDJ/CCI 等规则
- 飞书/企微/Telegram/Discord/Slack/钉钉/邮件等渠道
- 单 Agent / Multi-Agent、RiskAgent、PortfolioAgent、策略路由、Memory/Calibration
- Web 工作台和 Electron 桌面端

它的关键优势不是“某一个功能更强”，而是**我们的主链路已经大部分存在于同一个仓库中**。

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

## 5. InStock（myhhub/stock）：A 股量化能力库与次级 fork 候选

仓库：https://github.com/myhhub/stock

这是本轮补充后最重要的新候选。它不像 daily_stock_analysis 那么偏“个人持仓 + AI + 提醒”，但在 A 股技术分析和策略能力上更深。

### 5.1 已有能力

- A 股 / ETF 日常数据抓取与历史数据库
- 200+ 维度综合选股条件：股票范围、基本面、技术面、消息面、人气、行情/资金流
- 32+ 常用技术指标
- 61 种 K 线形态识别
- 买卖信号判定
- **筹码分布 / Position Cost Distribution（CYQ）**，默认基于约 210 个交易日，可调整窗口
- 多种内置选股策略与自定义策略模板
- 选股结果验证回测
- 批量日期执行和历史回填
- 自动交易示例、交易日志和券商客户端适配经验
- 数据库长期存储
- Web UI，兼容 PC / 平板 / 手机
- Docker 部署

### 5.2 对本项目最值得复用的部分

#### 筹码引擎

这是最直接命中需求的现成功能。优先研究：

```text
OHLCV / 流通盘
→ 成交量在价格区间的分配
→ 历史筹码衰减/滚动
→ 价格成本分布
```

第一版 Chip Engine 应优先对照 InStock 的输出，而不是完全从零猜算法。

#### A 股指标与形态层

可以直接把 InStock 当“指标/形态需求目录”：

- MACD / KDJ / RSI / ATR / BOLL / CCI / DMI / OBV / Supertrend 等
- 61 类 K 线形态
- 技术面 + 基本面 + 资金面联合筛选

#### Strategy Template

它已经验证了“策略模板 → 批量扫描 → 回测验证”的产品链路。我们的通用策略系统可借鉴接口和 UI，而后续再升级到 Vibe/Qlib 的研究框架。

#### 自动交易

MVP 不启用，但其券商客户端适配、交易日志、策略到执行的边界可以记录到 V3 规划。真正进入实盘时仍优先比较 vn.py。

### 5.3 为什么不优先于 daily_stock_analysis fork

缺少或较弱：

- 多账户个人 Portfolio / Ledger
- 截图持仓导入
- 飞书等通知中心
- 事件型实时风控中心
- LLM / Agent 分析
- AI 与真实持仓上下文整合

这些恰好是本产品的第一核心链路。因此最佳方式更像：

```text
daily_stock_analysis 作为产品母体
        +
InStock 作为 A 股 Quant 能力来源
```

而不是反过来。

### 5.4 Fork 结论

- **主仓 fork：第二候选**。
- **代码/算法/需求借鉴：第一梯队**。
- 如果后续产品重心从“个人持仓风控”转成“全市场选股 + 策略交易”，InStock 可以上升为主仓候选。

## 6. Vibe-Trading：策略研究与行为复盘参考

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

## 7. TradingAgents：AI 多角色与决策日志

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

## 8. FinRobot：AI 计算边界

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

## 9. Portfolio Performance：Ledger 与收益计算标准

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

## 10. QuantStats：收益分析和报告直接复用

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

## 11. PyPortfolioOpt / Riskfolio-Lib：V2 组合优化

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

## 12. Hikyuu：A 股 Strategy Engine 领域拆分

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

## 13. vn.py：未来模拟盘与实盘执行层

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

## 14. QuantConnect LEAN：专业回测/执行备选

仓库：https://github.com/QuantConnect/Lean

LEAN 是成熟的事件驱动算法交易引擎，拥有可插拔数据、Brokerage、交易模型、优化、回测和 live trading。

对我们有两个用途：

1. V0.5 决定自研 Backtest Engine 前，用它作为“成熟引擎复杂度基准”。
2. V2/V3 若需要跨市场专业回测/实盘，可把策略执行委托给独立 LEAN service。

不建议 fork 成 App；它是引擎，不是个人资产产品。

## 15. Qlib / RD-Agent：高级量化研究

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

## 16. QUANTAXIS：账户和 OMS 概念

仓库：https://github.com/yutiansut/QUANTAXIS

本项目不采用其 Mongo/ClickHouse/RabbitMQ 等全套基础设施，但值得研究：

- QIFI 账户模型
- 父子账户/OMS
- 模拟与实盘统一接口
- 大规模行情存储的经验
- 账户/订单/成交/持仓的状态转换

在未来多券商、子账户、策略账户出现后重新评估。

## 17. OpenBB：Provider/Data Platform 思路

仓库：https://github.com/OpenBB-finance/OpenBB

值得借鉴：

- 多 Provider 统一数据接口
- provider capability discovery
- Python/REST/MCP 多消费方式
- 数据平台与上层应用解耦

但本项目只需小规模实现，不要把 MVP 做成通用金融数据平台。

## 18. 小于 1k Star 但战略相关项目

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

## 19. 调研后新增到产品路线图的功能

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

## 20. 推荐架构：产品母体 + 专项能力模块

主仓选择不再以 NestJS 为先决条件。若 `daily_stock_analysis` fork spike 通过，优先保留其成熟模块，再逐步演进客户端和服务边界。

```text
                  daily_stock_analysis fork
                           │
      ┌────────────────────┼────────────────────┐
      ↓                    ↓                    ↓
 Portfolio / Risk      Market / Chip        AI / Agent
 Ledger / Alert        Indicators           Notification
      │                    │                    │
      │              对照/吸收 InStock           │
      │                    │                    │
      └────────────────────┼────────────────────┘
                           ↓
                   Strategy / Research
                    Vibe-Trading
                           ↓
                 Qlib / RD-Agent (V2)
                           ↓
                 vn.py / LEAN (V3)
```

长期仍可演进为 React Native + Electron + 独立服务，但这属于工程演进，不应在 MVP 阶段为了技术统一而重写已经成熟的业务能力。

原则：

- **先继承业务能力，再重构技术边界。**
- Portfolio / Ledger / Risk 仍是产品事实源。
- InStock 提供 A 股量化能力，不直接掌管个人账户数据。
- Vibe/Qlib 等研究模块与真实交易执行隔离。
- AI 不替代确定性资产、收益和风险计算。

## 21. Fork 决策表

### 方案 A：Fork daily_stock_analysis（当前默认推荐）

适用：目标是最快得到与需求高度重合、可持续扩展的产品。

现成获得：

- 多源行情 / 筹码 / 基本面 / 新闻
- Portfolio / Ledger / 多账户 / 风险
- 告警中心 / 飞书通知
- 图片识别基础设施
- AI / Multi-Agent / PortfolioAgent
- Web / Electron

重点补：

- 图片识别真正导入 Portfolio，而非只识别自选标的
- 支付宝 / 同花顺截图模板和持仓字段提取
- 更完整止损/止盈/移动止损规则
- 通用 Strategy Backtest Engine
- InStock 风格的指标/形态/选股能力
- React Native 移动端

**这是当前首选。**

### 方案 B：Fork daily_stock_analysis + 吸收 InStock 核心能力

这是中长期最推荐的组合，而不是把两个完整系统硬合并。

优先吸收：

- Chip/CYQ 模型
- 指标计算与 K 线形态
- 策略模板
- 综合选股条件模型
- 批处理 / 历史回填设计

实施时需逐项确认 Apache-2.0 文件的 NOTICE / 版权声明要求。

### 方案 C：Fork InStock

适用：产品重心变成 A 股选股、筹码、策略、自动交易，而个人多账户和 AI 辅助变成次要能力。

当前不是首选，因为需要补齐 Portfolio/截图/通知/Agent 的工作更多。

### 方案 D：从零开发

仅在 daily_stock_analysis spike 发现以下问题时选择：

- 核心模块强耦合，无法安全裁剪
- 数据模型无法适配目标 Ledger
- 测试覆盖不足以支撑长期 fork
- 上游更新合并成本不可接受
- 产品许可/治理策略不希望维护 fork

### 方案 E：Fork Ghostfolio

不再因 NestJS 技术栈优先考虑。只在“财富管理能力 > A 股分析/AI/风控能力”且接受 AGPL 时有优势。

## 22. 下一步实施建议

正式开发前只做三个高价值 Spike：

### Spike 1：daily_stock_analysis Fork Feasibility（最高优先）

验收：

- 本地完整跑通 Web / Desktop / API
- 导入一个账户和真实 A 股交易，检查 Portfolio Snapshot / Risk
- 配置价格止损并验证飞书触发
- 跑通筹码分析
- 用支付宝或同花顺持仓截图跑通 Vision 提取，并改造成 Portfolio dry-run 导入
- 增加一个自定义 Alert Rule，评估扩展成本
- 增加一个自定义 Strategy Skill，评估策略扩展成本
- 评估升级上游版本的冲突范围

若以上大部分无需大规模重写，直接确定 fork。

### Spike 2：InStock Capability Audit

验收：

- 对同一 A 股比较筹码分布结果
- 抽取指标/形态 API 边界
- 跑通一条 Strategy → Scan → Validation Backtest
- 判断哪些模块可以独立移植，而不带入整个系统

### Spike 3：Vibe-Trading Research Audit

放在 V0.5 前完成，不阻塞 MVP：

- Strategy schema
- PIT / OOS
- Walk Forward
- Shadow Account
- Agent research loop

最终决策优先级：

```text
先证明 daily_stock_analysis 不能 fork
而不是先证明从零实现可行。
```

## 23. 主要参考仓库

- Ghostfolio: https://github.com/ghostfolio/ghostfolio
- daily_stock_analysis: https://github.com/ZhuLinsen/daily_stock_analysis
- InStock: https://github.com/myhhub/stock
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
