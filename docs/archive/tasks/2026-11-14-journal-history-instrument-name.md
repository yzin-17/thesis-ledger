# 历史快照标的名称任务

[现行规格](../../specs/2026-11-14-journal-history-instrument-name.md) · [结案证据](../../evidence/2026-11-22-active-task-followup.md#周期复盘与历史标的)

- [x] 快照历史响应增加 `instrumentDirectory`；服务端按当前页批量解析标的。
- [x] 历史快照列表显示“名称 · 代码”，目录无名称时保留代码。
- [x] API 传输合同定向测试（8/8 通过）、Schema 和 API Client 构建、变更文件 `git diff --check` 通过。
- [x] Desktop、Server 完整类型检查及 Desktop 生产构建通过，原并行类型阻塞已解除。
- [x] 2026-11-22 核对目标模块与宿主一致。四个宽度均从实际目标接口读取两条「名称 · 代码」样本，冻结详情和关联解读返回 200。未知目录名称的代码回退沿用原定向验证。
