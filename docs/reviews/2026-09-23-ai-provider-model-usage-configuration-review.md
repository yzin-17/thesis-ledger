# 任务验收评审：AI Provider 配置与模型用途配置（2026-09-21）

- 评审对象：`docs/tasks/2026-09-21-ai-provider-model-usage-configuration.md`
- 评审基线：`thesis-ledger` HEAD=`272eaa27`（`feat(ai): 自动选择生成方式与测试后保存 (#45)`），工作区干净
- 评审方式：源码/测试核对 + 本机门禁实跑（无 pnpm，用仓库根 `node_modules/.bin/`）

## 1. 总体结论

**结论：文档自律度高，但当前已过期，且存在 1 项 Blocking 级实测冲突。**

文档本身没有宣称完整 AC-01～30 通过（T5.2 与最终一致性 Review 均未勾选，大量"证据边界/待验证"自述），这一点与实现状态一致，是这份文档做得对的地方。但它最后一次修改在 `7d977194`，此后 `#44`、`#45` 两个提交落地，文档中的"本次验证"基线已不再复现，且其中一条"遗留"说明已被 `#45` 的代码推翻。

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| Blocking | 1 | HEAD 实测存在失败用例，而文档声明 Desktop 通过 |
| Major | 3 | 文档过期于基线、遗留说明与代码冲突、T5.1 颗粒度 |
| Minor | 9 | 数字不自洽、死代码、门禁归属、语义偏差等 |

## 2. 本机实测门禁（HEAD=272eaa27）

| 门禁 | 命令 | 实测结果 | 与文档声明 |
| --- | --- | --- | --- |
| Server typecheck | `tsc -p tsconfig.json --noEmit` | 通过 | 一致 |
| Desktop typecheck | `tsc -p tsconfig.json --noEmit` | 通过 | 一致 |
| Schemas 测试 | `vitest run`（packages/schemas） | 209 通过 / 23 文件 | 一致 |
| Server 测试 | `vitest run`（apps/server） | **876 通过 / 49 按环境跳过**（925 总） | 文档写 813/814 |
| Desktop 测试 | `vitest run`（apps/desktop） | **464 总，1 失败**（66 文件） | 文档写 455/457"通过" |
| 边界门禁 | `node scripts/check-boundaries.mjs` | `Import boundaries: OK` | 一致 |
| 迁移矩阵 | `node scripts/check-migration-matrix.mjs` | 通过（15 migrations / 66 tables） | 一致 |
| 受影响文件 ESLint | 3 个 Desktop 改动文件 | 0 问题 | 一致（局部） |
| `git diff --check` | — | 通过 | 一致 |
| 目标 Docker 栈 | `docker ps` | thesis-ledger-1 / backtest-worker-1 / dsa-1 / postgres-1 / redis-1 全部 healthy | 一致（可复现） |

补充：`packages/schemas/dist` 为 gitignore 构建产物，本机曾陈旧（缺 `ai-provider-validation.js`），导致 `ai-provider-auto-save.test.tsx` 3 项报 `aiProviderValidationPlanSchema undefined`；**重建 schemas 后这 3 项通过**。这是环境性问题，不是源码缺陷，但说明文档证据隐含"已构建 schemas"前置条件。

## 3. Blocking

### B1：Desktop `ui-contract.test.tsx` 在 HEAD 失败，与文档"Desktop 通过"直接冲突

- 失败点：`apps/desktop/test/ui-contract.test.tsx:315-318`，守卫为"Desktop 源码中不得出现原生 `<label`"。
- 违例位置：`apps/desktop/src/features/providers/AiProviderExecutionFields.tsx:79`、`:153`。
- 引入提交：`272eaa27`（`git log -S"<label"` 唯一命中，即本轮 #45）；守卫本身最后修改于 `4e9e9190`，属**既有契约**，非新加。
- 影响：AC-06/07/08/09 所依赖的 Desktop 交互基线不成立，文档"Desktop 455/457 通过""受影响文件 ESLint 通过"均不可采信。
- 修复方向：改用 `FieldLabel` primitive（该测试本身即以 `FieldLabel` 为样例），或按既有方式用 `Label` 组件替换两处原生 `<label>`。

## 4. Major

### M1：文档过期于当前基线

文档最后修改于 `7d977194`，而 `#44`(`f74a18e7`)、`#45`(`272eaa27`) 之后未同步。`#45` 新增 `ai-provider-validated-save.ts`、`ai-provider-validation-policy.ts`、`ai-provider-validation-runner.ts`、`ai-provider-validation-journal.ts`、`ai-provider-test-fingerprint.ts`、`AiGenerationSettings.tsx` 等，**09-21 文档完全没有提及**（新范围由 `docs/tasks/2026-09-23-ai-provider-auto-test-save.md` 承接，但 09-21 的 §6 Planning Review 仍以"本次验证"口吻陈述当前基线）。

### M2：§3.2"遗留"说明已被代码推翻

文档第 94 行称"用途级/Provider 级 `firstOutputTimeoutMs`、`outputIdleTimeoutMs` … 都不参与，因此用途面板的'首输出等待 / 输出空闲等待'对'测试'按钮无效"。HEAD 代码相反：

- `apps/server/src/ai/ai-provider.service.ts:746-754`（`git blame` 指向 `272eaa27`）已透传 `purposeRoute?.firstOutputTimeoutMs ?? input.firstOutputTimeoutMs` 与对应 idle 值；
- `apps/server/src/ai/provider-connection-test.ts:110,113-116`：purpose 探针用 `transport: 'stream'` 并传 `firstChunkMs/chunkMs`；
- `apps/server/src/ai/ai-sdk-generation.adapter.ts:232-241`：`transport === 'stream'` 时这两个值生效。

`reasoningEffort` 部分仍成立（`ProbeInput` 无该字段）。`docs/TODO.md` 的 `ai-provider-probe-route-parameters` 条目沿用了同一表述，需一并复核（其中"单次探针只消费 Provider 总超时"对连接探针仍准确）。

### M3：T5.1 状态颗粒度与自身证据冲突

T5.1 勾选为"已完成"，但全仓只有 dry-run（`POST /ai/providers/migration/dry-run`，`ai-provider.controller.ts:67-70`）与纯函数 `ai-provider-migration.ts`，**没有 apply 路径**。因此"重复执行幂等"只有"同输入两次调用同结果"这一平凡证据，持久化层幂等未证；而文档 §3 的 AC-25/26/27 又写"目标数据库 apply 待验证"。建议 T5.1 改为"局部里程碑已完成"，与 §3 口径一致。

## 5. Minor

1. **数字不自洽**：§6 写 Server 813 / Desktop 455；§7 T2.3 写 Desktop 457 / Server 814；同一节 T2.3 称 `ai-provider-readiness.test.ts` 为 814 项，T2.5 称同一文件为 16 项。
2. **死代码（仅测试引用）**：`aiProviderExecutionModeState`（`ai-provider-execution.ts:95-103`）、`aiProviderExecutionTimeoutLabel`（`:118-124`）、`nextActivePurposeAfterRemoval`；`assertNotResearchDefault`（`ai-provider.service.ts:544-547`）无任何调用点。它们的测试通过不构成产品行为证据。
3. **AC-09"生效来源准确展示"不成立**：Desktop `src` 完全未消费 `firstOutputTimeoutSource` / `outputIdleTimeoutSource`（全仓仅命中 `dist`），UI 只显示静态文案"留空使用服务默认值"。服务端已算（`ai-provider-readiness.ts:57-92`），前端未读。
4. **门禁归属描述不准**：`check-migration-matrix.mjs` 不在 `pnpm lint` 链内（`package.json` lint = build + boundaries + workspace-deps + eslint），文档 §6 将其与 lint 并列陈述。
5. **"22 项 ESLint 错误"无法核实**：未跑全仓 ESLint（成本过高）；旁证矛盾——`docs/tasks/2026-09-21-remove-ai-free-evidence.md:43` 与 `...remove-ai-upstream-restriction.md:42` 均只记"三个"未改动文件的既有错误。
6. **T1.2 语义偏差**：声称"单边零价直接阻断"，实际只有"一边填值、另一边 `undefined`"才阻断；`input=0 / output>0` 判为 paid，**需授权而非阻断**（`ai-provider.service.ts:1058-1069`）。
7. **策略成本回退比声称宽**：`strategy-optimization-cost.ts:146` 在 `costStatus='known'` 但两个单价都缺失时整体回退当前 Provider 价格并丢弃快照版本，超出"仅兼容旧快照"。
8. **"新增模型价格保持未知"有边界**：若请求完全不带 `modelPricing`，`ai-provider-readiness.persistence.ts:58-71` 会把 Provider 级旧价投影到所有新增模型；当前仅因 Desktop 恒定发送该字段而规避。
9. **`provider_timeout` 覆盖面窄**：仅测试探针路径改写（`ai-provider.service.ts:855-864`），研究/策略执行超时仍报 `cancelled`。另：删除默认 Provider 与启停路径不对称（controller 直连 `providers.remove`，不经过 `AiProviderSaveService`），且 `prisma` 缺失分支不执行清除只抛错。

## 6. 仍然未通过的外部门禁（与文档自述一致）

真实 Provider 成功计费请求、有认证请求、Electron 实机验收、真实 PostgreSQL 并发 / 并发 HTTP、目标库迁移 apply。这几项文档均如实记为未通过，评审未发现"未验证却宣称通过"的情况（唯一例外是 B1）。

## 8. 复核后处置结果（2026-09-23）

| 项 | 处置 |
| --- | --- |
| B1 原生 `<label>` 违例 | **已修复**：`AiProviderExecutionFields.tsx` 两处改为 `FieldLabel`（第二处包在 `<Field>` 内以满足 base-ui 的 `FieldRootContext`）。Desktop 全量 **464/464 通过**，typecheck 与该文件 ESLint 通过。 |
| M1 文档过期 | **已更新**：任务文档补记 2026-09-23 复核基线（`main@272eaa27`）与实测数字（Server 876/49 skipped、Desktop 464），并标注 813/814/455/457 为历史快照。 |
| M2 超时遗留说明 | **已修正**：任务文档 §3.2 与 `docs/TODO.md` 的 `ai-provider-probe-route-parameters` 条目均已收窄为“连接探针不参与、`reasoningEffort` 不参与”。 |
| M3 T5.1 颗粒度 | **已补记**：明确仓库只有 dry-run、无 apply 路径，“重复执行幂等”仅为纯函数平凡证据，保持局部里程碑。 |
| Minor | 数字口径已统一；其余（死代码、`provider_timeout` 覆盖面、删除路径不对称等）保持记录，未在本轮改动代码。 |

### 真实 Provider 复验（lmstudio）

通过目标容器 `http://127.0.0.1:3000/api/v1` 对 lmstudio（`http://192.168.5.20:6789/v1`，`authMode: none`，模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`）：

| 调用 | 结果 | latency | usage | cost |
| --- | --- | --- | --- | --- |
| 已保存 Provider 连接测试 | `healthy` | 2.9s | reported 21/147 | estimated 0 USD（`pricingVersion=pricing-612c2b5d10c1ebd9`） |
| 草稿用途 research | `healthy` | 67.0s | reported 603/3973 | estimated 0 USD（`configured_model_pricing`） |
| 草稿用途 parameter_optimization | `healthy` | 57.8s | reported 351/3450 | estimated 0 USD |
| 草稿用途 strategy_discovery | `healthy` | 76.8s | reported 1445/4532 | estimated 0 USD |

结论：AC-03、AC-15、AC-23 的“无认证 + 指定用途真实生成”部分已获真实证据；2026-09-22 的用途探针 JSON 修复在真实推理模型上成立。**仍缺**：有认证请求、非零费率的预算授权与真实计费、显式默认下的研究创建（`researchDefault=null`，处于 AC-17 预期阻断态，未为跑通而改写配置）、Electron 实机。

1. 修 B1：替换 `AiProviderExecutionFields.tsx:79,153` 的原生 `<label>`，重跑 Desktop 全量至 0 失败。
2. 更新 09-21 文档基线：写明评审基线提交、实测数字（Server 876/49 skipped、Desktop 464）、并声明"`#44`/`#45` 后需重跑"。
3. 修正 §3.2 遗留说明与 `docs/TODO.md` 的 `ai-provider-probe-route-parameters` 条目。
4. T5.1 状态降为"局部里程碑已完成"。
5. 统一 §6/§7 数字；"22 项 ESLint 错误"改为实测结果或删除。
6. 清理死代码，或补齐 `firstOutputTimeoutSource/outputIdleTimeoutSource` 的 UI 消费（关系 AC-09）。
7. 删除/启用路径不对称与 `prisma` 缺失分支，补一个删除默认 Provider 的事务用例。
