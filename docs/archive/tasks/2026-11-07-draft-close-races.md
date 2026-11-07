# 草稿关闭竞态保护任务

对应[规格](../../specs/2026-11-07-draft-close-races.md)。共享工作区已有业务改动全部保留；本任务不修改业务提交入口。

## 当前执行摘要

已完成。共享 Hook、18 个文件的 20 处调用及空快照门禁均已核对；9 个空快照入口已补齐实际内容和业务身份，其余入口按身份或已有 key 边界检查。实际消费者回归、237 个文件的 1352 项完整测试、构建、适用 ESLint 和仓库门禁通过；四宽 Chromium 验证真实表单和共享确认框，业务请求为 0。详细故障、输入范围与外部操作边界见[证据](../evidence/2026-11-07-draft-close-races.md)。

## 任务

- [x] T1：晚到关闭确认只作用于当前可关闭草稿。
  - 覆盖：AC1～AC4。
  - 上下文：`src/features/shared/useDraftCloseGuard.ts` 与已有 `test/draft-close-confirmation.test.tsx`，全局导航保护只读对照。
  - 写集：共享 Hook、该回归测试与本主题文档。
  - 完成条件：忙碌、草稿变更、关闭重开、卸载、回调更新、取消及重入全部按规格收敛；原有直接关闭保留。
  - 验证：真实 Hook 与 React 提交更新、可控制的确认 Promise，定向消费者测试。
- [x] T1.1：现金与持仓边界的关闭快照。
  - 覆盖：AC2、AC3；依赖 T1。
  - 写集：现金入账、划转、现金观察三个 Sheet 与 `PortfolioTradeOpeningBoundarySheet.tsx` 的 Hook 参数及对应定向回归。
  - 完成条件：保留原 dirty/忙碌/写入行为，快照包含业务身份和实际编辑字段；实际组件的目标变化不消费旧确认。
- [x] T1.2：研究与风险的关闭快照。
  - 覆盖：AC2、AC3；依赖 T1。
  - 写集：`NewResearchSheet.tsx`、`RiskRuleEditorSheet.tsx` 的 Hook 参数及对应定向回归。
  - 完成条件：模型、研究范围、问题及风险规则编辑内容能够使旧确认失效，不新增模型或来源请求。
- [x] T1.3：复盘编辑的关闭快照。
  - 覆盖：AC2、AC3；依赖 T1。
  - 写集：`AdvancedJsonSheet.tsx`、`EvidenceEditorSheet.tsx`、`review/JournalDraftSheet.tsx` 的 Hook 参数及对应定向回归。
  - 完成条件：JSON、证据和分析草稿更新后不消费旧确认；保留精度、校验与应用操作。
- [x] T1.4：补齐已有快照的上下文与自动门禁。
  - 覆盖：AC2、AC3、AC6；依赖 T1。
  - 写集：审计/划转更正、研究提交、回测参数、目标编辑及自动化编辑的 Hook 参数；`scripts/draft-close-boundaries.mjs` 及测试、`check-boundaries.mjs` 接线。
  - 完成条件：切换已有业务身份和模型选择使旧确认失效；定投计划与发生项沿用已有 key 卸载边界。AST 门禁只针对真实调用，业务字段和说明文字不误报。
- [x] T2：集成与浏览器验收。
  - 启动依赖：T1、T1.1～T1.4 定向验证通过。
  - 覆盖：AC5。
  - 写集：`apps/desktop/test/browser-draft-close-{races,consumers}.{html,tsx}` 受控入口与本主题文档；不修改业务页面的提交行为。
  - 完成条件：Desktop 完整包/构建、相关仓库门禁通过；真实 Chromium 验证确认期间开始提交、内容变化、面板重开，覆盖 1440/1024/768/390，无整页横向溢出。
  - 受控页面使用真实共享确认弹窗和 Hook，全部状态在内存内，不请求业务 API。

## 最终一致性复核

通过。AC1～AC4 有旧实现失败及修复后通过的挂载回归；AC2/AC3 补充了现金、JSON 和风险的真实组件目标更新用例。AC5 有稳定输入的完整包、构建和四宽浏览器，AC6 有四项 AST 门禁测试及实际仓库检查。消费者写集只补齐快照身份，不改变业务写入、精度和保存流程；定投编辑器沿用已有 key 卸载边界。没有未决验收或需转移的 TODO。未提交、部署或发布；本地任务收口不结束全线程持续优化 Goal。
