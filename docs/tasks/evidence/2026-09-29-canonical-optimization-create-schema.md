# 优化实验创建合同收敛

## 变更

调用反查确认 `optimizationExperimentCreateSchemaV2` 与对应类型只由旧测试引用，已从 Schemas 删除。当前实验创建保持 `contractVersion=3` 与现行 RunConfig 校验；测试改为拒绝缺少合同版本或缺少现行执行协议的旧输入。没有改动候选生成、预算或结果读取。

## 验证

- 定向 `pnpm exec vitest run test/strategy-optimization.test.ts`：17 项通过。
- Schemas `pnpm test`：563 项通过；`pnpm run build` 通过。
- Server、Desktop、API Client `pnpm run typecheck` 通过；受影响文件 Prettier、`node scripts/check-boundaries.mjs` 与主仓 `git diff --check` 通过。

## 边界

验证对象是当前未提交工作区。旧实验持久化记录、目标 Server/Worker、真实 AI 实验及浏览器未在本叶验收；C03/U02/D02 和关联 AC14 保持未完成或以各自原有证据为准。
