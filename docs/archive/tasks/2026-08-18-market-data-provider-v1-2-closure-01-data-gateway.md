# 01 — 兼容扩展统一数据网关

**要构建的能力：** 在不改变现有用户可见行为的前提下，为 ThesisLedger consumer 建立唯一的数据访问网关，使后续能力迁移拥有统一的 Effective Policy、Provider provenance、fallback 和错误语义边界。

**阻塞于：** 无——可立即开始。

**状态：** completed

- [x] 网关能够承载当前已声明 Capability 的标准输入、输出、Provider 身份和 fallback 信息。
- [x] 现有 Data Contract 响应结构和 DSA native analysis 行为保持兼容。
- [x] 确定性测试证明现有运行时可以通过新网关调用，且尚未迁移的路径不受影响。

## 验证证据

- DSA 相关回归与新增网关测试共 35 项通过。
- 受影响 Python 文件 `py_compile` 通过。
- DSA 仓库 `git diff --check` 通过。
- 本 Ticket 仅完成兼容扩展；现有 facade 的迁移和旧路由旁路删除仍由 02–04 负责。
