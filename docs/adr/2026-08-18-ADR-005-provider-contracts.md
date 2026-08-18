# ADR-005：外部能力 Contract 与 Adapter

## 背景

行情、AI 和回测供应方会变化。

## 决策

所有第三方能力经 Contract、Registry、Router 和 Adapter 接入，响应包含 Provider 与时间来源。

## 后果

可按能力降级和对账，但需要维护契约测试。

## 替代方案

业务层直接调用供应商 API 会泄露结构并阻碍替换，不采用。
