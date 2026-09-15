# 前端可配置 AI Provider 与 OpenRouter 接入实施任务

对应 Spec：[2026-09-14-openrouter-free-ai-provider](../../specs/2026-09-14-openrouter-free-ai-provider.md)

> 任务标识：`openrouter-free-ai-provider`
> 状态：已完成；T1–T4 与 G1 均已有确定性测试和目标运行态证据。2026-09-15 已完成两项回归修复及定向验证。

## 已确认前提

- 原始产品要求是“从前端页面配置 AI Provider”；此前 `.env`/Compose 透传只完成部署级路径，不能作为该要求的完成证据。
- 现有 `OpenAiCompatibleProvider` 可继续复用；现有 `ProviderConfig` 与凭证加密、Provider 健康历史足以承载本次功能，无需 Schema 迁移。
- 主工作树有多组未提交改动，包含 `ProviderEditorSheet.tsx` 的滚动布局修复；实施必须保留并适配这些改动。
- `thesis-ledger-infra` 中既有 OpenRouter 配置只作为兼容来源，不把真实 Key 写入主仓、文档、日志或测试输出。

## 2026-09-15 回归修复

- Server 连接测试现在发送 `reasoning: { effort: "none" }`，并兼容 chat `content` parts、Responses envelope 和 legacy `choices[].text`；仍对缺少文本、空内容、非 JSON 或非对象结果 fail-closed。
- Desktop 连接测试仅失效 Provider 摘要与健康历史；AI 已保存测试额外刷新 AI/策略能力，AI 草稿测试不触发查询刷新。已移除连接测试成功后的全页面 `load()` 扇出。
- 定向验证：Server AI adapter/management 共 14 tests 通过；Desktop AI Provider 共 11 tests 通过；Server/Desktop typecheck 与 `git diff --check` 通过。
- 目标运行态验证：当前 Server 容器已包含修复代码；同一 `openrouter` 配置和 `nvidia/nemotron-3-super-120b-a12b:free` 模型返回 `healthy`、`测试成功`，延迟 1881ms。浏览器以本地受控测试响应计数时，仅产生测试请求、通用/AI Provider 摘要和健康历史共 4 个请求，不再重拉自动化、数据质量、通知失败或自动化历史。

## 任务

- [x] T1：补齐 OpenRouter 部署配置与 Compose Server 透传
  - 覆盖验收标准：AC5、AC7 的部署兼容断言
  - 依赖：无
  - 涉及范围：`thesis-ledger-infra/compose.yml`、`.env.example` 与本地非敏感模型配置；不修改 Worker/DSA/数据库。
  - 完成条件：`thesis-ledger` 可选择性读取部署级 AI 配置，未配置环境不产生空字符串解析失败。
  - 验证方式：Compose 配置渲染与非敏感 sentinel 契约测试。
  - 验证证据：既有 `scripts/ai-provider-contract.test.sh` 已通过；真实 Key 未回显。

- [x] T2：验证现有 OpenAI-compatible 适配器与 OpenRouter 免费模型
  - 覆盖验收标准：AC2 的适配器基础、AC8 的在线前置证据
  - 依赖：T1
  - 涉及范围：现有 Provider 注册、严格路由和一次直接 OpenRouter 受控请求；不替代产品级页面闭环。
  - 完成条件：所选具体免费模型能返回结构化内容、实际模型和 usage；错误边界不泄密。
  - 验证方式：Server 定向测试与直接 Provider smoke。
  - 验证证据：直接 OpenRouter 请求与 `OpenAiCompatibleProvider` smoke 已成功；该证据不证明数据库配置、动态 Registry 或浏览器闭环。

- [x] T3：实现 Server AI Provider 持久化管理与动态 Registry
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC6、AC7
  - 依赖：当前 Spec 规划 Review 通过；现有 Provider 凭证服务契约可复用。
  - 涉及范围：`apps/server/src/ai/**`、必要的 `apps/server/src/providers/**` 稳定内部契约、Server 定向测试和边界门禁；不修改数据库 Schema、Worker 或市场 Provider。
  - 完成条件：专用 CRUD/测试/启停 API 完整；数据库与环境来源合并明确；保存、启停、删除后 Registry 原子刷新；测试状态与历史持久化且错误脱敏。
  - 验证方式：Server AI/Provider 定向测试、TypeScript、`scripts/check-boundaries.mjs`；断言 Registry 运行时变化而不是只断言数据库行。
  - 验证证据：新增 `/ai/providers` 查询、保存、草稿/已保存测试、启停和删除接口；数据库配置覆盖同名环境来源，停用屏蔽环境来源，删除后恢复环境来源；保存、启停和删除均从持久化事实重建并原子替换 Registry。`apps/server/test/ai/ai-provider-management.test.ts`、既有 AI/Provider 回归、Server TypeScript 与边界门禁通过。

- [x] T4：实现 Desktop AI Provider 专用表单与操作闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5、AC6、AC7
  - 依赖：T3 的接口契约与自动化测试就绪。
  - 涉及范围：`apps/desktop/src/features/providers/**`、对应 Desktop 测试；保留现有 Sheet 滚动修复和通知 Provider 行为，不新增传统 CSS 选择器。
  - 完成条件：AI 类型显示专用字段；创建/编辑/测试/启停/删除使用专用 API；保存后刷新 Provider 与策略优化能力；部署来源明确只读；Key 不回显或进入查询缓存。
  - 验证方式：Desktop 组件/交互与 API 契约定向测试、TypeScript；浏览器门禁由 G1 承担。
  - 验证证据：Desktop 已使用专用 AI Provider API 和 TanStack Query mutation；表单覆盖 Base URL、模型、API Key、超时、费用、能力和优先级；已保存 Key 不回显，留空保存保留凭据；部署来源只读并提供接管入口。Desktop AI Provider、自动化与 UI contract 定向测试及 TypeScript 通过。

- [x] G1：目标 Compose 与浏览器真实闭环
  - 覆盖验收标准：AC8，以及 AC1–AC6 的目标运行态组合断言
  - 依赖：T3、T4；目标镜像包含当前代码；数据库结构就绪；Docker、浏览器和 OpenRouter 网络可用。
  - 涉及范围：使用用户本地 Secret 建立隔离的 OpenRouter 配置，通过页面留空保存并保留凭据，执行连接测试和动态能力查询；不得记录 Key、用户组合/账户/策略数据或敏感请求内容。
  - 完成条件：页面保存、脱敏回读、动态能力刷新、真实结构化调用和健康审计均在目标运行时成立；至少核对一个受控失败的脱敏表现。实际组合、账户或策略请求只有在用户另行授权向第三方发送相应业务数据后执行，不属于配置功能的默认门禁。
  - 验证方式：目标 Compose health、Desktop 页面交互、AI/策略能力查询、实际运行记录与脱敏日志核对。
  - 验证证据：目标 `thesis-ledger:dev` 镜像构建并健康启动；浏览器 `/providers` 成功保存隔离 AI Provider、显示专用表单且 Key 不回显，留空保存后仍显示“已配置”；`/ai/runs/capabilities` 无需重启即出现 `g1-openrouter-ui-20260914:openrouter/free`；真实 OpenRouter 结构化测试返回“测试成功”，同时记录了免费路由偶发非 JSON 的脱敏 `provider_error` 与恢复状态。分阶段验收后已按精确名称删除 2 个临时 Provider ID 对应的配置、共 7 条健康检查和 2 条健康摘要，复核页面与 API 只剩原有部署配置。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / Desktop 专用表单与密钥不回显 | T4 | T4；G1 |
| AC2 / CRUD、测试与启停接口 | T3、T4 | T3、T4；G1 |
| AC3 / 加密与脱敏 | T3、T4 | T3；T4；G1 |
| AC4 / 动态 Registry | T3、T4 | T3；G1 |
| AC5 / 配置来源与优先级 | T1、T3、T4 | T3、T4；G1 |
| AC6 / 状态与审计摘要 | T3、T4 | T3、T4；G1 |
| AC7 / 通知与 Worker 回归边界 | T1、T3、T4 | T3、T4；仓库边界门禁 |
| AC8 / 真实 OpenRouter 产品闭环 | G1 | G1 |

## 规划 Review

- [x] 原始前端配置要求已恢复为稳定目标，部署配置与产品配置的证据边界不再混淆
- [x] T3 与 T4 各自有完整 Server/Desktop 交付边界，G1 只承担组合运行态而不隐藏核心实现
- [x] 数据库、环境来源、停用、删除和 Registry 刷新的状态语义已定义
- [x] API Key 的浏览器输入、Server 加密、查询脱敏和日志边界已明确
- [x] 现有 `ProviderConfig`、健康历史与模块依赖方向已完成前置盘点
- [x] 未发现影响 T3/T4 开始实施的 Blocking 问题

### 规划 Review 结论

- 结论：Ready with non-blocking assumptions
- 已审范围：前端可配置 AI Provider 的 Server、Desktop、凭证、动态 Registry、兼容来源和验收门禁。
- 非阻塞假设：当前无认证主体，审计以更新时间、配置来源和连接测试历史为边界；不伪造操作者身份。
- 尚未通过的必要门禁：T3、T4 未实施；G1 必须在二者完成后执行。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现范围未把普通回测、市场 Provider 或认证系统纳入本次任务
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；未提交或暂存文件，既有用户修改已保留
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：通过；原始“前端页面可配置 AI Provider”目标已形成页面、持久化、动态 Registry、真实连接和审计闭环。
- 已确认的问题及处理：此前通用页面保存的 `ai` 记录不会进入 `AiProviderRegistry`；现已改为专用 API，并由通用保存端点拒绝 `type = "ai"`，消除假成功路径。
- 尚未通过的必要门禁与阻塞原因：无。真实组合、账户或策略请求会向第三方传输用户业务数据，需要独立授权，不属于本配置功能门禁。
- 遗留风险或已确认的后续范围：`openrouter/free` 会随机路由不同免费模型，运行中观察到过临时过载和非 JSON 响应；页面会记录降级状态和脱敏错误，不能把单次成功解释为长期 SLA。
- 验证命令/过程、结果与证据引用：Server 94 个测试文件通过（618 passed、11 skipped），Server/Desktop 定向测试、TypeScript、边界和文件尺寸门禁通过；目标镜像两次构建并健康启动；浏览器页面保存/编辑/不回显 Key、动态能力查询、真实 OpenRouter 结构化连接和健康审计均已核对，临时验收数据已清理。
