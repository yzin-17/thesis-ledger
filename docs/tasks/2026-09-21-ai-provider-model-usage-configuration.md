# AI Provider 配置与模型用途配置实施任务

对应 Spec：[AI Provider 配置与模型用途配置优化](../specs/2026-09-21-ai-provider-model-usage-configuration.md)

> 状态：本地实现、自动门禁、隔离 PostgreSQL、目标 Docker / Server / Worker 与内建浏览器本地 Web 预览已完成收口；完整设计稿 AC-01～30 仍有真实 Provider 与 Electron 实机门禁未通过。本文记录统一 G0→G5 基线、已验证证据和未授权外部门禁，不把 Provider 配置或自动化结果宣称为真实计费调用通过。

## 1. 验收基线与编号约定

### 1.1 规范优先级

本任务使用以下优先级，避免完整设计稿、仓库 Spec 和 Task 的编号混用：

1. 完整设计稿 `/Users/yzin/Downloads/2026-09-21-ai-provider-model-usage-configuration.md`：定义本功能目标行为和完整 AC-01～30。
2. 仓库 Spec：定义仓库内稳定契约、当前实施边界和非目标。
3. 本 Task：定义实施任务、依赖、证据、状态和运行态门禁。
4. 源码、测试、日志和真实环境结果：只能作为完成证据，不能改变验收标准的含义。

完整设计稿的 AC-01～30 是本任务的主验收编号。仓库 Spec 现有 AC-01～06 继续保留为第一阶段实施索引，但在本 Task 中统一称为“仓库局部 AC”，不得与完整设计稿编号直接等同。

### 1.2 状态定义

- `局部里程碑已完成`：已有实现和定向证据，但不代表对应完整 AC 或产品闭环完成。
- `实施中`：已有部分实现，仍缺少完整语义或关键执行路径。
- `待补验证`：实现迹象或局部测试存在，但规定的验证证据尚不充分。
- `待修复`：当前实现与完整设计稿的明确要求冲突，不能只补测试。
- `未开始`：尚无可接受的实现或验证证据。
- `完成`：本 AC 所需实现、自动验证、集成验证和必要运行态门禁全部通过。

本次记录的自动化结果来自 2026-09-22 的本轮实现后回归；后续源码或配置变化仍必须重新确认受影响证据。目标 PostgreSQL 与 Docker 已执行；Provider 凭证和 Electron 实机验收仍未执行。内建浏览器本地 Web 预览已于 2026-09-22 执行，不能替代 Electron 实机证据。

## 2. 分阶段任务

父任务 T1～T5 是验收责任组，不单独计数；只有子任务的复选框表示可独立接受的里程碑或交付物。

### T1：模型级价格与任务费用语义

责任边界：Provider + Model 价格、服务端价格版本、任务冻结、预算预留、结算和上游真实费用事实。不得把 Provider 连接状态当成费用授权结果。

- [x] **T1.1：模型级价格字段与旧配置兼容投影**（局部里程碑已完成）
  - 覆盖：仓库局部 AC-01～03；完整 AC-10、AC-11 的模型价格输入部分。
  - 依赖：当前 ProviderConfig JSON 存储和现有 AI Provider Schema。
  - 完成条件：新配置按模型保存价格；旧 Provider 级价格只做兼容读取或显式投影；新增模型价格保持未知；显式零值和缺失值不混淆。
  - 已有证据：Server 管理、readiness、上游契约和策略费用定向测试；Server typecheck。该证据不覆盖价格冻结、预算预留、结算或真实上游费用。

- [x] **T1.2：价格版本、冻结、预算预留与结算**（本地与隔离 PostgreSQL 里程碑已完成；真实 Provider 费用待验证）
  - 覆盖：完整 AC-10～14。
  - 依赖：T1.1；客户端写入版本契约、研究 / 策略冻结和测试费用事实已在当前切片固化。
  - 完成条件：价格版本由服务端维护；研究、策略和测试都按实际目标模型冻结价格；旧任务不被新价格重算；用户配置零价与上游非零报告分别保留；未获预算授权的非零调用在生成前阻断。
  - 验证方式：Schema、Server 单元 / 集成、费用计算、任务快照和预算门禁测试；需要覆盖重复提交、历史任务、上游费用高于配置和未知费用。
  - 当前进度：已从 Server 写入 Schema、持久化转换、草稿测试运行指纹和 Desktop 保存 / 测试请求中移除客户端 `pricingVersion` 写入路径；环境配置和只读 Provider View 仍保留服务端 / 部署侧版本读取。研究创建时现将目标模型的价格与 `pricingVersion` 写入 `researchRoutes` 快照；研究执行的预留和结算优先消费该快照，价格变化不再改变协议 / 连接配置指纹。策略优化实验的模型配置现在同时保存模型级输入 / 输出单价，候选预留和结算优先消费实验快照，兼容旧快照时才回退当前 Provider 价格。指定模型生成测试现在也按目标模型快照做生成前费用门禁：未知、单边零价或缺失币种直接阻断；双零价无需授权；非零费率必须由请求携带显式预算授权，Desktop 在发送前弹出确认；已保存 Provider 测试复用保存的模型价格与版本。草稿和已保存测试共用单飞门，确认框或请求进行中重复点击不会再发起第二次 SDK 调用；成功测试结果保留 SDK 用量和上游已报告费用，缺少上游费用时按目标模型价格生成估算，失败时不把未知费用补成零。
  - 定向验证：通过；Server 研究 / 策略冻结与执行、Provider readiness 和管理测试共 72 项；Schemas 23 项；Desktop Provider UI / 执行显示 33 项；两端 typecheck / build、受影响文件 ESLint、`git diff --check` 通过。
  - 证据边界：已证明本地生成测试不会在费用未知、单边零价或未授权非零费率时调用上游；研究和策略优化按目标模型冻结价格，价格变化不重算既有快照；重复点击不会并发发起第二次 SDK 调用；成功测试区分上游报告费用和按冻结模型价格估算的费用，失败与取消不会把未知费用补成零，取消保留已知 usage 并写入保存测试历史。隔离 PostgreSQL 已验证任务级预留 / 结算、重复提交、预算超限、币种冲突、未知费用和回滚事实；真实 Provider 费用仍未验证。
  - 剩余条件：验证目标 PostgreSQL / Server / Worker 与真实 Provider 的费用闭环；在此之前不把完整 AC-10～14 标记为运行态通过。

### T2：模型用途投影与路由唯一性

责任边界：模型行内用途、输出方式、既有 `executionRoutes` 投影和同模型同用途唯一性；不恢复独立路由事实源。

- [x] **T2.1：模型用途编辑投影与基础路由唯一性**（局部里程碑已完成）
  - 覆盖：仓库局部 AC-04，以及仓库局部 AC-05 的模型用途 / 价格保留部分；完整 AC-06、AC-07 的基础转换和服务端拒绝部分。
  - 依赖：T1.1 的模型价格输入与现有 `executionRoutes` 契约。
  - 完成条件：模型行可编辑用途和模式；保存转换为唯一用途路由；服务端拒绝同模型同用途多活跃路由。目录刷新竞态和晚到响应由 T3.2 单独负责。
  - 已有证据：Desktop Provider UI 定向测试、Server Schema 测试、Desktop typecheck。真实 Electron、目录竞态和视觉验收未验证。

- [x] **T2.2：混合模式、用途覆盖与超时继承**（本地实现里程碑已完成；Electron 视觉待验证）
  - 覆盖：完整 AC-06～09 中未由 T2.1 证明的部分。
  - 依赖：T2.1；共享输出模式和超时契约就绪。
  - 完成条件：多用途模式不被打开即保存静默归一；共用模式与逐用途覆盖的影响范围明确；空超时表示继承、零值和越界被拒绝，单位与实际生效来源准确展示。
  - 验证方式：Schema / 纯函数、Server 路由转换、Desktop 交互测试；覆盖旧混合模式、用途切换和继承链。
  - 定向验证：通过；Server readiness / upstream、Schemas AI execution、Desktop Provider UI 定向测试和两端 typecheck / build 通过。Provider 默认、用途覆盖、系统默认三层解析会返回生效来源；空值表示继承，零值和越界在 Schema 与编辑器边界拒绝。
  - 证据边界：已证明契约、转换和静态 UI 行为；内建浏览器本地 Web 预览已检查模型与用途页签、价格未知提示、用途选择和未保存修改保护；仍未证明 Electron 实机在旧混合配置、长 ID、滚动和保存后的视觉 / 交互结果。

### T3：Provider 连接、目录和测试生命周期

责任边界：统一 Provider Editor Sheet 的双页签、认证方式、目录请求、指定模型测试和业务用途测试；不把保存、目录读取和生成测试混为一个动作。

- [x] **T3.1：双页签、显式认证和指定模型最小测试**（局部里程碑已完成）
  - 覆盖：完整 AC-01～03、AC-15～16、AC-22～23 的局部实现。
  - 依赖：T1.1、T2.1；复用现有 Provider Editor Sheet。
  - 完成条件：连接配置和模型用途共用同一草稿；请求携带显式 `authMode`；无需认证不读取或发送历史 / 环境 Key；最小生成测试绑定明确模型；保存、切页和目录获取不自动生成。
  - 已有证据：Server adapter / SDK / Provider 管理定向测试，Desktop Provider UI 测试，Server / Desktop typecheck；目标 Docker / Server / Worker 已通过健康与 smoke；内建浏览器本地 Web 预览已打开 Provider 列表、接管编辑器和双页签。真实 Provider 和 Electron 未验证。

- [x] **T3.2：完整目录竞态、业务用途测试和用量状态**（本地实现里程碑已完成；真实 Provider 待验证）
  - 覆盖：完整 AC-01～05、AC-15～16、AC-22～24 中尚未证明的部分。
  - 依赖：T3.1；T1.2 的费用授权契约；T2.2 的用途和模式契约。
  - 完成条件：目录晚到响应不会覆盖新连接草稿；业务用途测试绑定模型、用途和模式；付费调用先获授权；取消、重复点击、未知用量、测试失败和局部过期均有稳定状态，不隐式重试。
  - 验证方式：Server HTTP adapter / 生成生命周期、Desktop 交互和请求竞态测试；真实本地 Provider 作为独立运行态门禁。
  - 定向验证：通过；业务用途测试实际选择对应契约和 `native_schema` / `json_validated` 模式；测试请求携带 UUID、服务端支持取消；取消历史不更新当前健康状态，已知 usage 保留、unknown cost 不补零；Provider 管理测试 24 项、Desktop Provider UI 30 项及 adapter 取消测试通过。
  - 证据边界：已证明本地请求与服务端生命周期语义；内建浏览器仅执行了只读页面与未提交表单验收，未触发生成请求；真实 HTTP + Provider 计费、网络中断和 Electron 取消按钮仍未执行。
  - 2026-09-22 回归修复（业务用途生成测试的 JSON 探针）：用途探针只发散文指令（不要求 JSON、不给字段名），而 `json_validated` 在适配器里是 `Output.text()` → `parseJsonText`（`JSON.parse` + 契约 `schema.parse`），因此真实 Provider 必然以 `Unexpected token '*', "**Research"... is not valid JSON` 失败（推理型模型另有一次表现为 `Provider 结束原因为 length`）。
    - 实现：`provider-connection-test.ts` 用途探针改为 system（只返回满足给定 JSON Schema 的 JSON 对象，禁 Markdown/围栏/解释/额外字段）+ user（最小可用实例、内联 `z.toJSONSchema(契约)`、并要求数值大于 0 与枚举取值合法）；用途探针输出预算 1024 → 8192（`PURPOSE_PROBE_MAX_OUTPUT_TOKENS`）。连接探针保持单次中性契约不变（1024、不注入 `reasoningEffort`），既有断言 `连接测试统一通过 SDK adapter 发出单次中性探针` 继续成立；用途预算上调依据 `tasks/2026-09-19-vercel-ai-sdk-integration.md`“对必须推理的模型预先给出安全输出预算”。内联 schema 与数值要求是必需的：契约的 `superRefine` 语义约束（`strategy.sizing.amount > 0`、`entry.conditions` 最短长度）无法由 JSON Schema 表达，只给结构会让模型输出 0 或空数组被拒。
    - 观测性修复：`ai-provider.service.ts` 中探针 total 超时此前被适配器统一归为 `cancelled`，即使调用方没有取消；现在该情形报 `errorCode: provider_timeout` 与“Provider 未在 N ms 内返回结果，已按超时中断”，不再显示成用户取消。
    - 定向验证：Server `tsc -p tsconfig.json` 通过；`vitest run test/ai/ai-provider-management.test.ts` 26 项通过（新增用途探针消息/预算/中性断言、连接探针最小指令、探针超时 errorCode 三项）；`vitest run test/ai` 146 项通过、17 项 PostgreSQL 集成按环境跳过；受影响文件 ESLint 通过。真实 Provider 复验（本地 LM Studio 推理模型，草稿显式 `timeoutMs=120000`）：连接 2.7s、研究 80.4s、参数优化 30.5s、策略发现 62.4s、研究（`native_schema`）76.7s 全部 `healthy`；同一探针在 Provider 默认 30000ms 超时下三个用途均如实报 `provider_timeout`。
    - 遗留（已记入 `docs/TODO.md`）：单次探针只消费 Provider 总超时，用途级/Provider 级 `firstOutputTimeoutMs`、`outputIdleTimeoutMs` 与路由级 `reasoningEffort` 都不参与，因此用途面板的“首输出等待 / 输出空闲等待”对“测试”按钮无效；推理模型需按用途匹配超时，本次由使用方把该 Provider 超时提到 120000ms。

### T4：显式研究默认与引用生命周期

责任边界：研究默认 `Provider + Model`、设置修订号、研究创建冻结和 Provider / 默认引用的并发及原子变更。

- [x] **T4.1：显式默认读取与任务冻结基础接入**（局部里程碑已完成）
  - 覆盖：完整 AC-17～18、AC-20 的基础实现，以及 AC-19 的提交修订检查基础。
  - 依赖：T1.1、T2.1；最小 AI settings 持久化记录。
  - 完成条件：默认不按列表顺序推断；研究创建读取显式默认并冻结 Provider、Model 和设置修订；无有效默认时明确阻断。
  - 已有证据：`AiRoutingSettings` 定向测试、Server services 测试、Prisma validate、migration matrix、Server / Desktop typecheck；内建浏览器已验证无研究默认模型时创建研究按钮保持禁用并给出配置提示。真实 PostgreSQL 并发 HTTP 和 Electron 研究界面实机未验证。

- [x] **T4.2：默认引用原子变更与并发保护**（本地实现里程碑已完成；真实 PostgreSQL 并发待验证）
  - 覆盖：完整 AC-17～21、AC-28。
  - 依赖：T4.1；默认设置的 `expectedRevision` 契约、Provider 条件更新和默认清除事务已固化。
  - 完成条件：`expectedRevision` 或等价版本保护不能被省略；删除、停用或移除默认用途时，确认、默认清除和 Provider 变更原子提交；并发冲突不得后写覆盖或产生悬空默认；不自动寻找下一个默认。
  - 验证方式：PostgreSQL 持久化集成、并发 HTTP、Provider 生命周期和研究创建测试。
  - 当前进度：Provider 保存、启停、删除均携带并校验 `expectedRevision`；默认 Provider 的停用 / 删除要求显式确认、设置修订号和同一 Prisma transaction 内清除引用；不自动寻找下一个默认，旧客户端缺少版本号会拒绝。
  - 定向验证：通过；Server routing / service / Provider management 生命周期测试、Desktop 生命周期请求测试、migration matrix、Prisma validate 和两端 typecheck 通过。
  - 证据边界：已证明服务层条件更新和事务调用的局部语义；尚未证明真实 PostgreSQL 锁竞争、并发 HTTP、研究创建竞态和部署后悬空引用回归。
  - 剩余条件：运行隔离 PostgreSQL 并发集成与目标 Server 验收后，才能把完整 AC-17～21、AC-28 标记为运行态通过。

### T5：迁移、兼容性、回归与真实运行态

责任边界：旧配置 / 旧路由迁移、旧客户端写入保护、能力移除回归、Docker、Server / Worker、Desktop / Electron 和真实 Provider 验收。

- [x] **T5.1：兼容迁移与旧客户端保护**（本地 dry-run、隔离 PostgreSQL 与目标库结构里程碑已完成）
  - 覆盖：完整 AC-25～27。
  - 依赖：T1.2、T2.2、T4.2 的本地契约；迁移输入和旧数据样本已由纯函数 fixture 覆盖。
  - 完成条件：迁移 dry-run 可报告冲突；已知值和零精确保留，缺失不补零，已有新价格不覆盖；旧路由冲突可定位且不静默合并；历史任务不改写；旧客户端有损写入被拒绝；重复执行幂等。
  - 验证方式：隔离 PostgreSQL、迁移报告、重复执行和旧客户端契约测试。
  - 定向验证：通过；`ai-provider-migration.test.ts` 3 项覆盖零值精度、已有模型价格保留、缺字段 / 重复用途冲突、重复规划稳定；Server 保存路径拒绝旧客户端省略已有模型级价格；dry-run 端点只读读取存量 Provider。
  - 证据边界：已证明纯函数报告和写入保护；仓库隔离 PostgreSQL 重建脚本已通过 66 表、当前 head、回滚、重复重建、权限和错误目标保护；另有隔离 PostgreSQL 任务执行集成 16 项通过。目标开发库已在明确授权后通过 `update.sh thesis-ledger` 重建到当前 head，并完成结构与服务 smoke。

- [ ] **T5.2：能力移除回归与真实运行态门禁**
  - 覆盖：完整 AC-29～30，以及 AC-03、AC-15、AC-23 的真实环境部分。
  - 依赖：T1～T4 的实现和 T5.1 迁移；目标 Server / Worker、Docker、Electron 和 Provider 环境可用。
  - 完成条件：不恢复能力声明、免费依据、上游限制或按域名切 SDK；通过实际 Server / Worker 地址完成无认证、有认证、指定模型测试、显式默认和业务用途输出闭环；Desktop 布局、滚动、保存和错误反馈可操作。
  - 验证方式：仓库门禁、`thesis-ledger-infra` 正确更新入口、目标 Docker、Electron / 浏览器人工验收和真实 Provider；没有凭证或环境时必须记录为未通过门禁。
  - 当前证据：目标 `thesis-ledger` 镜像已由授权的 `./scripts/update.sh thesis-ledger` 构建并启动；目标 `SchemaVersion=20260922100000_ai_provider_test_facts`、public 表数 66，Server / Worker / PostgreSQL / Redis / DSA 均 healthy，目标 HTTP/Redis/完整性 smoke 通过。另有一次目标无认证 Provider 探测实际进入测试链路，返回 `credentialConfigured=false`、unknown usage/cost，并因容器到 OpenRouter 的 TLS 网络断开收敛为 `down`；未发送 Key，也未产生计费生成。内建浏览器已通过 `http://127.0.0.1:5174` 访问当前 Desktop Web 预览，检查了 Provider 列表、连接配置 / 模型与用途双页签、模型价格未知提示、研究报告用途选择、未保存修改保护、自动化、诊断、研究默认缺失时的创建阻断和策略 AI 实验参数校验；所有浏览器改动均未保存，未填写凭证，未触发 Provider 生成。真实 Provider 成功生成/计费请求和 Electron 实机仍未执行。本机应用清单未发现 ThesisLedger Electron 应用，Edge 的 Computer Use 控制未获批准，未绕过权限进行 UI 操作。

## 3. 完整设计稿 AC-01～30 基线矩阵

下表是当前基线快照。`局部实现`不等于完整 AC 通过；完整 AC 只有在“完成”条件满足后才能勾选。

| 完整 AC | 核心断言 | 实现责任 | 验证责任 / 门禁 | 当前判定 |
| --- | --- | --- | --- | --- |
| AC-01 | 同一 Drawer 双页签切换不丢草稿，关闭有未保存保护 | T3.2 | Desktop 交互、Electron | 内建浏览器已检查双页签与未保存保护；Electron 待验证 |
| AC-02 | 切换 Provider 类型不重建 Drawer，非 AI 功能不回归 | T3.2 | Desktop 交互回归 | 局部实现；待验证 |
| AC-03 | 连接配置与目录获取分离，不要求先填价格或用途 | T3.2 | Server adapter、真实连接 | 局部实现；真实环境待验证 |
| AC-04 | 目录刷新不自动选用途、改价格、删模型或设默认 | T3.2 | 目录定向测试、Electron | 局部实现；待补竞态证据 |
| AC-05 | 连接参数变化后，晚到目录响应不能覆盖新草稿 | T3.2 | 请求竞态测试、Desktop | 局部实现；请求竞态已有门控，Electron 待验证 |
| AC-06 | 一个模型的多用途转换为唯一用途路由，模式和覆盖值不丢 | T2.1、T2.2 | 路由转换、Desktop 交互 | 内建浏览器已检查用途选择与覆盖面板；保存后完整路由和 Electron 待验证 |
| AC-07 | API 拒绝同模型同用途的多模式活跃路由 | T2.1 | Server Schema / HTTP 契约 | 局部实现；完整证据待补 |
| AC-08 | 旧配置模式混合时显示按用途配置，不打开保存即覆盖 | T2.2 | 旧配置 fixture、Desktop | 本地契约与组件已验证；内建浏览器已检查用途展开与撤销；旧混合配置和 Electron 待验证 |
| AC-09 | 空超时继承，零值 / 越界拒绝，单位和来源准确 | T2.2 | Schema、Server、Desktop | 本地实现与定向测试通过；内建浏览器已看到 Provider / 用途覆盖超时字段；Electron 保存后视觉与交互待验证 |
| AC-10 | 不同模型按目标模型冻结价格并预留、结算 | T1.2 | Server / 费用 / 任务集成 | 研究、策略冻结与隔离任务执行费用闭环已验证；目标运行态待验证 |
| AC-11 | 零费率、未知、非零和单边零价严格区分 | T1.1、T1.2 | Schema、费用门禁 | 生成前门禁与隔离执行费用事实已覆盖；真实 Provider 费用待验证 |
| AC-12 | 新价格不重算旧任务的冻结价格和结算 | T1.2 | 快照、历史任务集成 | 研究 / 策略冻结路径已补；历史集成待验证 |
| AC-13 | 用户零价与上游真实非零费用分别保留 | T1.2 | Provider 报告、费用结算 | 测试响应 / 历史详情已保留上游报告费用；真实结算待验证 |
| AC-14 | 非零模型未获本次预算授权时阻断调用 | T1.2 | 预算门禁、生成测试 | 任务创建、策略基础门禁、指定模型生成测试和隔离费用闭环已补；真实服务待验证 |
| AC-15 | 无认证连接不发 Key，不读取环境 Key 兜底 | T3.1、T5.2 | adapter 定向测试、真实服务 | 目标无认证探测以 `credentialConfigured=false` 进入链路，但上游 TLS 失败；无认证成功连接仍待验证 |
| AC-16 | 留空保留 Key；切换认证方式有确认和重新输入边界 | T3.1、T3.2 | Server、Desktop、Electron | 内建浏览器已确认 Key 输入不回显与留空说明；实机切换确认和保存后行为待验证 |
| AC-17 | 默认失效或预算不足时明确阻断，不按顺序换模型 | T4.1、T4.2 | Server、研究创建、真实服务 | 内建浏览器已确认无研究默认时创建按钮禁用且给出明确提示；并发与真实运行态待验证 |
| AC-18 | 调整排序不改变显式默认 | T4.2 | settings / 研究创建测试 | 实施中 |
| AC-19 | 默认在研究提交前变更时返回版本冲突 | T4.2 | 并发 HTTP、PostgreSQL | 服务层版本保护已实现；并发 HTTP / PostgreSQL 待验证 |
| AC-20 | 研究和策略只使用允许且冻结的模型，不自动换模型 | T4.2 | Server 执行集成 | 待补验证 |
| AC-21 | 删除、停用或移除默认引用时确认并原子提交 | T4.2 | Provider 生命周期、PostgreSQL | 本地 transaction 与确认已实现；PostgreSQL 待验证 |
| AC-22 | 保存、切页、详情打开不产生生成请求，未测试为中性状态 | T3.2 | Desktop 请求断言 | 内建浏览器切页、打开编辑器和撤销均未触发生成；完整请求断言仍以自动化测试为准 |
| AC-23 | 指定模型测试只调用目标模型，付费先授权，重复点击不重复调用 | T1.2、T3.2 | 生成生命周期、费用、取消 | 目标模型、付费授权、单飞、取消和事实留存已本地验证；真实上游待验证 |
| AC-24 | 配置变化和测试失败按正确粒度过期、归因 | T3.2 | 请求竞态、状态测试 | 待补验证 |
| AC-25 | 价格迁移保留值、缺失不补零、重复执行幂等 | T5.1 | 隔离 PostgreSQL、迁移 dry-run | dry-run 规划、冲突保护和隔离结构输入已验证；目标数据库 apply 待验证 |
| AC-26 | 旧路由冲突保留原值并可定位，不静默合并 | T5.1 | 迁移报告、冲突 fixture | 冲突 fixture 和隔离结构验证已通过；目标数据库 apply 待验证 |
| AC-27 | 历史任务和部署配置不被改写，旧客户端有损写入被拒绝 | T5.1 | 兼容 Schema、历史任务、部署检查 | 旧客户端有损写入已拒绝；历史任务 / 部署回归待验证 |
| AC-28 | Provider / 默认设置并发编辑返回冲突且无悬空引用 | T4.2 | PostgreSQL、并发 HTTP | 条件更新与事务已实现；PostgreSQL / 并发 HTTP 待验证 |
| AC-29 | 不恢复已移除能力声明、免费依据、上游限制或供应商专用依赖 | T5.2 | 源码扫描、边界 / 回归门禁 | 待验证 |
| AC-30 | 真实 Desktop / Server 闭环可操作并能修复失败 | T5.2 | Docker、Server / Worker、Electron、Provider | 未开始 |

## 4. 验收门禁与依赖顺序

| 门禁 | 前置条件 | 必须证明 | 未通过时的影响 |
| --- | --- | --- | --- |
| G0 基线一致性 | 本 Task、Spec、完整设计稿可访问 | 编号、任务责任、证据类型和状态无冲突 | 已完成；继续保留完整 AC 与局部里程碑边界 |
| G1 契约与纯函数 | T1.1、T2.1、T3.1、T4.1 的共享契约稳定 | 价格状态、用途唯一性、认证组合、超时、取消和默认引用的本地语义一致 | 已通过；Schema、Server / Desktop 定向测试和 typecheck/build 通过 |
| G2 Server / PostgreSQL 集成 | T1.2、T3.2、T4.2 的实现可运行 | 冻结、预算、测试状态、默认事务、版本冲突和历史事实正确 | Server 自动化、隔离 PostgreSQL 16 项和目标结构 / HTTP smoke 已通过；真实 Provider 费用事实未验证 |
| G3 Desktop / Electron | G1 和相关 API 契约就绪 | 双页签、目录竞态、错误定位、用途编辑、取消、默认展示和长 ID 可操作 | Desktop 自动化与内建浏览器本地 Web 预览已通过；Electron 实机未执行 |
| G4 迁移与兼容 | G2 完成，迁移输入和旧数据样本明确 | 迁移可重复、冲突可定位、旧任务不改写、旧客户端有损写入被拒绝 | dry-run、保护逻辑、隔离 PostgreSQL 重建和目标库 apply 已通过；真实 Provider 兼容输入未执行 |
| G5 真实运行态 | G2、G3、G4 完成；目标服务、凭证和预算可用 | 无认证、有认证、指定模型、显式默认和业务用途输出通过实际 Server / Worker / Desktop | 目标服务健康、AI 配置只读接口、无认证 fail-closed 探测和内建浏览器本地 Web 预览已通过；真实 Provider 成功计费与 Electron 实机仍未执行 |

执行顺序固定为：`G0 → G1 → G2 → G3 / G4 → G5 → 最终一致性 Review`。G3 和 G4 在各自依赖满足后可以并行，但 G5 必须等待两者以及 G2 全部完成。

## 5. 仓库局部 AC 与完整 AC 映射

| 仓库 Spec 局部 AC | 完整设计稿主 AC | 说明 |
| --- | --- | --- |
| 仓库 AC-01：模型级价格 | AC-10～14 的模型价格输入部分 | 不能代替冻结、预算、结算和上游费用事实 |
| 仓库 AC-02：价格状态和零值 | AC-11 | 不能代替执行路径上的预算门禁 |
| 仓库 AC-03：旧 Provider 价格投影 | AC-12、AC-25 | 兼容读取不等于迁移幂等和历史任务保护 |
| 仓库 AC-04：用途路由唯一性 | AC-06～08 | 仍需覆盖旧混合模式和 API 冲突场景 |
| 仓库 AC-05：模型用途编辑和目录行为 | AC-04～06、AC-22～24 | 仍需覆盖竞态、测试生命周期和真实请求 |
| 仓库 AC-06：已移除能力不回归 | AC-29 | 需要源码、边界和运行态回归证据 |

## 6. 最终一致性 Review

- [ ] 完整设计稿 AC-01～30 均有明确实现责任和验证责任
- [ ] 仓库 Spec 局部 AC 已映射到完整设计稿主 AC，编号不再混用
- [ ] 所有局部里程碑与完整功能验收明确区分
- [ ] 所有已勾选子任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [ ] 启动依赖、验收依赖和契约就绪证据正确且无循环
- [ ] 跨任务接口、类型、状态、时间、错误和副作用语义一致
- [ ] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [ ] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [ ] 证据类型、场景覆盖、代码版本和目标环境支持所声明的验收结果
- [ ] 测试、配置、文档、Spec / Task 状态与实际实现一致
- [ ] 未发现未处理的实现、Spec、任务或验收证据不一致

### Planning Review 结论

- 结论：**本地实现完成，外部运行态门禁未通过**。T1～T4 与 T5.1 的本地交付物已完成，不能据此宣称完整 AC-01～30 全部通过。
- 已确认的默认决策：完整设计稿 AC-01～30 为主编号；客户端不得提交 `pricingVersion`；影响默认引用的变更必须有版本保护和原子提交；取消不等于零消耗；真实环境缺失不豁免运行态门禁。
- 当前剩余门禁：真实 Provider 成功计费请求、有认证请求和 Electron / 浏览器人工验收；无认证探测已执行但被目标容器外联 TLS 失败阻断。当前环境虽有 `openrouter` 配置，但未将其配置状态或 readiness 读取当作真实调用证据。
- 规划风险：完整设计稿位于 Downloads，后续若源文件发生变化，必须重新检查 AC-01～30 映射和受影响证据。
- 本次验证：Server 完整测试 813 通过 / 49 个 PostgreSQL 集成用例按环境跳过，Desktop 455 通过，Schemas 209 通过；另有隔离 PostgreSQL 任务执行集成 16 项、重建 7 项、结构测试 9 项通过，目标库重建到当前 head、目标 Compose 全部 healthy、目标 HTTP/Redis/完整性 smoke 和无认证 fail-closed 探测通过；migration matrix、Prisma validate / generate、两端 build / typecheck、受影响文件 ESLint 和 `git diff --check` 通过。`pnpm lint` 的 build、边界和工作区依赖门禁通过，但全仓 ESLint 仍被既有 mobile React Native Flow 解析错误及未修改的 Desktop / Server 文件 22 项错误阻断；未执行真实 Provider 成功生成/计费请求或 Electron 验收。

## 7. 2026-09-22 模型用途交互收敛增量

- [x] **T2.3：用途选择、单详情面板与默认输出覆盖保存**（局部里程碑已完成）
  - 覆盖：仓库局部 AC-07～09；完整设计稿中用途编辑、详情切换与输出配置相关断言的本地实现部分。
  - 实现：Desktop 将已启用用途与当前编辑用途拆分；用途 Chip 不再用于取消，详情面板是唯一取消入口；每个模型只渲染当前详情。Server 设置契约新增 `modelDefaults` 与路由 `modeOverridden`，默认变更仅同步未覆盖路由的有效 `mode`。
  - 兼容：缺少新字段的旧路由按显式覆盖读取，避免保存时改变已有输出方式；运行时仍消费已经解析的有效 `mode`，未改变业务路由、预算或测试执行路径。
  - 定向验证：`cd apps/desktop && pnpm typecheck`、`pnpm test -- ai-provider-ui.test.tsx` 通过（457 项）；`cd apps/server && pnpm typecheck`、`pnpm test -- ai-provider-readiness.test.ts` 通过（814 项，49 项 PostgreSQL 集成按环境跳过）。
  - 证据边界：自动化证明本地状态、序列化、Server Schema 与静态组件结构；未执行 Electron 实机交互、保存后浏览器回读或真实 Provider 调用。

- [ ] **T2.4：模型用途紧凑布局与降权操作**（已被 T2.5 的复选框 / 父表单保存交互替代；浏览器视觉门禁未验证）
  - 覆盖：仓库局部 AC-10～11。
  - 实现：移除用途详情内层 Card，使用 `Separator` 分隔默认配置和单一详情区段；默认方式、用途方式和超时输入改为最大宽度布局，超时使用 `InputGroup` 的“秒”后缀。用途操作已由 T2.5 的复选框和父表单统一保存替代。
  - 定向验证：Desktop typecheck、Provider UI 测试、受影响文件 ESLint 与 `git diff --check`；通过。
  - 证据边界：浏览器视觉验收未执行。2026-09-22 尝试访问本地 Vite 预览时，新端口连接被拒绝，已有预览端口同样不可达；未使用其他浏览器或绕过方式替代。静态测试不证明实际宽屏布局、菜单展开或视觉层级；浏览器检查不可替代 Electron 实机验收。

- [ ] **T2.5：用途 Draft、父表单统一保存与停用配置保留**（代码与自动化验证完成；浏览器 / Electron 门禁未验证）
  - 契约：`executionRoutes.enabled?: boolean` 保持向后兼容；未设置按启用处理。停用路由继续保存专属输出与超时配置，运行时快照仅过滤显式 `enabled: false`。
  - Desktop：复选框和表单只写父级 Provider Draft；模型用途不提供自己的保存、取消或 Dirty 提示。父级表单的既有保存、取消与关闭保护统一覆盖用途、价格和连接参数。用途测试继续使用当前 Draft，不隐式保存。
  - 验证：Desktop `pnpm typecheck`、完整 457 项测试和受影响 ESLint 通过；Server `pnpm typecheck`、`pnpm exec vitest run test/ai/ai-provider-readiness.test.ts`（16 项）与受影响 ESLint 通过。
  - 证据边界：自动化不证明真实浏览器中的复选、保存失败回填、离开确认或 Electron 视觉；这些门禁保持未验证。
