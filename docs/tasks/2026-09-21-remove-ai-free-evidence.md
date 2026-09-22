# 移除 AI 执行路由免费依据配置实施任务

对应 Spec：[移除 AI 执行路由免费依据配置 Spec](../specs/2026-09-21-remove-ai-free-evidence.md)

> 状态：已完成本地实现、隔离 PostgreSQL 与目标 Docker / Server 验证；真实外部 Provider 计费事实与 Electron 实机视觉验收未执行；保留工作区既有未提交修改，不创建提交。

## 任务

- [x] T1：更新共享契约、旧配置兼容和 Provider readiness。
  - 覆盖验收标准：AC2、AC3、AC5。
  - 依赖：无；用户已确认信任 Provider 配置中的费用输入。
  - 涉及范围：共享 AI execution Schema、Server 路由输入解析、readiness、配置指纹和预算授权；保留显式付费预算和未知费用阻断。
  - 完成条件：新契约不再产出免费依据；旧 JSON 可读取并丢弃该字段；零费率且有币种的 Provider 可满足零费用授权；费用变化进入指纹。
  - 验证方式：共享 Schema、Server readiness、Provider 配置读取和费用授权定向测试。
  - 实现状态：已完成。共享 Schema、Server 路由输入/readiness 输出和配置指纹已移除免费依据；旧 JSON 读取边界兼容丢弃该字段；两项零费率加有效币种可满足零费用策略，费用字段进入指纹。
  - 验证证据：Schema AI execution、Server readiness/upstream/configured-providers 定向测试通过；Schemas/Server typecheck 通过。

- [x] T2：移除研究与策略优化中的免费成本分支。
  - 覆盖验收标准：AC4。
  - 依赖：T1 的新路由读模型契约。
  - 涉及范围：研究 SDK 执行、策略优化 SDK 执行和结算；使用 Provider 用户费率估算，保留实际费用优先和 unknown 阻断。
  - 完成条件：新执行不再生成 `free_evidence:*`，现有未知费用、超预算和已确认费用语义仍成立。
  - 验证方式：研究/策略优化定向单测、SDK fixture 和隔离 PostgreSQL 集成测试（若环境可用）。
  - 实现状态：已完成。研究与策略优化优先使用 Provider 实际费用，缺少实际费用时使用用户费率估算；未知费用继续阻断，生产执行不再生成 `free_evidence:*`。
  - 验证证据：研究执行 5 项、策略优化执行 5 项通过；4 个隔离 PostgreSQL AI 执行 / 研究 / 策略优化集成文件共 16 项通过；Server 其余全量 PostgreSQL 集成仍按环境条件跳过，未将跳过项宣称为通过。

- [x] T3：移除 Desktop 免费依据编辑入口并说明费用来源。
  - 覆盖验收标准：AC1、AC3。
  - 依赖：T1 的路由输入契约；可与 T2 并行修改不同文件。
  - 涉及范围：Provider 执行路由草稿、表单、保存校验和用户费用提示；不改变模型、模式、契约、超时和上游限制。
  - 完成条件：表单不再出现免费依据；Provider 费用字段明确作为成本输入使用；保存 payload 不包含废弃字段。
  - 验证方式：Desktop AI Provider UI 定向测试、typecheck/build、Prettier 和 `git diff --check`。
  - 实现状态：已完成。Desktop 执行路由草稿、表单、保存校验和 payload 不再包含免费依据；费用由 Provider 级输入提供。
  - 验证证据：Desktop Provider UI 定向测试 24 项、Desktop 全量测试 449 项、Desktop typecheck/build、改动文件 ESLint、Prettier 和 `git diff --check` 通过。

- [x] T4：同步 Specs/Tasks、测试 fixture 并完成最终一致性 Review。
  - 覆盖验收标准：AC1–AC5。
  - 依赖：T1、T2、T3。
  - 涉及范围：本 Spec/Task、原 AI SDK Spec/Task、能力声明移除 Spec/Task 中的当前契约描述，以及受影响测试 fixture；保留必要历史事实说明。
  - 完成条件：活动文档不再把免费依据作为当前要求；实现、测试和文档对零费率授权、预算授权与未知费用语义一致。
  - 验证方式：`rg` 清理检查、受影响包测试/typecheck/build、最终一致性 Review。
  - 实现状态：已完成。AI SDK 主 Spec/Task、能力声明移除 Spec/Task 与本 Spec/Task 已同步当前用户费用语义；旧集成 fixture 已改为成本未知语义，兼容读取和历史成本来源保留为明确历史边界。
  - 验证证据：生产源码仅保留兼容读取边界的 `delete route.freeEvidence`；Import boundaries、workspace dependency graph、包级测试/build 和改动文件 ESLint 通过。仓库级 `pnpm lint` 仍受三个未改动文件的既有 ESLint 错误阻断，未归因于本任务。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / Desktop 无免费依据配置 | T3 | T3；Desktop 定向测试 |
| AC2 / 新契约移除且旧配置可读 | T1 | T1；Schema 与 Server 配置测试 |
| AC3 / 零费率或显式预算授权 | T1、T3 | T1；readiness 与费用字段测试 |
| AC4 / 新成本结算不再使用免费依据 | T2 | T2；研究/策略优化执行与结算测试 |
| AC5 / 指纹、文档与验证一致 | T1、T4 | T4；包级检查与最终 Review |

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据（真实外部 Provider / Docker / Electron 仍未执行）
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：本地实现、契约、Server/Desktop 测试与隔离 PostgreSQL 范围通过；真实外部运行态仍未执行。
- 已确认的问题及责任任务：无。
- 尚未通过的必要门禁与阻塞原因：仓库级 `pnpm lint` 的全量 ESLint 仍有 23 个既有错误，集中在未改动的 Desktop 市场集成测试、Server 结果读取策略和策略费用文件；本任务改动文件单独 ESLint 已通过。
- 遗留风险或已确认的后续范围：真实外部 Provider 计费事实和 Electron 实机视觉验收仍需独立验证；目标 Docker / Server / Worker 已通过，本任务不声称 Provider 或 Electron 运行态已通过。
- 验证命令/过程、结果与证据引用：Schemas 23 个文件/209 项测试、Server 125 个文件/782 项测试（15 个集成文件/49 项按环境跳过）、Desktop 66 个文件/449 项测试通过；另有 4 个隔离 PostgreSQL 集成文件/16 项通过；三个包 typecheck/build、改动文件 ESLint、Prettier、Import boundaries、workspace dependency graph、`git diff --check` 通过。
