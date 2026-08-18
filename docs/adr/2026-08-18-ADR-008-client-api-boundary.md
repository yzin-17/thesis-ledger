# ADR-008：客户端只访问 Investment OS API

## 背景

Desktop 与 Mobile 不应感知内部供应商和部署拓扑。

## 决策

所有客户端只依赖版本化的 Investment OS API 和共享 API Client。

## 后果

DSA 默认不发布宿主机端口；客户端可独立演进。

## 替代方案

客户端直连 DSA 会绕过权限、审计和降级策略，不采用。
