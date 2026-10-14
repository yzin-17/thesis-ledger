# 研究 JSON 输出字段合同验证

规格与任务：[Spec](../../specs/2026-10-05-research-json-prompt-contract.md) · [Task](../2026-10-05-research-json-prompt-contract.md)。

## 改动与验证输入

AI feature 新增 ai-research-output-prompt.ts，从现行 aiResearchGenerationSchema 生成 JSON Schema，并明确 evidence 对象及服务端引用标识。Executor 保留冻结业务系统消息，追加独立输出合同系统消息；用户消息继续传递原结构化请求。输出、引用、冻结事实、费用、CAS 与失败分类未放宽。Journal 不复制合同，未新增跨 feature 反向依赖。

新增提示合同测试；现有研究 Executor 测试断言实际 SDK 消息携带字段结构，并保留完整 decimal 冻结事实验证。涉及文件为两个 AI 源文件及两个 AI 测试文件；本叶没有 Schema、数据库或依赖变更。

## 本地检查

- 研究提示、Executor、输出适配器、SDK 集成和单笔/周期 Journal 定向：7 文件、36 项通过，日志 /tmp/research-output-prompt-journal-directed.log。
- pnpm --filter @thesis-ledger/server exec vitest run test/ai test/journal --maxWorkers=1：38 文件、293 项通过；11 文件、46 项 PostgreSQL/独立进程环境测试跳过。日志 /tmp/research-output-prompt-ai-journal-final.log。首次双 Worker 执行中，既有 100 ms 流式超时测试受调度影响失败；该文件独立 6 项和最终串行完整回归通过，没有提高超时或修改门禁。
- pnpm --filter @thesis-ledger/server typecheck、build：通过。日志 /tmp/research-output-prompt-types.log、/tmp/research-output-prompt-build.log。
- 四个受影响源/测试文件的 eslint：通过，日志 /tmp/research-output-prompt-lint-final.log。仅新测试格式化，未宽泛改写存量测试。
- node scripts/check-boundaries.mjs：通过，日志 /tmp/research-output-prompt-boundaries.log。GUARDRAIL_BASE_REF=HEAD 的尺寸 ratchet：通过，保留 9 条未增长的存量警告，日志 /tmp/research-output-prompt-size.log。
- git diff --check：通过；未 stage、commit、push，既有未提交改动保留。

## 目标边界

目标使用现有已验证的 native_schema 模式完成新单笔/周期请求，见[真实模型证据](2026-10-05-source-and-research-default.md)。该能力已存在于目标 SDK；本叶新的文本提示代码尚未更新目标。主仓 28 项 migration、目标 26 项，必须先完成保留数据升级，再使用官方更新入口验收目标新代码。G1、周期内容质量、目标在途恢复及客户端/设备门禁保留开放。
