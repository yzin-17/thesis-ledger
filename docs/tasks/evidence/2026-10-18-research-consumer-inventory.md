# 研究消费者与历史格式盘点

对应[研究增强 Task](../2026-10-18-research-evidence-evolution.md) T0。核对日期：2026-10-19。范围为当前三仓工作区中的主仓源码、Schema 与固定测试；本叶没有修改业务代码、查询业务库或调用模型。

## 生产与消费闭包

| 责任 | 实际入口与合同 | 后置维护位置 |
| --- | --- | --- |
| 通用研究输入 | `packages/schemas/src/ai.ts` 的 `aiResearchStartInputSchema/aiResearchContextSchema`；四种范围，持仓必须有账户与标的，策略必须有版本，模式可缺失 | T3 定义独立 V2 输入与范围，保持 V1 兼容；新输入严格拒绝客户端快照、费用和来源审计字段 |
| 提交/状态与结果保存 | `ai-run.service.ts` 的 `startResearch/finishResearch/frozenEvidence`，`ai-research-submission.ts` 的 `start`，`ai-execution-state.store.ts`；`AiRun` 为终态与结果事实源 | T4 幂等与原子快照；T6 版本选择、attempt/租约和晚到提交保护；不新建执行状态表 |
| 执行与冻结 | `ai-research.executor.ts` 的 `sourcesForRun/execute`，`ai-research-sdk-execution.ts`，`ai-frozen-research.ts` 的 `readFrozenResearch/frozenResearchTool` | T3 的冻结材料合同由 Ai 拥有；T6 分版本执行/恢复，不让 Ai import Research 或 Journal |
| 列表/详情/引用 | `ai-research-query.ts` 的 `listPage/detail`、`packages/schemas/src/research-display.ts` 的分类/结果质量；原 `ai.controller.ts`、`ai-run.service.ts` 还提供任务和 Tool 查询 | T7 显式选择 V1/V2 解析器、范围隔离及历史入口；不能只给 Desktop 加 union 而保留服务端 V1 单解析器 |
| 再次生成/恢复 | `ai-research-retry.ts`；`ai-run-recovery.ts` 按旧 Prompt、SDK contract 和 `frozen-research-v1` 选择恢复族 | T6/T7 同步覆盖 V2；保留 V1、Journal 与策略内部用途，不能把新冻结包交给旧严格解析器 |
| Journal 单笔/周期解读 | `journal-review-ai.ts`、`journal-period-review-ai.ts` 服务端构造 `frozen-research-v1`；`packages/schemas/src/journal-review-ai.ts`、Journal 结果读取仍消费 V1 产物 | T6/T7 的独立兼容保护；不改 Journal 归属，不将 Journal Prompt 自动分类成新通用研究 |
| 策略实验内部记录 | `strategy-optimization` 的 proposal、SDK executor、attempt、settlement、read-model 仍使用 `AiRun` 和实验关系 | T7/T9 保留已核验的实验内部分类与默认过滤；不能凭结果字段或 `promptVersion` 相似推断为新研究 |
| Desktop 直接消费者 | `features/ai/ai.types.ts` 的 `AiResearchResult.version:1`；`ai.api.ts` 的任务列表/详情/创建/再次生成；`AiRunDetail.tsx`、`ResearchReportContent.tsx` | T8 更新明确的 V1/V2 展示与模式/范围查询键；保留旧数组列表兼容和现有只读报告 |
| 共享 API client | `packages/api-client/src/journal-review-client.ts` 使用严格的单笔/周期解读 Schema 及请求关联校验 | T7 验证 Journal 传输兼容，必要改动限对应方法；不把 V2 字段塞进旧 Journal 响应 |
| Mobile | 对 `apps/mobile` 搜索 `ResearchResult/researchResult/frozen-research-v1/FrozenResearch`、`/ai/`、`aiRun`、`aiExplanation/aiRunId/journal-review`，未找到直接研究或 Journal AI 消费者 | 当前没有原生写集；共享 API client 仍单独保护。该源码结果不等于设备/Native 验收 |

上表文件位于 `apps/server/src/ai/`、`apps/server/src/journal/`、`apps/server/src/strategy-optimization/`，其他路径已写明。搜索先覆盖 `apps/`、`packages/`、`services/`，再核对以上实际调用方，没有按旧文件名认定退役。

## 历史记录的保守分类

| 可从保存结构识别的族 | 当前事实与升级处理 |
| --- | --- |
| `ResearchResultV1` | `research.ts` 固定 `version:1`，继承 `aiAnalysisSchema`：结论、带引用证据、风险、未知项、免责声明及可选上下文；还有 provider、时间与可选 symbol/score/signals。原 JSON 不修改、不补填 V2 |
| 通用研究 V1 | `research-display.ts` 目前只将 `promptVersion=research-v1` 且上下文合法的非实验任务确认为普通研究；其他已知用途和未知 Prompt 不能因结果长得相似就升级 |
| 冻结 V1 | 严格包含 `version=frozen-research-v1`、Prompt 模板/版本、一个带 permission 的 source 及 sourceId/provider/fetchedAt/data。`modelMetadata.frozenResearch` 存在但格式不合法会报错，不能回退实时取数 |
| 未冻结的旧任务 | `sourcesForRun` 没有冻结包时沿用旧工具与 Prompt 选择；这不是 V2 的可变输入许可。新 V2 必须先冻结范围、Prompt、证据及结果版本 |
| 空/非法/未知结果 | 当前读投影区分 missing、invalid、unsupported、pending_verification；引用归属未核验不算成功可用。新版本不得将这些记录转换成空的完整报告 |
| 内部实验/Journal | 根据已保存用途、Prompt、冻结包和可验证关系分别读取，不用当前页面或全局模式重新标记 |

这是一份**源码支持的结构分类**，不是业务库记录分布。盘点时 Docker/数据库连接不可用，没有读取业务库记录、数量或私人内容；实际各族数量保持未知。后续 T4 在恢复后的专用隔离库验证了合成 V1 记录保留，不改变本表的业务历史未知边界；目标双版本读取仍属后置门禁。

## 模式、范围与信任来源

- 当前 V1 `context.mode` 可缺失；账户型提交在提供模式时核对当前账户模式，但通用 `start`、历史版本和可选上下文均不能证明每条旧记录经过相同校验。盘点基线的 `AiRun` 没有独立范围快照；T4 后续追加可空 V2 快照，旧行保持空值，不能提升旧模式可信度。
- 有旧 `context.mode` 只表示保存过该值，不能自动获得 V2 的服务端快照资格；账户现值、当前全局开关、缺省 `actual`、模型输出和当前持仓都不能成为旧报告模式证据。缺可信快照的记录进入“历史范围未记录”，默认模式列表不混入，兼容入口按原权限读取。
- 新输入只允许用户选择模式与对象。服务端解析目录和实际账户/策略版本、校验权限后生成 `scopeSnapshot`；模型和客户端不能写入快照。纯标的研究不隐式携带私人持仓，DSA 仅收到公开标的和窗口。
- 原 `AiResearchQuery.assertAccess` 仍检查当前账户 active、持仓/策略是否可访问，但没有版本化历史范围；T7 需以保存快照为查询隔离依据，再按当前权限决定是否可读，不能从当前关联对象回填历史。

## 数据库与发布兼容约束

`AiRun.context/result/modelMetadata/checkpoint` 为 JSON，可空结果不代表已完成；状态、attempt、租约与结果仍属于 Ai。`AiToolCall` 以 `aiRunId` 关联审计；`AiInvocation` 以 `(consumer, referenceId, executionAttempt)` 唯一记录一次模型尝试，不能替代研究提交幂等身份。盘点基线没有研究提交唯一约束；T4 后续以可空身份/提交字段建立成对唯一约束，未回填历史。

T4 只追加必要字段/migration，旧记录保留 null 与原 JSON；同步 migration matrix、raw-owned/runtime 输入和结构门禁。T6 的 V2 写入默认关闭；T7/G2a 先证明 V1/V2 双读，G2b 验证可读取两者的恢复版本，再由 G3 按原授权开启。旧严格冻结/结果读取器在升级前不能承接新 V2。

## 精确定向保护与本次结果

本次只为盘点建立现行基线，未创建任务或调用模型：

`pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-research-submission.test.ts test/ai/research-context-mode.test.ts test/ai/research-result-persistence.test.ts test/ai/research-query.test.ts test/ai/ai-run-recovery.test.ts test/journal/review-ai.test.ts test/journal/period-ai.test.ts`：7 文件、25 项通过；使用现有受控存储/提供者，不计真实数据库或模型验收。

后置改动按实际写集使用下列文件，不重复无关全量：

- T3：`packages/schemas/test/research.test.ts`、`research-display.test.ts`、`ai-context-mode.test.ts`，并新增 V2/冻结的合同正反例；旧严格输入与未知结果保护保留。
- T4/T6：上述 7 个 Server 文件，加 `ai-research-controller-submission.test.ts`、`research-executor.test.ts`、`ai-research-output-prompt.test.ts`、`ai-research-policy.test.ts`、SDK execution 与 process recovery 定向测试。PostgreSQL submission/recovery/query/SDK 和 Journal DB 文件属于独立真实数据库阶段。
- T7：`packages/api-client/test/journal-review-transport.test.ts` 及新的研究读接口/权限/双版本测试；不能只检查前端类型。
- T8：`apps/desktop/test/ai-workbench.test.ts`、`ai-workbench-ui.test.tsx`、`research-account-mode.ui.test.tsx`、`optimization-research-disclosure.test.tsx`、`journal-review.api.test.ts`、`journal-review.ui.test.tsx`、`journal-period-interaction.ui.test.tsx`，新增 V2 引用/未知范围与切换场景；浏览器单独验收。

除上述 25 项和同轮已记录的 Schema 全量测试，本节后置测试没有因列入清单而视为已运行。真实模型、来源、通知和用户账户测试交易仍保持原暂停边界。
