# DSA AI 与 Tool 能力审计

## 复用边界

DSA 当前包含模型 Provider、Agent Executor、Tool Registry、Tool Policy、取消/超时控制、Provider Trace、单股分析和 Portfolio/Risk Agent。`ToolSurface` 是 Python API，故本审计把它作为 DSA AI 与外部上下文之间的最小可验证边界；生产客户端仍只能访问 Investment OS API，不直接调用 DSA。

Investment OS 继续拥有 AI Provider Registry、Prompt Version、Token/Cost Log、Decision Log 和 Tool Permission。DSA 的分析能力可以作为可替换 Research Worker，但 Portfolio Agent 不能把 DSA Portfolio 当作事实源。正式接入时需要一个薄适配层，把 `getPortfolio`、`getPositions`、`getRiskHistory` 等 Investment OS Tool 注册到 DSA 的 Tool Surface，并用 `aiAnalysisSchema` 校验输出；关键 claim 缺少 citation 时不能标记为已验证结论。

## 真实 Fork 最小 Tool 链

审计镜像：`investment-os-dsa:831ada537012`，Fork 提交为 `831ada5370123551e5cb4fc099208dd70e892e22`。在干净 SQLite 容器中先创建账户并录入一笔 `600519` 买入交易（10 股、成交价 1200、手续费 1.2），随后在容器内执行：

```python
registry = get_tool_registry()
surface = ToolSurface(registry)
surface.execute_tool("get_realtime_quote", {"stock_code": "600519"}, stock_context)
surface.execute_tool(
    "get_portfolio_snapshot",
    {"account_id": 1, "include_positions": True, "include_risk": True},
    audit_context,
)
```

2026-08-01 实测结果：

| 检查项         | 结果                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| Registry       | 18 个工具，全部 `policy_status=declared`，没有不支持的 scope dimension                  |
| Quote Tool     | `ok=true`；`600519` 返回贵州茅台，价格 1350.6，来源 `tencent`                           |
| Portfolio Tool | `ok=true`；返回账户、持仓、成本、实时市值、未实现盈亏和 Risk 集中度                     |
| Audit          | 结果带 `tool_name`、参数摘要、耗时、结果摘要和 `audit_context`，不会暴露 Python handler |
| Scope 拒绝     | 在只允许 `600519` 的 context 下请求 `000001`，返回不可重试的 `stock_scope_violation`    |

上述链路证明 DSA Tool Surface 可以受外部 context 驱动，并且会执行权限、股票范围、结构化结果和审计边界。它仍然是 DSA 内部 Portfolio 数据的审计样例，不是生产事实源；Investment OS Portfolio Tool 的薄适配仍是正式接入前置条件。此次没有调用外部 LLM Provider，因此没有把缺少 API Key 误报成模型验收通过。

## 生产接入约束

1. Investment OS 先根据账户和用户授权生成 ToolAccessContext，DSA 只接收允许的股票范围、市场、时间窗和数据源。
2. Portfolio/Risk/Trade Plan 相关工具默认从 Investment OS API 获取结构化结果；DSA 自带 Portfolio 仅作为迁移期间的对照或回归 fixture。
3. 所有 Tool 结果保留 provider、marketTime、dataQuality、traceId 和 citation；缺失时返回可解释的 unavailable，而不是让模型补值。
4. Tool timeout、取消、重试和敏感字段 redaction 由 Tool Surface/Adapter 统一处理，业务 Agent 不绕过该边界直接读取数据库。

## 未决项

- 需要补一条 Investment OS Tool Registry → DSA ToolSurface 的 Contract Test，验证真实 Portfolio 与 DSA 内部 Portfolio 不会混用。
- 需要至少一个可审计的真实 LLM Provider 配置后，才能验收 prompt、token/cost、calibration 和最终 citation；本次 T016 只验收工具边界与薄适配方案。
