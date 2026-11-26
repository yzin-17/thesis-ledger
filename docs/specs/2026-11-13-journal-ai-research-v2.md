# 日记 AI 解读研究合同

## 迁移背景
具名切换前，单笔、对象和周期复盘由 `AiRunService.startResearch()` 创建旧研究任务。默认模型只启用当时的 `research-generation-v2` 时，创建会因用途合同不匹配而失败。

## 范围与合同
- 当前单笔、对象及周期复盘解读使用 `research-frozen-input-v1` 冻结输入、`research-report-generation-v1` 生成并保留执行审计，读回 `research-report-result-v1`。 [具名 V1 切换](2026-11-24-named-v1-cutover.md)
- 分析和算法仍以现有 `journal*FrozenEvidenceSchema` 生成的确定性事实为唯一输入；不得回读不属于当前账户模式的材料或改变账本、快照、研究算法。
- 冻结输入绑定真实身份、账户模式、来源指纹、确认时间、研究默认配置修订和独立提交 ID。最终推断只使用冻结的日记证据标识。
- 解读使用结果的 `inference` 和 `evidenceBindings` 展示。
- 历史记录按具名切换规格审阅及转换，保留可证实的快照引用与原业务事实。
- 自由文本继续要求简体中文，原始枚举、字段、数字和来源标识保持不变。
- 对未完成、失败、取消以及无效结果必须显式展示，不能把输出缺失解释为已完成解读。

## 具名切换前的调用点审计

| 位置 | 当时的旧用途 | 当时处理结论 |
|---|---|---|
| `apps/server/src/ai/ai.controller.ts` → `AiRunService.startResearch` → `ai-research-submission.ts` | `POST /ai/research` 的旧任务新建，仍请求 `research-generation-v1` | **唯一保留的通用 V1 创建入口**；需另做 API/客户端迁移与废弃期，不可本次直接删除 |
| `apps/desktop/src/features/providers/ai-provider-execution.ts`、`AiProviderResearchVersionField.tsx` | 新增研究路由现已默认选 V2，历史 V1 配置仍可回显 | **本轮已修**；默认只影响新建，旧 V1 不自动改写 |
| `apps/server/src/ai/ai-research-policy.ts`、`ai-research-sdk-contract.ts`、`provider-connection-test.ts` | 未显式指定研究合同的 V1 默认、旧路由探针 | 新 V2 调用显式指定合同；这些默认只为旧调用保留，计划迁移到显式版本 |
| `packages/schemas/src/ai-execution.ts`、`apps/server/src/ai/ai.module.ts` | V1 合同常量、共享 Schema 与历史提示模板 | 保留给 V1 执行/恢复/历史读取，不能全局替换常量 |
| `apps/server/src/ai/ai-frozen-research.ts`、`ai-run-recovery.ts`、`ai-research.executor.ts` | V1 冻结材料、执行续跑与失败归档 | **必要兼容**，历史在途任务不能强制改协议或重新生成 |
| `apps/server/src/ai/ai-research-report-projection.ts`、`ai-research-reports.query.ts`、`apps/desktop/src/features/ai/AiRunDetail.tsx` | V1 结果与旧报告的只读显示 | **必要兼容**，不迁移历史快照 |

初次迁移将 `JournalReviewAi.start` 和 `JournalPeriodReviewAi.start` 接到统一研究提交，并在当时保留历史读回。

初次迁移时，研究默认 `lmstudio / qwen3.6-35b-a3b-uncensored-aggressive@q4_k_m` 只登记了当时的旧用途。现行默认与用途准入以应用运行时读取的配置为准，全局默认的切换仍由用户确认。

## 验收
1. 对象与周期新建均冻结 `research-frozen-input-v1`，按 `research-report-generation-v1` 生成。退役创建路径返回 404。
2. 证据适用性与账户/模式由服务端确认；错误的 scope/evidence、无效来源和其他用户的任务不可读取。
3. 具名切换后可正常读取已转换报告，快照引用指纹、草稿和算法一致性继续核对。
4. 当前解读在日记 AI 页面按 `research-report-result-v1` 渲染。
5. 定向测试、类型检查与构建通过；真实运行时验证单独记录，不能以单元测试代替。
