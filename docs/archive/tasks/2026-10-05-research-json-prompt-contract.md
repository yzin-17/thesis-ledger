# 研究文本 JSON 输出字段合同任务

配对规格：[输出字段合同](../../specs/2026-10-05-research-json-prompt-contract.md)。状态：字段合同叶完成并归档。既有 Journal 复盘规格和 AI 生命周期仍为事实、权限和终态验收来源。

- [x] T1 状态与合同：记录真实失败码与缺失字段；建立 Schema 所有者的输出说明 helper，直接验证必填字段及引用结构，保留失败 Run。
- [x] T2 执行面消费：研究 Executor 将说明作为独立系统消息传入 SDK，保持原上下文、冻结事实、审计、预算和 CAS；定向研究/SDK/Journal 回归通过。
- [x] T3 静态与工程门禁：受影响类型/build/lint、模块边界和尺寸 ratchet 通过。
- [x] G1 目标验收：保数据结构升级和官方更新后，用新请求验证实际 Journal 单笔与周期报告；旧失败不重试或覆盖。目标在途恢复和客户端另行验收。

本地证据见[输出合同验证](../../tasks/evidence/2026-10-05-research-json-prompt-contract.md)。定向 36 项、AI/Journal 回归 293 项通过，46 项环境测试跳过；类型、build、直接 lint、边界和尺寸 ratchet 通过。

2026-10-05 新请求验收：目标升级与提示部署后，当前 LM Studio 默认下单笔和周期 v2 报告均成功，引用和关键事实核对通过，旧 Run 保留。G1 由[目标内容证据](../../tasks/evidence/2026-10-05-journal-model-content-v2.md)关闭；以下为升级时的历史检查点。

目标已有研究默认 OpenRouter/revision 1，原生 Schema 用途验证成功并保存。前序单笔和周期请求均 succeeded；单笔有 1 条可追溯证据，周期仅通用结论且证据为空，当时内容质量仍待验收。旧 research_schema_invalid Run 保留。2026-10-05 目标已通过保数据升级至 28 项结构并经官方更新部署新提示，编译文件哈希与源码匹配，三条旧 Run 和默认配置保留；详见[部署基线](../../tasks/evidence/2026-10-05-target-preserve-upgrade-baseline.md)。该检查点未发起新请求，后来 G1 按上方新报告证据关闭。前序模型证据见[实际来源与模型证据](../../tasks/evidence/2026-10-05-source-and-research-default.md)。
