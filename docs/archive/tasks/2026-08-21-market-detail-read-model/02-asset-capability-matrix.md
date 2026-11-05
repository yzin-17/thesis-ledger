# 02 — ETF/基金能力矩阵闭环

**建设内容：** 在股票最小闭环之上接入 Server 能力矩阵，使 ETF、基金和未知资产按服务端声明的能力安全加载，避免客户端自行判断 Provider 规则。
**前置依赖：** Ticket 01 — 股票 Market Detail 最小闭环
**状态：** 已完成并归档；2026-10-16 浏览器矩阵与证据边界见[父 Task](../2026-08-21-market-detail-read-model.md)。

- [x] 为 `ETF` 固化 quote、bars、MA、MACD、RSI 的可用能力，并将 chip、ATR 标记为不支持且不发起对应 Provider 请求。
- [x] 为 `MUTUAL_FUND` 提供最新 Fund NAV 与 NAV history 分段；不把基金误当作证券行情去请求 quote、技术指标或 chip。
- [x] 对资产类型未知或解析失败的情况执行只读解析和安全降级：不写入错误身份，不触发类型专属的错误请求，并保留可解释的能力信息。
- [x] 在 detail 响应中表达 `unsupported` 分段；Desktop 默认隐藏不支持模块，在可用性或诊断区域保留解释入口。
- [x] 补齐股票、ETF、基金和未知类型的 API、Server 编排、能力筛选与 Desktop 渲染回归测试。

验收标准：

- [x] ETF 详情真实显示 quote、bars、MA、MACD、RSI；chip 与 ATR 不产生独立请求，“数据可用性”解释不支持的能力。
- [x] 基金详情使用单次 NAV/NAV history 请求，不产生证券行情请求；正向受控样本已绘图、悬停、锁定并通过窄屏检查，真实路由不可用观察独立保留。
- [x] 未知资产不会写入错误的资产身份；页面仍能显示本地持仓上下文和可安全获取的通用信息。
- [x] 已支持但未实现的能力通过 200 响应中的 `unsupported` 分段表达，而不是伪装成 Provider 失败。

范围外：新增 DSA Contract V1 能力、改变现有 Provider 路由策略，以及完整的 stale/unavailable/retry 交互由后续 Ticket 处理。
