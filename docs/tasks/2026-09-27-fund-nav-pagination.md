# 基金净值分页任务

对应 [规格](../specs/2026-09-27-fund-nav-pagination.md)。

- [x] P0：目标 TLS 校验开启，pageSize=2 返回两行、TotalCount=6014、成功元数据。
- [x] P1：实现有界读取、结构与总量校验，接入既有 Efinance adapter。
- [x] P2：覆盖页缺失/重复/总量变化/响应超限/失败不发布，以及适配器回归；相关 36 项通过，关键错误 flake8 通过。
- [x] P3：官方同步及摘要一致；目标真实 Reader 首次完成 7 页/6014 条，生产校验与目标容器受控网关 HTTP 消费通过。

探针 `/private/tmp/goal-nav-pagination-inspect-20260927.py` 未写业务状态，不构成已完成分页能力。

额外消费者边界、ProviderRuntime 与网关回归 37 项通过。官方同步完成，日志 `/private/tmp/goal-nav-pagination-sync-20260927.log`。真实分页及 HTTP 探针为 `/private/tmp/goal-nav-pagination-probe-20260927.py`，首次通过，无需重试。目标容器内使用真实数据与生产 router 的受控网关，不修改常驻服务策略；不能据此声称实际策略本次选中 Efinance。镜像未变，代码位于可写层。完整证据见 DSA `docs/thesis-ledger-nav-source-evidence.md`。
