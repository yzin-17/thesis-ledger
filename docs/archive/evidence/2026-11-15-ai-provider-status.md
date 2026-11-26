# Cloudflare 配置诊断与状态展示验收

日期：2026-11-15，业务时区 Asia/Shanghai。

规格：[AI 提供方状态说明](../../specs/2026-11-15-ai-provider-status.md)。任务：[执行记录](../tasks/2026-11-15-ai-provider-status.md)。

## 真实只读诊断

通过 `GET http://127.0.0.1:3000/api/v1/ai/providers` 读取安全摘要，筛选 `cloudflare`。未打印或读取明文凭证，未发起模型生成、连接测试、费用授权或保存请求。

两条启用用途均属于 `@cf/google/gemma-4-26b-a4b-it`，接入实现为 `openai-compatible-chat`，输出方式为 `json_validated`。

| 用途 | 保存版本 | 原始阻断原因 | 解释 |
| --- | --- | --- | --- |
| 模拟交易决策 | `arena-decision-v1` | `budget_not_authorized` | 适配证据存在；列表按未授权费用评估，因此缺少任务级费用授权。 |
| 竞技场自主研究 | `arena-live-research-v2` | `adapter_contract_evidence_missing`、`budget_not_authorized` | 保存用途为 V2，目标服务当前用途为 V3，不满足精确版本匹配；同时需要任务级费用授权。 |

目标容器 `thesis-ledger-dev-thesis-ledger-1` 中，通过只读 `docker exec ... node --input-type=module -e ...` 加载实际部署的 `@thesis-ledger/schemas`，输出仅包含 `aiGenerationContracts.arenaDecision.ref` 和 `arenaLiveResearch.ref`。实际值分别为 `arena-decision-v1` 和 `arena-live-research-v3`。

诊断时工作区源码的自主研究合同已为 V4，属于既有并发工作。该源码值不能替代运行服务的 V3 事实。本任务未同步或更新 Server、Worker、镜像。

## 原因链

- `AiProviderService.list` 始终使用 `budgetAuthorized: false` 评估摘要。Gemma 的已配置输入与输出单价分别为每千 token `0.0001 USD`、`0.0003 USD`，不满足明确的零费用配置；提示不表示 Cloudflare 余额不足。
- `ai-provider-readiness.ts` 的 `knownContract` 要求用途 ID 和版本与当前注册合同精确匹配。V2 无法匹配实际运行服务中的 V3，导致 `adapterEvidence` 为空。当前 Chat 实现支持所选输出方式，此次不是连接失败或 JSON 输出方式不受支持。
- `routeSnapshotsFromProviderRow` 查找既有验证记录时匹配模型、用途 ID 和输出方式，未比较用途版本。因此 V2 曾于 2026/11/12 18:55:38 通过的自主研究验证仍被投影为 `passed`；模拟交易决策的历史测试时间为 2026/11/06 14:09:12。这些历史结果不能证明当前版本兼容。
- 本任务只改变展示，未修改合同匹配、历史记录读取或调用门禁。解除自主研究兼容限制需要按届时运行服务的当前用途版本重新配置并测试保存；付费授权仍属于具体任务。

## 展示变更

- 跨客户端的纯展示投影位于 `packages/domain/src/ai-provider-status.ts`；只消费必要原语，不依赖 schemas、请求或 Server 编排。依赖边界脚本已覆盖新模块。
- Cloudflare 摘要从“接入阻断 2/2”改为“配置待处理 1/2”；仅缺任务授权的用途使用“待任务费用授权”，不作为配置故障计数。原始 API 状态与原因码保持不变。
- Desktop、Mobile 逐条展示模型、中文用途和版本，并保留对应限制。兼容原因改为中文检查说明，历史通过明确标为“历史用途测试通过”。
- 费用说明集中保留一次。编辑页提示测试保存与任务费用授权分别需要满足。Desktop 最近连接时间复用日期组件并指定 Asia/Shanghai；Mobile 普通展示移除了无助于操作的原始修订时间与配置指纹。

## 验证结果

| 输入范围与命令 | 最后结果 |
| --- | --- |
| domain 投影：`pnpm --filter @thesis-ledger/domain exec vitest run test/ai-provider-status.test.ts` | 4 项通过：费用条件、混合限制、历史验证、未知原因与原始输入保持。 |
| domain 导出：`pnpm --filter @thesis-ledger/domain build` | 通过。 |
| Desktop：`pnpm --filter @thesis-ledger/desktop exec vitest run test/ai-provider-ui.test.tsx test/ai-provider-catalog-configuration.test.tsx` | 22 项通过。 |
| 两端：各自 `pnpm --filter @thesis-ledger/{desktop,mobile} typecheck` | 均通过。RTK 的过滤器转发曾误执行空 tsc，改用 `rtk proxy pnpm` 后通过。 |
| 本次 domain 与客户端源码、测试：定向 ESLint | 通过。 |
| `node scripts/check-boundaries.mjs` | 通过。 |
| `node scripts/check-file-size-guardrails.mjs` | 通过，无警告。 |
| `node scripts/lint-workspace.mjs --guardrails` | 未通过：既有并发文件 `apps/desktop/src/features/model-arena/ArenaLiveOrders.tsx:11:63` 的 `no-unsafe-call`；本任务未修改该文件，不扩大通过结论。 |
| 修改文件 Prettier | 通过。 |

浏览器入口：`scripts/local-runtime/ai-provider-status-browser.mjs`。通过 `PLAYWRIGHT_MODULE=/tmp/complexity-browser-qa/node_modules/playwright` 使用现有浏览器依赖。Desktop 读取现有本地开发服务，Mobile 使用真实摘要的受控副本及实际 Mobile 页面，经 React Native Web 渲染。

最终结果：Desktop 与 Mobile 均通过 1440、1024、768、390 四种宽度；状态归属、中文用途、版本、历史说明和无页面溢出均通过。Desktop 另检查编辑页两个页签及取消返回。所有验收请求仅允许 GET，写请求数为零。Mobile 最终独立运行还比较了 Cloudflare 配置修订、定价、执行配置指纹与验证记录，前后保持一致。

验收入口曾遇到端口冲突、虚拟入口未预构建 React 模块，均已修正。一次同时进行多项检查时浏览器在切换 Mobile 前关闭；保留 Desktop 的最终成功结果，随后单独完成 Mobile 全部宽度，未重复真实外部调用。

截图位于 `/tmp/ai-provider-status-qa/{desktop,mobile}-{1440,1024,768,390}.png`，已目视检查桌面与窄屏。该结果不是 iOS/Android 原生运行验收；本次未改变原生依赖或构建配置。

## 最终核对

AC1–AC5 均有对应诊断、投影测试、类型与浏览器证据。保留工作区既有改动；未改写真实配置、授权预算、升级用途版本、更新容器或提交 Git。规格保留为当前展示合同，完成任务归档。全仓门禁的独立错误按上述归属保留。
