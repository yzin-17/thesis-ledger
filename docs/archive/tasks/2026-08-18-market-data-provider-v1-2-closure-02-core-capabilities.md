# 02 — 将核心市场数据能力迁入统一网关

**要构建的能力：** Quote、Daily Bar、Fund NAV 和 Fund NAV History 从请求到 Provider 响应均经过统一网关，严格遵循当前 Effective Policy 的 Provider 顺序、eligibility、fallback 和 provenance 语义。

**阻塞于：** 01 — 兼容扩展统一数据网关。

**状态：** completed

- [x] 四项能力只能调用 Effective Policy 中 eligible 的 Provider，不存在隐藏 fallback。
- [x] 禁用、未配置或 circuit open 的 Provider 不会收到上游请求，并返回稳定诊断信息。
- [x] Quote/NAV 使用 record-level fallback，Bar/NAV History 使用 sequence-level fallback，且不发生字段级混源。
- [x] Data Contract 兼容性与真实 Provider provenance 由回归测试覆盖。

## 验证证据

- 四条核心 facade 已统一经过数据网关，Indicator/Chip 仍留给后续 Ticket。
- DSA 核心 facade、网关、Control/Contract、Provider runtime 和 efinance 回归共 40 项通过。
- `X-Request-ID` 已贯穿 gateway 错误并映射到相同的 `requestId`/`diagnosticId`。
- 受影响 Python 文件 `py_compile` 与 DSA 仓库 `git diff --check` 通过。
