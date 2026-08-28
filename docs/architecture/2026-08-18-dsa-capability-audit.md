# DSA 能力与主仓边界审计摘要

## 文档定位

本文是当前架构入口，汇总 DSA Fork 的能力审计和 ThesisLedger 的所有权边界。完整的历史调用、fixture、原始输出和当时的未决项保留在 `docs/archive/architecture/`，不在这里重复维护。

审计基线主要为 DSA Fork 提交 `831ada5370123551e5cb4fc099208dd70e892e22`；具体运行日期和环境以归档审计为准。

## 能力边界摘要

| 能力             | DSA 可复用部分                                                     | ThesisLedger 必须拥有的边界                                                   |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 行情与筹码       | Provider Fetcher、行情/指标/筹码计算、Provider fallback 和运行诊断 | Data Contract、标准化 Schema、provenance、质量状态、长期 Bar Store 和产品缓存 |
| Portfolio / Risk | 上游账户、交易、估值和风险行为可作为 fixture 或对照                | Account、Ledger、Position Projection、Snapshot、RiskRule、RiskEvent 和事实源  |
| Notification     | 飞书 Sender、底层重试和幂等能力                                    | RiskEvent 到通知的编排、severity、静默、Daily Digest、Delivery Result 和审计  |
| AI / Tool        | Tool Registry、Tool Policy、ToolSurface、超时/取消、Provider Trace | AI Provider Registry、Prompt/Token/Cost/Decision Log、Tool 权限和真实组合事实 |

### 行情与筹码

- DSA 的 AKShare、efinance、Tushare 等 Provider 能力必须通过窄 Data Contract 或 Adapter 接入，不能把上游原始响应直接暴露给客户端。
- DSA 股票行情路由不自动代表基金行情；基金需要明确的 Fund Adapter 和能力声明。
- 筹码缺失、Provider 断连或缺少 Token 时保持 unavailable，不用零值或 AI 补值；主系统补充 `engineVersion`、`calculatedAt`、Provider、marketTime 和 price buckets。
- 交易日历、长期落库、数据完整性和质量问题属于主仓边界。

### Portfolio、Risk 与通知

- DSA Portfolio 只能作为行为 fixture、迁移对照或回归样例，不是 ThesisLedger 的资产事实源。
- DSA 的 Risk 结果可以作为 Evaluation Context；规则版本、RiskEvent、通知治理和 Audit Log 仍由 ThesisLedger 拥有。
- 客户端只访问 ThesisLedger API；DSA 不直接写入 Ledger，也不拥有用户组合事实。

### AI 与 Tool

- 生产接入需要由 ThesisLedger 根据账户授权生成 `ToolAccessContext`，DSA 只接收允许的股票范围、市场、时间窗和数据源。
- Portfolio/Risk/Trade Plan Tool 默认从 ThesisLedger 获取结构化事实；DSA 自有 Portfolio 只能用于迁移期间对照。
- Tool 结果必须保留 Provider、marketTime、dataQuality、traceId 和 citation；未验证内容不得被标记为已验证结论。
- 正式接入仍需 Investment OS Tool Registry → DSA ToolSurface Contract Test，以及至少一个可审计的真实 LLM Provider 验证。

## 不变量

1. 客户端不直连 DSA；跨仓访问使用版本化 Contract。
2. DSA 是外部能力服务，不是 Account、Ledger、Position、Snapshot 或 RiskEvent 的事实源。
3. Provider 不支持的能力必须显式返回 unsupported/unavailable，不得由路由名称或默认值伪装支持。
4. DSA 原始字段、凭证和运行参数不进入 ThesisLedger 领域模型。
5. 失败、陈旧、缺少凭证和没有数据必须保持可解释，不能被静默 fallback 或零值覆盖。

## 历史详细审计

- [DSA 行情能力审计](../archive/architecture/2026-08-18-dsa-capability-market.md)
- [DSA 筹码实现审计](../archive/architecture/2026-08-18-dsa-chip-audit.md)
- [DSA Portfolio / Risk 能力审计](../archive/architecture/2026-08-18-dsa-capability-portfolio-risk.md)
- [DSA Notification 能力审计](../archive/architecture/2026-08-18-dsa-capability-notification.md)
- [DSA AI 与 Tool 能力审计](../archive/architecture/2026-08-18-dsa-capability-ai.md)
