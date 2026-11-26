# 标的多选入口统一任务

## 当前状态

已完成并归档。四处标的多选入口使用框内标签回显，Mobile 两处四档宽度验收通过。两端使用既有目录契约，不涉及服务端或原生依赖变化。

规格：[标的多选入口一致性](../../specs/2026-11-12-instrument-multiselect-consistency.md)。证据：[排查与验收记录](../evidence/2026-11-12-instrument-multiselect-consistency.md)。

## 执行清单

- [x] T01：排查 Desktop/Mobile 标的选择与集合编辑入口，区分真正多选和单选、逐条入库、只读集合。（AC04）
- [x] T02：补齐 Mobile 共享标签输入及两处竞技场入口；复用目录搜索和原业务校验，定向验证单选隔离与失败恢复。（AC01–AC03）
  - 输入：`InstrumentPicker.tsx`、`ArenaLiveSetupScreen.tsx`、`ArenaSetupScreen.tsx`、`MobilePrimitives.tsx` 的既有交互和主题。
  - 写入：原生标签输入组件、选择器的可选多选契约、两处消费者、定向测试和目录所有权门禁；不修改原生依赖或单选确认流程。
  - 完成条件：两处使用共享多选契约，单选及多选定向测试、Mobile 类型检查通过。
- [x] T03：实际组件浏览器验收与最终一致性核对，记录排查范围、证据类型和验证限制。（AC01–AC05）
  - 依赖：T02；复用 Desktop 本会话已通过的四档宽度和已选搜索证据。
  - 入口：`scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs`、Mobile 受控浏览器宿主；检查 1440、1024、768、390 宽度。
  - 完成条件：Mobile 浏览器交互和布局通过；证据、规格和任务状态一致。

## 排查结论

Desktop 的 `ArenaLiveSetup`、`ArenaSetup` 已使用 `InstrumentMultiSelect`；Mobile 对应两处仍需统一。研究、策略执行、策略起草确认、复盘筛选、行情、定投、持仓与交易表单均为单标的输入。自选添加选择一项即提交并关闭，属于逐条入库；导入批量勾选针对记录而非目录标的，均保留现有业务交互。模型、来源、指标多选不属于标的多选。

## 最终一致性核对

- [x] 验收断言、实现消费者与测试覆盖一致
- [x] 必要浏览器验收通过，受控输入和真实业务数据边界明确
- [x] 复用已有有效证据，无未处理的当前范围缺口
- [x] 保留既有工作区改动，未创建提交或部署

结论：通过。原生设备实测与原生编译不在本轮声明的验收范围；未变更原生依赖或工程。详细检查命令、最后结果和范围见独立证据。
