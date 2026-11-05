# 01 — 股票 Market Detail 最小闭环

**建设内容：** 为 `STOCK` 建立 Server 共享读模型和 Desktop“行情详情”最小闭环，让客户端从一个市场详情入口读取当前已支持的行情能力。
**前置依赖：** 无，可立即开始
**状态：** 已完成并归档；2026-10-16 浏览器证据见[父 Task](../2026-08-21-market-detail-read-model.md)。下列 V1 路径和旧兼容记录属于初始实施，现行接口以 V3 Spec 为准。

- [x] 增加兼容性的 `GET /api/v1/market/:symbol/detail` 读取契约；默认返回该股票支持的 quote、bars、MA、MACD、RSI、chip 分段，`include`、`barsLimit`、`navLimit` 的校验规则与 Spec 一致。
- [x] 在 Server 侧编排已有行情能力，保持 quote、bars、指标和 chip 的既有字段语义；不新增 DSA bulk endpoint，不请求 ATR。
- [x] 为每个分段提供稳定的状态外壳和可诊断错误结构，确保单个分段失败不会破坏其他分段。
- [x] Desktop 的持仓行情详情使用共享读模型；持仓数量、成本、盈亏等本地持仓上下文即时显示，行情分段独立加载和渲染。
- [x] 保留旧行情接口及其响应兼容性，补充 API schema、Server 编排和 Desktop 基础渲染测试。

验收标准：

- [x] 合法股票请求返回 quote、bars、MA、MACD、RSI、chip 六个分段；真实股票前五项 ready、chip unavailable 的部分成功页面已核实，不把筹码来源不可用记为成功。
- [x] 非法 `include` 或超出上限的 limit 返回明确的 400；合法请求不会因某一个行情能力失败而整体失败。
- [x] 既有行情接口的兼容性测试保持通过，响应中不出现 Provider 原始错误内容。
- [x] 不产生 ATR 或未声明能力的 Provider 请求。

范围外：ETF、基金 NAV、未知资产类型的能力矩阵，以及完整失败恢复、请求去重和跨端最终验收由后续 Ticket 处理。
