# ADR-015：由 ThesisLedger Server 提供共享 Market Detail 读模型

## 状态

已接受。

## 背景

Desktop 当前在持仓详情组件中直接组合多个市场接口，并在客户端硬编码资产能力。该方式导致 ETF 请求只支持股票的 `CHIP_SUMMARY`、所有标的请求不支持的 ATR、局部失败阻塞整体详情，并在 React StrictMode 下放大重复请求。`Position` 的数量与成本和 quote、bars、指标、筹码、Fund NAV 属于不同领域，现有 `Position Detail` 命名和接口组合也不适合作为未来 Mobile 的共享能力层。

## 决策

由 ThesisLedger Server 提供客户端无关的 `GET /api/v1/market/:symbol/detail` 读模型。Server 根据已确认资产类型、Instrument Catalog 和 Effective Provider Policy 计算能力，按 section 返回 `ready`、`stale`、`empty`、`unsupported` 或 `unavailable` 状态；客户端只负责请求、展示和重试，不复制 Provider 路由规则。

Market Detail 与 Position 分离：Position 仍由 Portfolio/Position 数据提供数量和成本，Market Detail 只提供市场数据。股票、ETF 和场外基金使用各自正确的能力矩阵；不支持能力不触发 Provider 请求。Indicator 继续通过 DSA Contract V1 从统一 `DAILY_BAR` 派生，本阶段不新增 DSA 批量详情接口、不迁移指标计算，也不通过隐式 fallback 绕过现有 Contract。

Desktop 通过共享读模型消费详情，并使用 in-flight 去重、请求取消、分段部分成功和局部重试。Mobile 本阶段不新增 UI，仅保持共享 schema/API client 和现有只读边界兼容。

## 后果

- 浏览器从多个底层请求收敛为一个客户端详情入口，且无效能力不会被请求。
- 未来 Mobile、AI 或策略系统可以复用同一份客户端无关的 Market Detail 语义。
- 旧 Data Contract V1 路径保持兼容，能够增量发布和回滚。
- Server 需要维护能力解析、section 状态和聚合错误映射；详情接口的内部 DSA 调用数不在本阶段承诺完全减少。
- `unsupported`、`empty` 和 `unavailable` 成为需要长期保持稳定的用户可见语义。

## 替代方案

1. **继续由 Desktop 直接调用多个接口**：改动较小，但会继续复制能力规则、产生重复请求并阻塞局部失败，不采用。
2. **由每个客户端本地判断 ETF/基金能力**：短期实现快，但 Desktop、Mobile 和未来客户端会产生规则漂移，不采用。
3. **立即新增 DSA 批量详情 Contract**：可以进一步减少跨服务调用，但会扩大本阶段跨仓契约、版本和发布风险，暂缓到有内部调用观测证据后再单独决策。
4. **以 Position ID 聚合持仓和行情**：会把市场读模型绑定到持仓场景，无法复用到自选股或单独行情页，不采用。
