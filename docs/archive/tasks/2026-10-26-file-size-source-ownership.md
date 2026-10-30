# 文件尺寸门禁源码归属实施任务

## 当前执行摘要

- 规格：[文件尺寸门禁源码归属](../../specs/2026-10-26-file-size-source-ownership.md)。计划预检：Ready。
- 来源：[Cloudflare 模型目录任务](../../tasks/2026-10-26-cloudflare-model-catalog.md) 的 T2 门禁；原三项尺寸违规均已处理，未提高阈值或修改快照。
- S1、S2 完成，原目录任务继续其运行态验收。[验收记录](../../tasks/evidence/2026-10-26-file-size-source-ownership.md)

## 任务

- [x] S1：尺寸门禁使用版本控制归属清单（AC1、AC2）。
  - 输入：`scripts/check-file-size-guardrails.mjs`、`workspace-lint-sources.mjs` 及其现有测试；原门禁阈值与 ratchet 为冻结契约。
  - 写入：尺寸门禁脚本、专属源码清单模块和对应 Node 测试；不修改已有 ignore、ESLint 配置或验收包。
  - 完成：源码清单固定场景通过；已跟踪 ignore 文件仍进入检查，未跟踪验收包保持原位；随后继续 S2。
- [x] S2：按请求边界与页面行为拆分现有 Provider 测试（AC3、AC4）。
  - 输入：现有两个 `describe`、公共 Provider 夹具及 S1 清单。
  - 写入：原 UI 测试、独立请求边界测试、公共测试夹具和本主题证据。
  - 完成：测试集合及语义核对通过，全部原用例与 Desktop 类型检查通过，HEAD 基线下尺寸门禁通过，验收快照哈希一致。

## 最终一致性 Review

- [x] 源码归属、阈值及 ratchet 规则与规格一致。
- [x] 所有原测试及受影响快照文件保留，必要验证通过。
- [x] 未修改产品行为、业务数据、配置或 Git 提交状态。

结论：通过；源码归属和测试职责收敛完成，未降低尺寸门禁。
