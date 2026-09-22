# 移除 AI 执行路由能力声明配置实施任务

对应 Spec：[移除 AI 执行路由能力声明 Spec](../specs/2026-09-21-remove-ai-capability-declaration.md)

> 状态：已完成本地实现与验证；未执行 Electron 实机视觉验收和真实外部 Provider 验收；保留工作区既有未提交修改，不创建提交。

后续范围修订（2026-09-21）：上游服务限制和免费依据分别由[移除 AI 执行路由上游服务限制任务](2026-09-21-remove-ai-upstream-restriction.md)与[移除 AI 执行路由免费依据任务](2026-09-21-remove-ai-free-evidence.md)负责；本任务中对应“保留”表述是历史完成边界。

## 任务

- [x] T1：更新共享契约与 Server readiness。
  - 覆盖验收标准：AC2、AC3、AC4。
  - 依赖：无；当前 AI Provider 配置和 adapter 契约可直接作为现有边界。
  - 涉及范围：共享 AI execution Schema、Server Provider 输入/读取归一化、readiness 指纹与阻断原因；保留 adapter 证据、预算/费用、能力撤销和严格未知字段校验。
  - 完成条件：新路由契约不再产出能力声明；旧数据库/环境 JSON 含该字段时可读取并丢弃；缺少声明不再阻断 ready。
  - 验证方式：共享 Schema、Server readiness、Provider 配置读取及环境配置定向测试。
  - 实现状态：已完成。共享 `AiProviderModelExecution`、Provider 路由输入和 readiness 原因已移除能力声明；旧路由输入在解析边界丢弃 `capabilityDeclaration`，配置指纹不再包含该字段；adapter 证据、预算、健康、费用和能力撤销仍保留。
  - 验证证据：`packages/schemas` 全量测试 23 个文件/209 项通过；Server 全量测试 125 个文件/782 项通过、15 个环境集成文件/49 项按既有条件跳过；Server typecheck/build 通过；旧 JSON 读取兼容由 `ai-provider-upstream.test.ts` 覆盖。

- [x] T2：移除 Desktop 配置入口并同步用户文案。
  - 覆盖验收标准：AC1、AC4。
  - 依赖：T1 的路由契约字段确定；可在同一工作树同步修改。
  - 涉及范围：执行路由草稿转换、表单控件、保存校验、readiness 文案和策略推理能力文案；不改变模型、模式、契约、费用或超时控件。
  - 完成条件：能力声明相关控件、草稿字段、保存字段和过时文案全部消失，现有路由编辑功能保持可用。
  - 验证方式：Desktop AI Provider UI 定向测试、typecheck 和 build。
  - 实现状态：已完成。Desktop 草稿、表单、保存校验和 readiness 文案不再包含能力声明；执行模型溢出修复与本次表单调整一并保留。
  - 验证证据：Desktop 全量测试 66 个文件/449 项通过；Desktop typecheck/build 通过；Provider UI 定向测试 24 项通过。

- [x] T3：更新规格、任务、测试 fixture 并完成一致性复核。
  - 覆盖验收标准：AC5。
  - 依赖：T1、T2。
  - 涉及范围：本 Spec/Task、原 AI SDK Spec/Task 中仍有效的能力门禁描述、共享/Server/Desktop/策略测试 fixture；不改写历史运行态证据的事实边界。
  - 完成条件：活动文档不再把能力声明作为当前必需配置；所有受影响测试与实现一致；最终 Review 记录真实验证范围。
  - 验证方式：`rg` 清理检查、受影响包测试/typecheck/build、`git diff --check`。
  - 实现状态：已完成。原 AI SDK Spec/Task 已标注本次稳定契约修订，相关测试 fixture 已同步；旧能力声明只保留在兼容读取测试和历史证据说明中。
  - 验证证据：Import boundaries、workspace dependency graph、定向 ESLint、Prettier 和 `git diff --check` 通过；未创建提交。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / Desktop 无能力声明配置 | T2 | T2；Desktop 定向测试 |
| AC2 / 新契约移除且旧配置可读 | T1 | T1；共享 Schema 与 Server 配置测试 |
| AC3 / readiness 不再要求声明且其他门禁保留 | T1 | T1；Server readiness 测试 |
| AC4 / 错误与文案清理 | T1、T2 | T3；定向测试与搜索清理 |
| AC5 / 验证与文档一致 | T3 | T3；包级检查与最终 Review |

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据；Electron/真实 Provider 不属于本次本地验收范围
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：通过（本地实现、契约、Server/Desktop 测试与构建范围）。
- 已确认的问题及责任任务：无。
- 尚未通过的必要门禁与阻塞原因：无；Electron 实机视觉验收和真实外部 Provider 验收不在本次 Spec 的本地完成条件内。
- 遗留风险或已确认的后续范围：未执行 Electron 实机视觉验收和真实外部 Provider 验收。
- 验证命令/过程、结果与证据引用：Schemas/Server/Desktop 全量测试、三个包 typecheck/build、Import boundaries、workspace dependency graph、定向 ESLint、Prettier、`git diff --check`；证据记录于本 Task 各任务条目。
