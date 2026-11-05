# 导入边界输入误报修正

对应 [Spec](../../specs/2026-10-30-boundary-source-inventory.md)。本项是前四项验收所需的工程门禁修正，不承担 AI/研究/策略业务验收。

- [x] BI1～BI4：新增维护源码清单 helper，原入口改用 Git 清单并保持原规则；以临时 Git 仓库及真实 CLI 的反例验证，再运行全仓门禁。
  - 写集：`scripts/check-boundaries.mjs`、源码清单 helper 与定向测试、此 Spec/Task 及证据。
  - 边界：临时仓库只用于测试；主仓不 stage/commit，不删除或修改移动端副本，不改忽略规则或依赖断言。
  - 当前结果：6 项定向及真实 CLI 反例通过，原全仓入口通过；已有检查函数逐段一致，主仓索引与副本保持。最终一致性审查通过，本范围完成，详见[证据](../../tasks/evidence/2026-10-30-boundary-source-inventory.md)。
