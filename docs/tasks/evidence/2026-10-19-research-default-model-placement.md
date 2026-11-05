# 研究默认模型配置迁移验收

日期：2026-10-19。范围以[配置归属规格](../../specs/2026-10-19-research-default-model-placement.md)为准；[任务回执](../../archive/tasks/2026-10-19-research-default-model-placement.md)持有完成状态。

## 实现与验收映射

| 标准 | 实现与直接证据 |
| --- | --- |
| AC1 | `ProviderSettings` 移除旧默认配置组件，旧组件经引用扫描后删除。浏览器 `/providers` 中默认模型配置数量为 0；设置查询继续供提供方默认引用保护使用，生命周期 2 项回归通过。 |
| AC2 | `ResearchDefaultModelField` 与 `useResearchDefaultModel` 归属 `ai`，新建 `ResearchSubmissionSheet` 及历史再次生成 `NewResearchSheet` 共同消费；不增加独立配置面板。 |
| AC3 | 挂载真实表单、Query 和 Mutation，经受控 API 验证选择、保存中禁用、保存后新修订提交、首次无默认配置、清除默认及待确认原提交锁定；原提交身份回归通过。 |
| AC4 | 受控交互验证保存冲突保留问题、重新读取恢复、读取失败和空候选提示、仅修改模型时的关闭确认、保存中拒绝关闭。API 错误读取公开 `payload.message`；保存 Promise 已处理拒绝。 |
| AC5 | 定向回归、构建、定向 ESLint、模块边界和格式检查通过；实际浏览器位置、选择、未保存提示、关闭确认及丢弃后原默认回显均确认。 |

## 确定性验证

工作目录 `apps/desktop`：

- `pnpm exec vitest run test/research-form-v2.ui.test.tsx src/features/ai/NewResearchSheet.test.tsx test/ai-workbench-ui.test.tsx test/research-submission-v2.ui.test.tsx test/ai-provider-ui.test.tsx`：5 文件、74 项通过。
- 随后加强保存中关闭断言，运行 `pnpm exec vitest run test/research-form-v2.ui.test.tsx test/ai-provider-lifecycle.test.tsx`：2 文件、17 项通过；与前项合计覆盖 76 个不同用例。
- `pnpm build`：TypeScript 与 Vite 生产构建通过；保留既有打包体积大于 500 kB 的提示，不调整阈值。
- `pnpm exec prettier --check`：本次 7 个变更 TypeScript/TSX 文件通过。新增模型状态文件 70 行、模型字段 105 行，新建表单与相关测试均低于 800 行门限。

仓库根目录：

- 定向 `pnpm exec eslint` 检查模型字段/Hook、两个研究表单、资格提示、提供方页面及交互测试，`--max-warnings=0` 通过。
- `node scripts/check-boundaries.mjs`：`Import boundaries: OK`。
- `git diff --check`：通过。

本次已有脏工作区，验证反映当前共同源码；没有提交、推送或覆盖其他功能改动。全仓全量测试与 Docker 更新未执行，不将局部回归视为其替代。

## 浏览器与运行态边界

本机 Vite、IAB `/providers` 与 `/ai-chat`：确认旧页无默认配置，新建研究标题下显示紧凑模型字段；打开候选，选择“尚未选择研究默认模型”只形成草稿；关闭弹出确认，丢弃并重新打开后仍显示原已保存默认。未点击保存或研究提交，没有写入真实默认配置、凭证或调用模型。

本次界面验收时，目标后端的新版研究列表/创建资格接口不可读；当时页面明确显示读取失败，提交保持禁用。后续已通过[独立运行态修复](2026-10-19-research-capabilities-runtime.md)恢复只读接口，创建开关保持关闭。这里的浏览器证据仍只覆盖实际页面归属、模型草稿与保护，完整表单保存/创建由受控接口验证；不声称完成真实研究或全部目标 V2 部署门禁。原研究 Task 的真实生成停止决定及运行门禁保持原状态。

## 最终一致性核对

默认设置仍通过既有 `GET/PATCH /ai/settings` 及 `expectedRevision` 管理，保存后使研究与提供方设置缓存失效。创建只提交所见修订，提供方生命周期继续使用原设置引用保护；历史审计和默认选择未被改写。Spec、两个入口、配置页及测试保持一致，本次界面迁移范围无遗留实现项。
