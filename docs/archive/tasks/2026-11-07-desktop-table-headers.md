# Desktop 列表表头统一实施任务

对应[Spec](../../specs/2026-11-07-desktop-table-headers.md)。

## 当前执行摘要

T1～T4 与最终一致性审查全部通过，任务完成并归档。现行 Spec 继续维护展示合同；完整清单和分层结果见[验收记录](../evidence/2026-11-07-desktop-table-headers.md)。保留工作区既有改动，真实数据只读。

## 任务

- [x] T1：统一共享表头与固定操作列表头（AC1、AC2）。入口为 `components/ui/table.tsx`、`features/shared/StickyTableActions.tsx`；只调整展示契约，运行现有操作列及 UI 定向测试。完成条件为普通／固定表头共用默认值且固定行为保留。
- [x] T2：统一账户、组合、收益表头及排序标题（AC1～AC3）。依赖 T1；写集为 `features/account-data/AccountDataSections.tsx`、`features/portfolio/*` 内表格与 `features/performance/PerformanceSections.tsx`。保留布局、数据和排序语义，执行对应测试及截图中两个入口的浏览器比较。
- [x] T3：统一其余列表并建立源码约束（AC1、AC2、AC4）。依赖 T1；写集为剩余清单中的 Desktop feature 表头、相关契约测试及 UI 指南。检查策略、风险、Provider、自选、AI、复盘、资料与模型竞技场，记录无表头列表的保留理由；定向检查通过后执行 Desktop 类型检查／构建与现有边界门禁。
- [x] T4：完成四宽浏览器检查与最终审查（AC2～AC4）。依赖 T2、T3；复用开发服务器及只读 API，受控入口覆盖共享表格、固定列、排序与派生表格；真实页面检查跨页一致性。完成条件为四宽无页面溢出、排序／弹层／操作列正常，清单无遗漏，证据及当前状态一致。

## 验收映射

AC1：T1～T3；AC2：T1～T4；AC3：T2、T4；AC4：T3、T4。

## 计划预检

通过。共享契约先行，消费者按业务区域分段；每项写集、依赖与完成条件明确。无需新增权限、依赖或外部服务。

## 最终一致性审查

通过。AC1～AC4 分别由共享组件、34 处声明清单、全量 AST 契约、1652 项 Desktop 测试、构建、边界检查及 80 组四宽双主题浏览器结果支持。新入口、排序与固定操作列保持；本次临时 API 快照与真实读取的边界在证据中明确。全部任务完成，无本任务持有的未决事项。
