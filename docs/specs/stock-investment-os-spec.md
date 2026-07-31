# 个人投资中台 SPEC

## 1. 项目概述

### 1.1 项目定位

本项目定位为一个面向个人投资者的 **投资管理、行情分析、风险控制、策略研究与 AI 辅助分析平台**。

产品不以替代同花顺、东方财富等综合行情软件为目标，而是重点解决个人投资过程中以下问题：

* 多平台持仓分散，缺乏统一视图
* 缺少个性化止损、止盈和风险提醒
* 无法统一管理股票、ETF、基金等资产
* 交易决策缺乏结构化记录和复盘
* 策略想法难以快速验证
* 行情、持仓、策略、风控和 AI 彼此割裂
* 缺少围绕个人真实持仓构建的分析系统

核心链路：

```text
行情数据
   ↓
交易流水 / 持仓
   ↓
统一资产视图
   ↓
分析 / 筹码 / 策略
   ↓
风险识别
   ↓
提醒
   ↓
复盘
   ↓
AI 辅助
```

---

# 2. 产品目标

## 2.1 核心目标

构建一个可跨端运行的个人投资中台，实现：

1. 获取 A 股、ETF、基金等行情数据
2. 统一管理不同来源的投资持仓
3. 支持截图识别导入持仓
4. 实时计算账户盈亏
5. 监控止损、止盈和其他风险
6. 估算股票筹码价格分布
7. 接入飞书发送风险和投资提醒
8. 支持策略开发与历史回测
9. 接入大模型进行投资分析
10. 长期积累个人行情和交易数据库
11. 支持移动端和桌面端

---

# 3. 非目标

MVP 阶段暂不实现：

* 自动实盘下单
* 券商交易接口
* 支付宝账号登录和逆向接口
* 同花顺账号登录和逆向接口
* L2 完整行情
* 多年 Tick 数据
* 高频交易
* 毫秒级交易系统
* AI 自动执行买卖
* 商业级行情 SLA
* 完整机构级风险模型

系统初期定位为：

> 投资管理、风险提醒和研究工具，而非自动交易系统。

---

# 4. 技术栈

## 4.1 客户端

### Mobile

```text
React Native
```

用于：

* iOS
* Android

可优先考虑 Expo。

### Desktop

```text
Electron + React
```

桌面端使用 React Renderer，不强制通过 React Native Web 与移动端统一 UI。

共享：

* TypeScript 类型
* API Client
* Schema
* Domain Model
* 工具函数
* 策略类型
* 风控类型

---

## 4.2 服务端

```text
NestJS
PostgreSQL
Redis
```

NestJS 负责：

* API
* WebSocket
* 用户数据
* 行情聚合
* 持仓计算
* 风控规则
* 策略管理
* 回测任务
* 通知
* AI Tool 调用

---

## 4.3 项目结构

```text
apps/
├── mobile/
├── desktop/
└── server/

packages/
├── api-client/
├── domain/
├── schemas/
├── indicators/
├── strategy-types/
├── risk-types/
├── shared/
└── utils/
```

---

# 5. 总体架构

```text
               React Native
                    │
                    │
              Electron
                    │
                    ↓
                  NestJS
                    │
         ┌──────────┼──────────┐
         ↓          ↓          ↓
     PostgreSQL    Redis     Workers
         │          │          │
         │          │          ├── 行情采集
         │          │          ├── 筹码计算
         │          │          ├── 回测
         │          │          └── AI任务
         │          │
         └──────────┼──────────────┐
                    ↓              ↓
             Market Service    Notification
                    │              │
             Provider Layer       飞书
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
     AKShare     easy-tdx      AData
```

---

# 6. 行情数据系统

## 6.1 MVP 原则

MVP 行情数据预算：

```text
0 元
```

优先使用免费和开源数据源。

### 初始 Provider

```text
MarketDataProvider
├── AkShareProvider
├── EasyTdxProvider
├── ADataProvider
└── MockProvider
```

职责建议：

### AKShare

主要负责：

* A 股历史行情
* ETF
* 基金
* 指数
* 财务数据
* 板块
* 辅助数据

### easy-tdx

主要负责：

* 实时 A 股行情
* 分钟行情
* 分时
* 逐笔等实时能力

### AData

主要负责：

* 备用实时行情
* 五档盘口
* 资金流
* 板块
* 概念
* 股本数据

---

## 6.2 Provider 抽象

业务代码不得直接依赖某个具体行情库。

```ts
interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;

  getBars(
    symbol: string,
    timeframe: Timeframe,
    range: TimeRange,
  ): Promise<Bar[]>;

  getAsset(symbol: string): Promise<Asset>;

  getFundNav?(symbol: string): Promise<FundNav>;

  getFundamentals?(symbol: string): Promise<Fundamentals>;
}
```

业务层统一：

```ts
market.getQuote("600519.SH");
```

不得直接出现：

```ts
akshare.xxx();
```

---

# 7. 行情数据存储

## 7.1 Redis

负责短期、实时数据：

```text
实时价格
最新 K 线
行情缓存
指标缓存
Pub/Sub
任务队列
分布式锁
```

典型流程：

```text
行情 Provider
    ↓
Redis
    ↓
quote:update
    ↓
Risk Engine
    ↓
触发 Rule
```

---

## 7.2 PostgreSQL

负责长期数据：

```text
资产基础信息
日 K
分钟 K
交易流水
持仓
持仓快照
策略
回测结果
风险规则
风险事件
筹码分布
投资日志
```

项目上线后应持续保存分钟行情，逐步形成自己的历史数据库。

```text
免费实时行情
      ↓
Market Collector
      ↓
PostgreSQL
      ↓
自有历史分钟数据
```

---

# 8. 统一持仓中心

## 8.1 目标

将不同平台中的：

```text
股票
ETF
基金
不同券商账户
支付宝基金
同花顺持仓
手动账户
```

统一转换为内部资产和持仓模型。

---

## 8.2 持仓来源

```text
PortfolioSource
├── ScreenshotSource
├── ApiSource
└── ManualSource
```

MVP 优先：

```text
截图导入
+
手动录入
```

API 自动同步作为后续能力。

---

# 9. 截图导入

## 9.1 支持来源

第一阶段支持：

* 支付宝持仓截图
* 同花顺持仓截图
* 券商 App 持仓截图
* 通用持仓截图

---

## 9.2 流程

```text
截图
 ↓
OCR / Vision
 ↓
识别来源
 ↓
识别持仓区域
 ↓
结构化字段
 ↓
资产代码匹配
 ↓
异常检查
 ↓
用户确认
 ↓
写入持仓
```

---

## 9.3 统一识别 Schema

```ts
interface ScreenshotImportResult {
  source?: "alipay" | "ths" | "broker" | "unknown";

  account?: string;

  positions: {
    name: string;
    symbol?: string;

    quantity?: number;
    costPrice?: number;
    marketPrice?: number;

    marketValue?: number;
    profit?: number;
    profitRate?: number;
  }[];

  confidence: number;
}
```

---

## 9.4 导入确认

识别结果不得直接写入正式持仓。

必须进入确认页面。

```text
识别到 8 条持仓

✓ 600519 贵州茅台
  100 股
  成本 1452.31

✓ 510300 沪深300ETF
  5200 份
  成本 3.872

⚠ 宁德时代
  股票代码待确认
```

支持：

* 修改字段
* 删除条目
* 补充资产代码
* 确认导入

---

## 9.5 后续能力

支持：

* 长截图
* 多张截图连续导入
* 截图日期识别
* 来源识别
* 重复数据判断
* 导入历史
* 导入回滚
* 数据修正
* 增量更新

---

# 10. 账户与持仓模型

## 10.1 Account

```ts
interface Account {
  id: string;

  name: string;

  source:
    | "alipay"
    | "ths"
    | "broker"
    | "manual";

  type:
    | "stock"
    | "fund"
    | "mixed";
}
```

---

## 10.2 Position

```ts
interface Position {
  accountId: string;

  symbol: string;

  assetType:
    | "stock"
    | "etf"
    | "fund";

  quantity: number;

  costPrice: number;

  realizedProfit: number;

  updatedAt: Date;
}
```

支持：

* 单账户持仓
* 合并持仓
* 多账户资产分布
* 股票 / ETF / 基金资产占比

---

# 11. 交易流水 Ledger

长期来看，交易流水是资产系统的核心数据。

原则：

> 持仓是结果，交易流水是事实。

支持：

```text
BUY
SELL

DIVIDEND
BONUS
SPLIT

TRANSFER_IN
TRANSFER_OUT

FEE
TAX
```

由 Ledger 推导：

```text
交易流水
    ↓
Portfolio Engine
    ↓
当前持仓
```

以及：

```text
交易流水
    ↓
Portfolio History
    ↓
历史收益
```

---

# 12. Dashboard

展示：

```text
总资产
今日收益
累计收益
历史收益率
最大回撤
```

资产结构：

```text
股票
ETF
基金
现金
```

同时展示：

* 今日贡献最大持仓
* 今日拖累最大持仓
* 当前风险数量
* 风险等级
* 今日策略信号
* 重要事件

---

# 13. 风控中心

## 13.1 个股风险

支持：

```text
止损
止盈
移动止损
价格突破
最大回撤
波动率
ATR

MA
MACD
RSI
```

---

## 13.2 账户风险

支持：

* 单股仓位
* 单行业集中度
* 资产类别集中度
* 相关性
* 最大回撤
* 高波动资产占比

---

# 14. Rule Engine

风控逻辑统一通过规则引擎执行。

示例：

```text
IF
    price < stopLoss
THEN
    ALERT
```

复杂规则：

```text
IF
    close < MA20
AND
    price < mainChipPeak
AND
    profitRate < -8%
THEN
    HIGH_RISK
```

后续支持规则类型：

```text
行情
技术指标
筹码
账户
财务
事件
策略
```

---

# 15. 筹码价格分布

## 15.1 定位

系统提供：

> 估算筹码价格分布

而非真实账户持仓成本。

---

## 15.2 输入数据

基础模型使用：

```text
OHLC
成交量
成交额
换手率
流通股本
```

后续可增加：

```text
分钟成交
分笔成交
```

---

## 15.3 输出

```ts
interface ChipDistribution {
  symbol: string;

  date: string;

  buckets: {
    price: number;
    weight: number;
  }[];

  averageCost: number;

  profitRatio: number;

  range70: [number, number];

  range90: [number, number];
}
```

展示：

* 筹码价格分布
* 平均成本
* 主筹码峰
* 次筹码峰
* 获利盘
* 套牢盘
* 70% 成本区
* 90% 成本区
* 筹码集中度
* 筹码峰移动

---

# 16. 通知系统

统一定义：

```text
NotificationProvider
├── Feishu
├── WebPush
├── Email
└── Webhook
```

MVP：

```text
飞书
```

---

## 16.1 风险通知

示例：

```text
🔴 风控提醒

贵州茅台 600519

当前：1418.22
成本：1540.00

收益：-7.91%

已触发：
价格 < 1420

当前持仓占比：
12.8%
```

---

## 16.2 日报

每日收盘后生成：

```text
投资日报

总资产
今日收益
累计收益

Benchmark

贡献最大
拖累最大

当前风险
筹码变化
重要公告

AI 总结
```

---

# 17. 策略系统

支持：

* 股票策略
* ETF 策略
* 趋势策略
* 均线策略
* RSI
* MACD
* 网格
* 定投
* 动量
* ETF 轮动
* 多因子

核心流程：

```text
策略
 ↓
回测
 ↓
模拟盘
 ↓
策略信号
 ↓
风险判断
 ↓
通知
```

---

# 18. 回测系统

## 18.1 MVP

优先支持：

```text
日线回测
```

免费数据即可满足长期日线策略研究。

---

## 18.2 A 股交易规则

回测必须考虑：

```text
T+1
涨跌停
停牌
复权
分红
除权除息
手续费
印花税
滑点
最小交易单位
```

---

## 18.3 输出指标

包括：

```text
累计收益
年化收益
最大回撤

Sharpe
Sortino

胜率
盈亏比

Alpha
Beta

换手率
交易次数
```

并支持 Benchmark：

```text
沪深300
中证500
对应指数 ETF
```

---

# 19. AI 投资助手

## 19.1 原则

AI 不直接获得原始数据库权限，而是通过 Tool 调用业务能力。

```text
LLM
 ↓
Tools
```

---

## 19.2 Tools

初步定义：

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
```

---

## 19.3 示例

用户：

```text
我现在最大的风险是什么？
```

AI：

```text
获取持仓
 ↓
获取实时行情
 ↓
执行风险扫描
 ↓
分析账户结构
 ↓
分析筹码
 ↓
检查事件
 ↓
返回结果
```

---

# 20. AI 策略生成

允许自然语言生成策略。

例如：

```text
设计一个沪深300 ETF 趋势策略。
```

AI：

```text
生成 Strategy
 ↓
runBacktest
 ↓
读取结果
 ↓
分析问题
 ↓
修改策略
 ↓
重新回测
```

AI 仅生成研究结论和信号。

不得自动执行真实交易。

---

# 21. 投资日志

记录：

```text
买入原因
卖出原因
预期收益
止损计划
仓位计划
持有周期
情绪
备注
```

示例：

```text
2026-07-31

买入：
510300

价格：
4.21

金额：
20000

原因：
估值进入历史低位区域。

计划：
分三次建仓。

止损：
-8%
```

---

# 22. AI 复盘

结合：

```text
交易流水
投资日志
真实收益
风控事件
```

识别：

```text
追涨
未执行止损
仓位过高
交易频率过高
错误加仓
过早止盈
```

形成行为分析。

---

# 23. 事件中心

支持：

```text
财报
业绩预告
分红

停复牌
解禁
减持

重大合同
监管公告

基金分红
基金经理变更
```

重点展示：

> 与当前持仓和自选资产相关的事件。

---

# 24. 免费 MVP 能力范围

完全使用免费行情数据时可实现：

| 能力       | MVP        |
| -------- | ---------- |
| A 股实时行情  | 支持         |
| ETF 实时行情 | 支持         |
| 基金净值     | 支持         |
| 日 K      | 支持         |
| 分钟行情     | 支持，但长期历史有限 |
| 自选股      | 支持         |
| 实时盈亏     | 支持         |
| 截图导入     | 支持         |
| 多账户      | 支持         |
| 止损提醒     | 支持         |
| 飞书通知     | 支持         |
| 技术指标     | 支持         |
| 筹码估算     | 支持         |
| 日线回测     | 支持         |
| AI 分析    | 支持         |
| 财务分析     | MVP 支持     |
| 公告       | MVP 支持     |
| 多年分钟回测   | 暂不支持       |
| 历史 Tick  | 暂不支持       |
| L2       | 暂不支持       |

免费行情的风险：

```text
接口变化
限流
数据异常
临时不可用
延迟
缺乏 SLA
```

因此所有止损功能均属于：

> 风险提醒，而不是交易执行保证。

---

# 25. 数据源演进

## V0

```text
AKShare
easy-tdx
AData
```

数据成本：

```text
0 元
```

---

## 后续

Provider 可增加：

```text
Tushare
iFinD
JQData
RQData
Choice
Wind
```

根据需要购买：

```text
高可靠实时行情
多年分钟数据
Tick
L2
Point-in-Time 财务
专业公告
商业授权
SLA
```

---

# 26. 产品路线图

## V0.1 免费 MVP

目标：

验证核心产品价值。

功能：

```text
行情
自选

截图导入
手动持仓
统一持仓

实时盈亏

止损
止盈
价格提醒

飞书通知

筹码估算

日线回测

AI 基础分析
```

---

## V0.2 数据稳定版

目标：

提高免费行情系统可靠性。

增加：

```text
Provider 抽象

自动 Failover
数据源优先级
超时
重试
限流

数据健康检查
异常检测
一致性校验

日 K 落库
分钟行情落库
```

---

## V0.3 投资管理版

增加：

```text
多账户

批量截图导入
长截图

交易流水 Ledger

历史持仓
持仓快照

完整收益计算
资产配置
```

---

## V0.4 风控增强版

增加：

```text
Rule Engine

技术指标规则
账户风险

筹码模型升级
筹码集中度
筹码峰变化

复杂规则组合
```

---

## V0.5 策略与回测

增加：

```text
Strategy Engine

股票策略
ETF 策略

多标的

完整 A 股交易规则

Benchmark

参数优化
Walk Forward
```

---

## V0.6 AI Agent

增加：

```text
AI Tools

持仓分析
风险分析
行情分析
财务分析

公告分析

策略生成
自动调用回测
```

---

## V0.7 投资复盘

增加：

```text
投资日志

交易计划
交易理由

AI 行为分析

错误模式识别
周期复盘
```

---

## V0.8 专业数据

增加可选：

```text
Tushare
iFinD
JQData
RQData
Choice
```

架构保持：

```text
免费 Provider
+
专业 Provider
```

由用户配置数据源。

---

## V0.9 自动化

增加：

```text
开盘前提醒
盘中风险扫描
竞价异动
收盘数据同步
投资日报
投资周报

AI 自动总结
```

---

## V1.0 个人投资中台

最终形成：

```text
                 Investment OS

                      AI
                      │
       ┌──────────────┼──────────────┐
       ↓              ↓              ↓
      行情            资产            风控
       │              │              │
       ↓              ↓              ↓
    Market           Ledger        Rule Engine
       │              │              │
       ├──────────────┼──────────────┤
       ↓              ↓              ↓
      筹码            策略            复盘
                      │
                      ↓
                   Backtest
                      │
                      ↓
                  Notification
                      │
               App / Desktop / 飞书
```

---

# 27. MVP 开发优先级

按照以下顺序开发：

```text
P0
行情 Provider
行情标准模型
实时行情
历史行情

P0
账户
截图识别
持仓
盈亏

P0
止损规则
飞书通知

P1
行情落库
Redis
Provider Failover

P1
筹码估算
账户风险

P1
日线回测

P2
交易流水

P2
AI Assistant

P2
投资日志
```

---

# 28. MVP 核心验证指标

第一版不是验证：

> 能不能实现一个完整股票软件。

而是验证用户每天打开系统后能否快速得到：

```text
我现在有多少钱？

今天赚了多少？

哪只股票正在亏？

哪些持仓有风险？

是否触发我的止损计划？

筹码结构有没有明显变化？

今天有什么必须关注？

有没有需要我做的事情？
```

如果这些问题能够比传统行情 App 更快、更围绕个人持仓回答，MVP 即视为达到核心产品目标。

---

# 29. 核心设计原则

### 1. 数据源可替换

```text
业务 ≠ AKShare
业务 ≠ Tushare
```

所有外部数据必须通过 Provider。

### 2. 交易流水优先于持仓结果

```text
Ledger → Position
```

### 3. 免费数据优先验证产品

MVP 不提前为专业行情付费。

### 4. 自建历史数据库

从系统上线第一天开始长期沉淀行情。

### 5. AI 不直接决策交易

AI 负责：

```text
分析
研究
总结
策略生成
风险解释
```

不负责：

```text
自动实盘下单
```

### 6. 风险提醒不能视为交易系统 SLA

免费行情可能异常，应明确提示：

> 风险提醒仅作为辅助信息。

### 7. 行情、策略、风控和 AI 使用统一数据模型

避免多个模块分别维护一套行情和资产逻辑。

---

# 30. 后续方向

## V2 高级个人量化

```text
因子研究

策略组合
组合优化

风险模型

Monte Carlo
Walk Forward

模拟盘

组合级回撤控制
```

核心从：

```text
哪只股票值得买
```

逐渐发展为：

```text
整个账户应该如何配置和控制风险。
```

---

## V3 商业化

若未来对外发布，需要补充：

```text
数据商业授权

用户体系
订阅

多租户
数据隔离

云同步

权限
审计

运行监控
告警

高可用
SLA

监管与合规
```

并区分：

```text
免费数据版

专业数据版
```

专业用户可以自行配置第三方数据源。
