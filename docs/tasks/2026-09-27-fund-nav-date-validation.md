# 基金净值日期实施任务

对应 [规格](../specs/2026-09-27-fund-nav-date-validation.md)。

- [x] N0：核对最新值日期仅做非空判断、API 字符串排序问题。
- [x] N1：共享日期解析并接入 Provider 最新值/历史校验与 API 最新值选择。
- [x] N2：日期边界与回退、序列及接口定向验证，46 项通过，关键错误 flake8 通过。
- [x] N3：官方目标同步、三份源码摘要一致；两条实际 adapter 的 000001 历史样本均首次通过，最新值与历史实际 HTTP 均首次返回 200。

同步日志 `/private/tmp/goal-nav-date-sync-20260927.log`。真实来源探针及 API 证据见 DSA `docs/thesis-ledger-nav-source-evidence.md`。目标选中 AKShare，历史最近五日顺序正确；Efinance 的独立样本不证明其完整分页或传输认证。镜像未变，新源码位于容器可写层。

R03 的披露时间、修订与完整来源门禁保持独立开放。
