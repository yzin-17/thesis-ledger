# DSA 筹码实现审计

## 实现与数据源

DSA 通过 `DataFetcherManager.get_chip_distribution(stock_code)` 依次尝试已注册且未熔断的 Provider。当前上游实现包含：

- AkShare `stock_cyq_em(symbol=stock_code)`：取返回表的最新一行；A 股可用，ETF、指数、港股和美股直接返回空结果。
- Tushare `cyq_chips(ts_code, start_date, end_date)`：先取当日筹码明细，再取同日 `daily` 收盘价；没有 Tushare Token 或当日数据时返回空结果。
- Manager 对空值、占位值和缺少核心字段的结果继续尝试备用源，并记录 Provider run 与熔断状态。

## 输出字段与算法

统一输出 `ChipDistribution`：`code`、`date`、`source`、`profit_ratio`、`avg_cost`、`cost_90_low`、`cost_90_high`、`concentration_90`、`cost_70_low`、`cost_70_high`、`concentration_70`。Tushare 分支的确定性算法先按 `price` 升序排列，把 `percent` 归一化到 100%，计算累积分布；获利比例是价格不高于当前价的筹码比例，平均成本是加权均价，90%/70% 区间分别取 5/95 和 15/85 百分位，集中度为 `(high-low)/(high+low)`。

## 固定回归输入与实测输出

### 真实 Provider 调用（2026-08-01）

固定标的为 `600519`。调用 DSA Tool `get_chip_distribution("600519")` 的真实结果如下，原始输入和错误输出均保留：

```json
{
  "input": { "stock_code": "600519", "requested_at": "2026-08-01" },
  "output": { "error": "No chip distribution data available for 600519" }
}
```

本次容器没有配置 Tushare Token，AkShare/其他 Provider 请求遇到 `RemoteDisconnected`，因此不能把缺失结果当作有效筹码；这是当前环境的真实能力边界，不是用 AI 补值。

### 确定性算法 fixture（交易日 `2025-06-30`）

为使后续与 InStock 的同标的 benchmark 可重复，固定保存一份符合 Tushare `cyq_chips` 形状的输入 fixture。该 fixture 用于验证 DSA 归一化算法，明确标注为算法 fixture，不冒充生产 Provider 原始响应：

```json
{
  "stock_code": "600519.SH",
  "trade_date": "2025-06-30",
  "current_price": 1350.6,
  "rows": [
    { "price": 1200.0, "percent": 10.0 },
    { "price": 1250.0, "percent": 20.0 },
    { "price": 1300.0, "percent": 30.0 },
    { "price": 1350.0, "percent": 25.0 },
    { "price": 1400.0, "percent": 15.0 }
  ]
}
```

DSA `TushareFetcher.compute_cyq_metrics` 输出：

```json
{
  "获利比例": 0.85,
  "平均成本": 1307.5,
  "90成本-低": 1200.0,
  "90成本-高": 1400.0,
  "90集中度": 0.0769,
  "70成本-低": 1250.0,
  "70成本-高": 1350.0,
  "70集中度": 0.0385
}
```

## 与 Investment OS 的边界

DSA 筹码是公开行情上的估算能力，不能解释为真实账户持仓成本。Investment OS 归一化时仍需补 `engineVersion`、`calculatedAt`、provider、marketTime 和 price buckets；区间或核心字段缺失时保持 unavailable。该审计已经提供真实失败样例和固定算法 fixture，可直接作为 InStock 同标的 benchmark 的输入约定；真实 Provider 样本待具备可用数据源后追加。
