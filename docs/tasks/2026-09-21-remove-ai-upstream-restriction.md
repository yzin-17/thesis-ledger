# 移除 AI 执行路由上游服务限制实施任务

对应 Spec：[移除 AI 执行路由上游服务限制 Spec](../specs/2026-09-21-remove-ai-upstream-restriction.md)

> 状态：已完成本地实现、目标 Docker / Server / Worker 验证；未执行 Electron 实机视觉验收和真实外部 Provider 验收；保留工作区既有未提交修改，不创建提交。

## 任务

- [x] T1：更新共享契约、旧配置兼容和 readiness。
  - 覆盖验收标准：AC2、AC4。
  - 涉及范围：共享 AI execution Schema、Server 路由输入解析、readiness、指纹和原因标签。
  - 完成条件：新契约不再产出上游限制字段；旧 JSON 可读取并丢弃该字段；不再生成 `route_not_allowed`。
  - 验证方式：共享 Schema、Server readiness 和 Provider 配置读取定向测试。
  - 实现状态：已完成。共享 Schema、Server 路由输入、readiness 输出和配置指纹已移除 `allowedUpstreams`；旧配置读取边界会丢弃该字段，`route_not_allowed` 不再生成。
  - 验证证据：Schema AI execution 定向测试、Server readiness/upstream/configured-providers 定向测试通过；Schemas/Server typecheck 通过。

- [x] T2：移除生成适配器和执行器中的上游限制参数。
  - 覆盖验收标准：AC3、AC4。
  - 依赖：T1 的新路由读模型契约。
  - 涉及范围：生成适配器、研究 SDK 执行、策略优化 SDK 执行及其 fixtures。
  - 完成条件：请求构造不再传递 `allowedUpstreams`，OpenRouter body 不再生成 `provider.only`，其他执行参数保持不变。
  - 验证方式：适配器、研究和策略优化定向测试；条件允许时执行隔离 PostgreSQL 集成测试。
  - 实现状态：已完成。研究、策略优化和生成适配器不再接收或转发上游白名单；OpenRouter 仅保留仍需的 `provider.require_parameters` 兼容参数。
  - 验证证据：适配器 18 项、研究执行 5 项、策略优化执行 5 项通过；Server 全量测试中 PostgreSQL 集成按既有环境条件跳过，未将跳过项宣称为通过。

- [x] T3：移除 Desktop 配置编辑入口。
  - 覆盖验收标准：AC1、AC2。
  - 依赖：T1 的路由输入契约；可与 T2 并行修改不同文件。
  - 涉及范围：Provider 执行路由草稿、表单、保存转换、校验和 readiness 展示。
  - 完成条件：表单不再出现上游服务限制，保存 payload 不包含废弃字段。
  - 验证方式：Desktop AI Provider UI 定向测试、typecheck/build、Prettier 和 `git diff --check`。
  - 实现状态：已完成。执行路由草稿、转换、表单和 readiness 文案不再包含上游服务限制字段。
  - 验证证据：Desktop Provider UI 定向测试 24 项、Desktop 全量测试 449 项、Desktop typecheck/build、改动文件 ESLint、Prettier 和 `git diff --check` 通过。

- [x] T4：同步文档、测试 fixture 并完成最终一致性 Review。
  - 覆盖验收标准：AC1–AC5。
  - 依赖：T1、T2、T3。
  - 涉及范围：本 Spec/Task、原 AI SDK Spec/Task、免费依据移除 Spec/Task 中的当前契约描述和受影响测试 fixture；保留必要历史事实说明。
  - 完成条件：活动文档不再把上游服务限制作为当前配置能力；实现、测试和文档一致。
  - 验证方式：`rg` 清理检查、受影响包测试/typecheck/build、最终一致性 Review。
  - 实现状态：已完成。本 Spec/Task、AI SDK 主 Spec/Task、能力声明与免费依据关联文档已同步当前契约；历史兼容字段和历史执行事实均保留在明确边界内。
  - 验证证据：生产源码仅保留兼容读取边界的 `delete route.allowedUpstreams`；Import boundaries、workspace dependency graph、包级测试/build 和改动文件 ESLint 通过。仓库级 `pnpm lint` 仍受三个未改动文件的既有 ESLint 错误阻断，未归因于本任务。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / Desktop 无上游限制配置 | T3 | T3；Desktop 定向测试 |
| AC2 / 新契约移除且旧配置可读 | T1、T3 | T1、T3；Schema 与配置测试 |
| AC3 / 请求不再携带白名单 | T2 | T2；适配器与执行测试 |
| AC4 / readiness 与其他路由行为稳定 | T1、T2 | T1、T2；Server/策略测试 |
| AC5 / 文档与验证一致 | T4 | T4；包级检查与最终 Review |

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
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
- 尚未通过的必要门禁与阻塞原因：仓库级 `pnpm lint` 的全量 ESLint 仍有 23 个既有错误，集中在未改动的 Desktop 市场集成测试、Server 结果读取策略和策略费用文件；本任务改动文件单独 ESLint 已通过。
- 遗留风险或已确认的后续范围：真实外部 Provider 和 Electron 实机视觉验收仍需独立验证；目标 Docker / Server / Worker 已通过，本任务不声称 Provider 或 Electron 运行态已通过。
- 验证命令/过程、结果与证据引用：Schemas 23 个文件/209 项测试、Server 125 个文件/782 项测试（15 个集成文件/49 项按环境跳过）、Desktop 66 个文件/449 项测试通过；三个包 typecheck/build、改动文件 ESLint、Prettier、Import boundaries、workspace dependency graph、`git diff --check` 通过。
