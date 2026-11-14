# 日记 AI 解读迁移至研究 V2

## 背景
单笔/对象复盘与周期复盘的 AI 解读通过 `AiRunService.startResearch()` 创建研究 V1 任务，默认模型已只启用 `research-generation-v2` 时在创建阶段拒绝。这是路由合同不一致，不是 Provider 健康失败。

## 范围与合同
- 新建的单笔/对象复盘与周期复盘 AI 解读使用 `research-generation-v2` 的冻结输入、SDK 生成、执行审计及结果合同，不得仅替换版本字符串。
- 分析和算法仍以现有 `journal*FrozenEvidenceSchema` 生成的确定性事实为唯一输入；不得回读不属于当前账户模式的材料或改变账本、快照、研究算法。
- V2 必须绑定真实身份、账户模式、来源指纹、确认时间、研究默认配置修订和独立提交 ID；最终推断只能使用冻结的 journal evidence ID。
- 生成结果为 `ResearchResult V2`；日记 AI 解读 API 与页面兼容历史 V1 结果，新 V2 结果使用自己的 inference/evidenceBindings 展示，不伪造旧 citations。
- 历史 V1 冻结任务、快照引用和已完成报告保留原样读取，不迁移、不重新生成、不改写。
- 自由文本继续要求简体中文，原始枚举、字段、数字和来源标识保持不变。
- 对未完成、失败、取消以及无效结果必须显式展示，不能把输出缺失解释为已完成解读。

## V1 其他调用点审计（研究合同）

| 位置 | 当前 V1 用途 | 处理结论 |
|---|---|---|
| `apps/server/src/ai/ai.controller.ts` → `AiRunService.startResearch` → `ai-research-submission.ts` | `POST /ai/research` 的旧任务新建，仍请求 `research-generation-v1` | **唯一保留的通用 V1 创建入口**；需另做 API/客户端迁移与废弃期，不可本次直接删除 |
| `apps/desktop/src/features/providers/ai-provider-execution.ts`、`AiProviderResearchVersionField.tsx` | 新增研究路由现已默认选 V2，历史 V1 配置仍可回显 | **本轮已修**；默认只影响新建，旧 V1 不自动改写 |
| `apps/server/src/ai/ai-research-policy.ts`、`ai-research-sdk-contract.ts`、`provider-connection-test.ts` | 未显式指定研究合同的 V1 默认、旧路由探针 | 新 V2 调用显式指定合同；这些默认只为旧调用保留，计划迁移到显式版本 |
| `packages/schemas/src/ai-execution.ts`、`apps/server/src/ai/ai.module.ts` | V1 合同常量、共享 Schema 与历史提示模板 | 保留给 V1 执行/恢复/历史读取，不能全局替换常量 |
| `apps/server/src/ai/ai-frozen-research.ts`、`ai-run-recovery.ts`、`ai-research.executor.ts` | V1 冻结材料、执行续跑与失败归档 | **必要兼容**，历史在途任务不能强制改协议或重新生成 |
| `apps/server/src/ai/ai-research-report-projection.ts`、`ai-research-reports.query.ts`、`apps/desktop/src/features/ai/AiRunDetail.tsx` | V1 结果与旧报告的只读显示 | **必要兼容**，不迁移历史快照 |

本次迁移后 `JournalReviewAi.start` 和 `JournalPeriodReviewAi.start` **不再调用** `startResearch()`；它们的历史 V1 `get` 分支继续工作。Provider UI 新建研究路由默认选择 V2，现有保存的 V1 合同继续按原版本回显，且其他用途的版本不受影响。V1 的其他业务含义（如 UI/数据协议独立版本）不属于本研究合同排查范围。

运行态配置发现：目前研究默认模型为 `lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，其研究用途只有 V1；即使该路由 Ready，也不能用于 V2 解读。应由用户显式在 Provider 中验证并保存 V2 用途，或选择其他经 V2 验证的默认模型；产品代码和运维流程不得擅自替换该全局默认。

## 验收
1. 对象与周期新建均冻结 `frozen-research-v2`，合同 `research-generation-v2`；旧 V1 路由不可再被用于这两个创建入口。
2. 证据适用性与账户/模式由服务端确认；错误的 scope/evidence、无效来源和其他用户的任务不可读取。
3. 新旧报告均可按各自协议正常读取；快照引用指纹、草稿和算法一致性仍生效。
4. V2 生成可在现有日记 AI 页面正确渲染；旧 V1 显示不回退。
5. 定向测试、类型检查与构建通过；真实运行时验证单独记录，不能以单元测试代替。
