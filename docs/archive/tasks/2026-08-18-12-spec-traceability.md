# Spec Traceability Matrix

> 这是 V1.0 `T292` 的基础矩阵。开发过程中应持续补充“具体 Spec 条目 → 任务 → 测试/实现路径”，而不是到发布前一次性整理。

| Spec 领域 | 主要任务 | 阶段 |
|---|---|---|
| 主仓、DSA Fork、Docker、架构边界 | T001-T018 | Phase 0 |
| Asset / Quote / Bar / Indicator / Chip Contract | T019-T029 | V0.1 |
| Account / Position / Screenshot Import | T030-T045 | V0.1 |
| Portfolio / Dashboard | T046-T049 | V0.1 |
| 基础止损、止盈、集中度、RiskEvent | T050-T056 | V0.1 |
| 飞书 / cooldown / dedup / delivery result | T057-T059 | V0.1 |
| AI 基础分析 / Tool / provenance | T060-T064 | V0.1 |
| React Native 基础 / Screenshot 测试 / MVP E2E | T065-T070 | V0.1 |
| Provider / Fallback / Completeness / Freshness / Health | T071-T084 | V0.2 |
| 行情落库 / Trading Calendar / Backfill / Data Quality | T085-T094 | V0.2 |
| Ledger / Cost / Position Projection / Snapshot | T095-T108 | V0.3 |
| TTWROR / XIRR / Allocation / Rebalance | T109-T119 | V0.3 |
| Rule Engine / 技术指标 / 筹码 / 组合风险 | T120-T137 | V0.4 |
| Notification Governance / Risk Center | T138-T145 | V0.4 |
| Strategy Schema / Backtest Worker / A 股交易规则 | T146-T161 | V0.5 |
| PIT / Bias Prevention / OOS / Walk Forward / Analytics | T162-T175 | V0.5 |
| AI Provider / Tool 权限 / Provenance / Multi-step Agent | T176-T196 | V0.6 |
| Journal / Trade Plan / Behavior / Shadow / Counterfactual | T197-T219 | V0.7 |
| 专业 Provider / Credential / PIT Financial | T220-T232 | V0.8 |
| Scheduler / 盘前盘中收盘 / 日报周报 | T233-T254 | V0.9 |
| 迁移 / 备份 / 安全 / 可观测性 / 性能 | T255-T271 | V1.0 |
| Desktop / Mobile Release / UX / Testing | T272-T284 | V1.0 |
| 文档 / License / DSA 维护 / 最终验收 | T285-T294 | V1.0 |

## V1.0 最终核心链路

```text
创建账户
→ 截图导入并人工确认
→ 写入 Ledger
→ 重建 Position / Portfolio
→ 获取实时行情、指标、筹码
→ 触发 RiskRule / RiskEvent
→ 飞书通知
→ AI 基于 Tool 解释
→ Trade Plan / Journal
→ Strategy / Backtest
→ 自动收盘同步 / 日报
→ 周期复盘
```
