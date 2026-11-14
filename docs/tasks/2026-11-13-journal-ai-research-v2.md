# 日记 AI 解读迁移 V2 · 执行任务

对应 Spec：../specs/2026-11-13-journal-ai-research-v2.md

- [x] 调查单笔与周期 V1 入口、V2 证据/权限/冻结与读取合同，定位默认模型不匹配原因。
- [x] 迁移 journal 证据冻结、任务身份/权限及 V2 创建入口；保留确定性统计和快照不变量。
- [x] 迁移读取和前端 V2 展示；保留历史 V1 兼容。
- [x] 定向测试、Schemas/Server 类型检查与构建、Desktop Vite 构建、模块边界检查和文件体积门禁通过。
- [x] Desktop 全包 TypeScript 类型检查复检通过（本轮并行 Arena 修改已恢复一致）。
- [x] 隔离 PostgreSQL：使用专用 `scripts/test-journal-review-postgres.mjs` 建立临时库，52 个 migration 校验通过，`ai-postgres.integration.test.ts` 1/1 通过并自动清理容器。
- [x] 正式本地代码快更：从 infra `./scripts/sync-code.sh thesis-ledger` 完成，Server/Worker 均 Healthy，镜像、数据库和卷不变；当前更新仅在容器可写层。
- [x] 真实运行态只读 HTTP：`GET /api/v1/health` 与 `/research/capabilities` 200；不存在的对象/周期解读均返回 `JOURNAL_AI_NOT_FOUND` 404；无效提交 400。
- [x] 已按 Provider 官方 validation-plan + test-and-save 完成 `lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m` 研究路由 V1→V2 验证及保存；只测试并变更 1 个用途，最高 3 次本地调用，按配置价格 USD 0，路由 Ready，默认 Provider/模型保持不变。
- [x] 真实模型端到端揭示两类 V2 业务拒绝：`journal-review-v3` 缺数值可引用描述符（`research_business_invalid`），`journal-review-v4` 在 `instruments=[]` 的账户复盘中生成非法价格断言与价格阈值。严格校验保留，V4 新增确定性指标 `numericFields`；V5 限制仅定性断言/手动或未知条件，并明确不生成价格预测。失败任务原样保留，不重写历史记录。
- [x] `journal-review-v5` 真实 LM Studio 模型新建→生成→严格业务/数值核验→保存→HTTP 读取验收成功：任务终态 `succeeded`、`ResearchResult V2`、中文结论、1 条有效冻结证据绑定、3 条定性断言、4 条数值断言；验证使用模拟账户，不触碰交易、持仓或复盘快照。
- [ ] V5 最后一次隔离 PostgreSQL 脚本复跑未通过前置全仓构建：同期模型竞技场 `live-research-runner.ts` 的 `marketSession` 可选类型、`live-runtime.ts` 的交易日期 `string | undefined` 两处 TS 报错。测试未开始、未创建临时数据库；不涉及本次 Journal V2 修改，不擅自更改并行任务代码。V4 版相同 Journal 冻结和持久化改动曾通过隔离数据库验收，V5 仅加强输出约束。
- [x] 全仓 V1 用途审计：其他通用 V1 创建、恢复、兼容读取保留、单独列出。

## 验证记录（本轮）
- `pnpm --filter @thesis-ledger/server exec vitest run test/journal/review-ai.test.ts test/journal/period-ai.test.ts test/journal/journal-ai-research-v2.test.ts test/journal/ai-postgres.integration.test.ts`：13 通过、1 PostgreSQL 集成跳过。
- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/journal/review/JournalAiResult.test.tsx`：2 通过。
- `pnpm --filter @thesis-ledger/server typecheck`、`pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/server build`、`pnpm --filter @thesis-ledger/desktop typecheck`、`pnpm --filter @thesis-ledger/desktop exec vite build`：通过。
- Provider 新建研究用途默认 V2，其他用途与历史 V1 不变；`test/ai-provider-research-v2-default.test.tsx` + Provider API/请求参数回归 + Journal V1/V2 UI 测试共 25/25 通过。
- `node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs`：通过。
- 最终生产 Prompt 为 `journal-review-v5` 与 `journal-period-review-v5`。`journal-research-numeric-fields.ts` 只将确定性算法状态为 AVAILABLE 的数值映射为冻结 `numericFields`，严格保留单位/币种与 JSON Pointer；`instruments=[]` 的研究不得生成价格方向主张或价格阈值。
- V5 实际模型端到端执行与 HTTP 查询通过；模型实际输出中文，且被完整 V2 Schema 与数字/来源绑定校验接受。HTTP 复核：Server Healthy、默认 LM Studio 修订 8 未变、V2 路由 Ready、成功任务读取 200。
- 最终定向 `vitest` 5 个测试文件共 21 项全部通过；`git diff --check` 通过。隔离 PostgreSQL 复跑受同期 Arena 全仓构建问题阻断（原有 V4 通过记录保留）。

说明：当前工作区有大量其他任务并行修改。不得 reset/提交/推送无关文件；本任务仅改动相关路径。
