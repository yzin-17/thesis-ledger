# AI 实验标的名称展示

实施与验收：[已完成任务](../archive/tasks/2026-11-12-experiment-instrument-display.md)、[验证记录](../archive/evidence/2026-11-12-experiment-instrument-display.md)。

## 行为合同

- AC1：实验列表和详情由 Server 使用 `InstrumentDisplayService` 批量读取本地目录，附加当前 `instrumentDirectory` 与明确的 `executionSymbol`。同一页去重后一次批量解析，不逐行查询、跨市场猜名或调用远程 Provider。
- AC2：Desktop 实验列表、版本关联实验、详情和新建确认区以标的名称为主、完整代码为辅；Mobile 列表与详情消费相同投影。分页保留各页名称，不额外发起客户端目录请求。
- AC3：用户自定义实验名称、持久化默认名称、策略定义和历史冻结输入保持原样；名称只附加到当前读取响应。目录未知、歧义或故障回退完整代码，保持业务结果可读。
- AC4：覆盖已有策略与从零探索、重复代码批量查询、相同代码不同市场、目录故障、旧名称和历史不变；四宽浏览器与真实列表/详情只读验收通过后，正式最小快更并独立核对运行态。

Market 继续拥有名称解析，StrategyOptimization 拥有实验读取投影，Schemas 提供两端复用的展示投影。范围不包含实验失败原因修复或名称搜索扩展，不创建真实实验、调用 AI、修改路由或数据库结构，不提交或推送。
