# 个人投资中台 SPEC

> 版本：Draft 0.3
> 更新：2026-07-31
> 配套调研：`2026-08-18-open-source-research.md`

## 1. 定位

面向个人投资者的 **统一持仓 + 行情 + 风控 + 策略研究 + AI 辅助分析平台**。

核心目标不是复制传统行情软件，而是围绕用户自己的资产回答：

```text
我有什么？
现在赚/亏多少？
风险在哪里？
是否触发计划？
为什么出现这个风险？
历史上我的策略/行为效果如何？
下一步需要关注什么？
```

核心链路：

```text
行情 / 截图 / 交易流水
        ↓
     统一数据模型
        ↓
 Ledger → Portfolio
        ↓
 风控 / 筹码 / 策略
        ↓
 通知 / AI / 复盘
```

## 2. 技术路线

目标终态仍偏好：

- React Native：iOS / Android
- Electron + React：Desktop
- NestJS / PostgreSQL / Redis：长期服务化候选

但**技术栈不是开源主仓选择的硬约束**。当成熟项目与产品功能高度重合时，优先 fork 并复用现成功能，再渐进式重构服务边界；不为了 NestJS 或数据库统一，在 MVP 阶段重写已经成熟的 Portfolio、Risk、Alert、AI 等业务模块。

专项能力可继续独立：

- 免费行情：AKShare / easy-tdx / AData
- A 股量化能力参考：InStock
- Analytics：QuantStats；后续 PyPortfolioOpt / Riskfolio-Lib
- Research：Vibe-Trading / Qlib / RD-Agent
- Execution：vn.py / LEAN，V3 后启用

原则：**业务能力优先于技术形式，技术架构允许随产品成熟渐进演进。**

## 3. MVP 数据策略

V0.1 行情数据预算：0 元。

```text
AKShare       → 历史、ETF、基金、财务、辅助数据
Easy-TDX      → A 股实时/分钟/分时
AData         → 备用行情、盘口、资金流、股本
PostgreSQL    → 长期行情沉淀
Redis         → 实时行情缓存 / PubSub / Queue
```

所有数据经过 `MarketDataProvider`，业务层不得直接依赖具体数据源。

必须记录：

- provider
- fetchedAt
- marketTime
- freshness
- capability
- fallback chain

V0.2 增加 completeness check，避免某数据源只返回部分标的时静默缩小 universe。

## 4. 统一持仓中心

支持：

- 多账户
- 股票
- ETF
- 场外基金
- 手动录入
- 截图导入
- 后续 API/券商只读接入

账户来源可包括：

- 支付宝
- 同花顺
- 券商
- 手动账户

持仓是 Ledger 的派生状态，而不是长期唯一事实源。

## 5. 截图导入

流程：

```text
截图
→ Vision/OCR
→ 来源识别
→ 持仓字段提取
→ 标的匹配
→ 置信度
→ 人工确认/修改
→ Import Transaction
→ Ledger/Portfolio 更新
```

要求：

- 永远不能 OCR 后直接写正式持仓。
- 支持支付宝、同花顺、券商、通用截图。
- 支持长截图、多图、重复导入识别、回滚。
- AI/Vision 只负责结构化识别；资产匹配和金额校验由确定性代码完成。

## 6. Ledger

目标事件：

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

原则：

```text
Ledger = 事实
Position = 当前计算结果
Snapshot = 性能优化/历史展示
```

V0.3 正式支持：

- TTWROR
- XIRR
- Portfolio / Account / Security 多层收益
- 现金流、税费和股息正确归因
- Target Allocation / Rebalance Gap

## 7. Dashboard

至少展示：

- 总资产
- 今日收益
- 累计收益
- TTWROR / XIRR（V0.3）
- 最大回撤
- 股票/ETF/基金/现金占比
- 行业/风格/账户分布
- 最大盈利/亏损贡献
- 风险事件
- 今日需要处理的事项

## 8. 风控中心

个股风险：

- 止损
- 止盈
- 移动止损
- 回撤
- MA / RSI / MACD / ATR
- 价格/成交量异常
- 筹码规则

账户风险：

- 单股集中度
- 行业集中度
- 资产类别集中度
- 高波动资产占比
- 相关性
- Portfolio Drawdown

Rule Engine 必须支持：

- severity
- cooldown
- dedup
- quiet hours
- audit log
- rule version

## 9. 筹码分布

定位：**估算筹码价格分布**，不宣称真实账户成本分布。

基础输入：

- OHLC
- volume
- amount
- turnover
- float shares

输出：

- price buckets
- average cost
- main/secondary chip peak
- profit ratio
- trapped ratio
- 70%/90% cost range
- concentration
- peak migration

V1 日线模型；后续增加分钟/分笔模型。

## 10. 通知中心

MVP：飞书。

统一 Provider：

```text
NotificationProvider
├── Feishu
├── WebPush
├── Email
└── Webhook
```

通知基础设施支持：

- severity routing
- cooldown
- dedup TTL
- quiet hours
- digest
- delivery result persistence

## 11. 策略与回测

V0.5 支持：

- 股票/ETF
- 日线优先
- 多标的
- 趋势/均线/动量/轮动/网格/定投
- 后续多因子

Strategy Schema 逐步包含：

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

A 股回测：

- T+1
- 涨跌停
- 停牌
- 复权/分红/除权除息
- 手续费
- 印花税
- 滑点
- 最小交易单位

必须防止：

- look-ahead bias
- survivorship bias（数据允许时）
- 数据不完整时静默回测

支持：

- OOS validation
- Walk Forward
- 参数实验
- Benchmark

## 12. Analytics

V0.5 可直接通过 Python Worker 使用 QuantStats，避免重复实现通用收益统计和报告。

区分：

- period-based metrics
- trade-based metrics

V2 可接入：

- PyPortfolioOpt
- Riskfolio-Lib

提供：

- HRP
- Black-Litterman
- CVaR
- Risk Parity
- Rebalancing

## 13. AI Assistant

原则：

> Deterministic Compute, LLM Narration.

AI 不直接计算关键金融数值，不直接写 Ledger，不直接执行交易。

Tool：

```text
getPortfolio
getPositions
getQuote
getKline
getIndicators
getChipDistribution
getRisk
getFinancials
getNews
getAnnouncements
runBacktest
getJournal
```

所有 AI 输出记录：

- tool calls
- data source
- market timestamp
- model
- prompt/version
- final decision log

V0.6 可增加：

- Research Agent
- Risk Critic
- Portfolio Gate
- checkpoint/resume
- decision reflection

## 14. 投资日志与行为复盘

V0.7：

记录：

- 买/卖原因
- 止损/止盈计划
- 目标仓位
- 预期周期
- 情绪/备注

增加 Shadow Account 风格能力：

```text
真实交易
→ 行为指标
→ 隐含规则
→ 计划/实际差异
→ Counterfactual Replay
→ AI 复盘
```

分析：

- 追涨
- 处置效应
- 过度交易
- 未执行止损
- 过早止盈
- 仓位过重

## 15. 自动化

V0.9：

- 盘前持仓事件
- 竞价/开盘提醒
- 盘中风险扫描
- 收盘行情落库
- 每日投资日报
- 周报
- AI 摘要

## 16. 非目标

MVP 不做：

- 自动下单
- L2 完整行情
- 高频交易
- 多年 Tick
- 机构级 SLA
- AI 自动交易
- 支付宝/同花顺账号逆向登录

## 17. 开源复用策略

详细研究见 `2026-08-18-open-source-research.md`。

评估优先级：

```text
功能覆盖与需求重合度
> 扩展性
> A 股领域适配
> 维护活跃度
> 许可证
> 技术栈迁移成本
```

### 主仓首选：daily_stock_analysis

当前与需求主链路重合度最高：

- 多源 A 股行情和 fallback
- 筹码分布
- 图片/CSV/Excel/剪贴板智能导入基础设施
- 多账户 Portfolio / 交易 / 现金流水 / 公司行动 / 快照
- FIFO / AVG
- 组合风险、回撤、集中度、止损接近预警
- Alert Center + 技术指标规则 + Portfolio/Account 联动
- 飞书等多渠道通知
- AI / Multi-Agent / RiskAgent / PortfolioAgent
- Web + Electron

当前默认策略：**先做 fork feasibility spike；能扩展就 fork，不先重写后端。**

### A 股能力来源：InStock / myhhub/stock

重点借鉴或移植：

- CYQ/筹码分布模型
- 32+ 技术指标
- 61 种 K 线形态
- 200+ 综合选股维度
- 策略模板
- Scan → Validation Backtest
- 批量历史任务
- 自动交易边界与日志经验

### Strategy/Agent 扩展：Vibe-Trading

V0.5+ 重点：

- Shadow Account
- PIT / OOS / look-ahead 约束
- Walk Forward / Monte Carlo
- Agent research loop
- 策略自动研究

### Wealth/Performance 参考

Ghostfolio 和 Portfolio Performance 用于对照：

- Ledger
- TTWROR / XIRR
- Account / Asset Allocation
- Rebalancing

不因为后端技术栈接近而优先 fork Ghostfolio。

### 后期专项平台

- Qlib / RD-Agent：因子、ML、自动研究
- vn.py / LEAN：模拟盘、券商连接、实盘执行
- QuantStats：收益/风险报告
- PyPortfolioOpt / Riskfolio-Lib：组合优化

## 18. Fork 决策 Spike

### P0：daily_stock_analysis Fork Spike

必须验证：

- Portfolio / Ledger 能否承载目标多账户模型
- Alert Center 能否扩展止损、止盈、移动止损和筹码规则
- 图片 Vision Pipeline 能否从“标的识别”扩展到“持仓字段识别 + dry-run + 确认提交”
- Chip Distribution 是否可直接用或需要替换算法
- Strategy Skill 是否方便扩展
- 上游更新合并成本是否可接受
- React Native 是否能直接复用 API / Domain Schema

通过则锁定 fork。

### P1：InStock Capability Spike

比较：

- 筹码结果
- 技术指标
- K 线形态
- 策略模板
- 选股/回测流程

只移植高价值、低耦合能力，不合并两套完整应用。

### P2：Vibe-Trading Audit

V0.5 前完成，验证未来 Strategy/Research 层接入方式。

## 19. Roadmap

### V0.1 免费 MVP

- 行情/自选
- 截图导入/手动持仓
- 多账户基础
- 实时盈亏
- 止损/止盈/价格提醒
- 飞书
- 筹码估算 V1
- 日线回测基础
- AI 基础分析

### V0.2 数据稳定

- Provider 抽象
- fallback
- completeness
- freshness
- 数据异常检查
- 行情落库

### V0.3 投资管理

- 完整 Ledger
- TTWROR / XIRR
- 多层 Performance
- Target Allocation / Rebalancing

### V0.4 风控增强

- Rule Engine
- 账户风险
- 筹码升级
- 通知治理

### V0.5 Strategy / Backtest

- Strategy Schema
- A 股完整交易规则
- OOS / Walk Forward
- Analytics Worker

### V0.6 AI Agent

- Deterministic Compute
- Research/Risk/Portfolio 分工
- Tool provenance
- Decision Log

### V0.7 复盘

- Journal
- Shadow Account
- Behavior Analysis
- Counterfactual Replay

### V0.8 专业数据

- Tushare/iFinD/JQData/RQData/Choice 等 Provider

### V0.9 自动化

- 盘前/盘中/收盘工作流
- 日报/周报

### V1.0 Investment OS

形成个人资产、风险、研究、策略、AI 的完整闭环。

### V2 高级量化

- Qlib
- RD-Agent
- PyPortfolioOpt/Riskfolio
- 因子研究
- 策略组合
- 组合优化

### V3 执行/商业化

- Paper Trading
- OMS
- vn.py / LEAN
- Broker Gateway
- 商业数据授权
- 多租户/权限/审计/SLA/合规
