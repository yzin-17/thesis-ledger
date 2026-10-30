# Provider 模型目录通用配置实施证据

## 边界与基线

本主题按用户确认采用通用声明式配置，目录规则由前端用户手动修改，不代用户保存目标规则。生成协议与原模型选择、价格、凭据、默认研究设置和数据保持；模型调用 0，V2 关闭、余 2 次冻结，不 stage 或 commit。

[工作区基线](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/before-workspace-proof.json)记录三仓已有 WIP、HEAD、暂存及配置摘要；[运行态基线](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/before-runtime.json)记录受保护业务表、配置、DSA、环境及容器。旧目录专属模块及测试在同一私有目录保留原文件备份；仅按本主题要求撤除运行源码，历史验收包保留。

## T1：共享合同与保存往返

- `pnpm --filter @thesis-ledger/schemas exec vitest run test/ai-provider-model-catalog.test.ts`：20 项通过，覆盖保存／查询／回显、null／省略语义、JSON Pointer、URL、分页及认证同源边界。
- `pnpm --filter @thesis-ledger/schemas build`：通过。
- `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-provider-catalog-settings.test.ts test/ai/ai-provider-upstream.test.ts test/ai/ai-provider-compatibility-save.test.ts`：3 个文件、16 项通过。实际保存编排及设置序列化／解析／安全投影保留配置，旧客户端不擦除配置，目录变化不改变生成用途指纹；固定依赖测试中生成方法调用为 0。

以上为合同及固定依赖语义证据，尚不代表目标运行态或真实浏览器验收通过。

## T2：通用执行器

新增通用配置读取和查询编排，源码撤除原专属模块及测试；不按来源地址、提供方名称或模型前缀推断规则。原大型 Service 将目录查询委托给同 feature 的独立编排函数，文件规模收敛。

- `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-provider-catalog-configuration.test.ts test/ai/ai-provider-model-catalog.test.ts test/ai/ai-provider-catalog-settings.test.ts`：3 个文件、36 项通过，覆盖通用地址及字段映射、筛选、两种页码结束条件、根数组／字符串 ID、元数据白名单、数量／页数／重复页、共享超时、认证边界、已存规则与临时覆盖。固定请求均为 GET，无生成调用。
- `pnpm --filter @thesis-ledger/server typecheck`：通过。
- `node --test scripts/ai-catalog-boundaries.test.mjs`：4 项通过；`node scripts/check-boundaries.mjs`：通过。目录源码禁止内置绝对来源地址或按域名／提供方名称分支，标准协议认证与用户配置的同源比较允许。
- 按 recommend skill 检查项目实际 `es-toolkit 1.51.0` 的运行入口、`get` 声明及实现，并核对[官方说明](https://es-toolkit.dev/compat/reference/object/get.html)。`es-toolkit/compat` 的 `get` 使用点／数组路径，实测可读取继承字段，不符合本任务 JSON Pointer 标准转义及仅访问自身字段的语义，因此使用 AI 目录领域内的原生 `Object.hasOwn` 路径读取，不增加依赖。

首次回归发现网络请求参数从字符串变成 URL 对象，已统一回原有字符串调用形式，标准协议测试通过。该调整不改变实际请求目标。

## T3：前端手动规则

连接配置增加通用目录规则；复用现有 Field、Input、ToggleGroup 和原 TanStack Query mutation，不使用品牌预设。默认草稿仍省略新字段；用户切回默认时显式发送 null。手动规则参与获取、保存、回显及旧请求失效判断，获取本身不保存或替换模型选择。

前端定向验证共 44 项通过：`ai-provider-catalog-configuration.test.tsx` 5 项、`ai-provider-catalog-refresh.test.tsx` 9 项、`ai-provider-ui.test.tsx` 16 项、`ai-provider-api-boundaries.test.tsx` 14 项。表单的默认／手动切换、中文标签、根路径往返，以及真实编辑 hook 的提交、取消、失败、清除及竞态均有断言；请求依赖固定，不调用真实模型。

`pnpm --filter @thesis-ledger/desktop typecheck` 通过。首次渲染验证发现两处说明文字缺少 Field 上下文，已将说明放入对应 Field，重验 21 项表单及既有 UI 测试通过；其余 23 项未受该改动影响，复用已通过结果。

## T4：包级与仓库验证

当前全包验证采用 `vitest run --maxWorkers=2` 串行执行，测试进程移除真实凭据、数据库及 Redis 环境变量；日志保存在本主题私有验收目录。

- Schemas：117 个文件、1,353 项通过。
- API Client：30 个文件、183 项通过，其中新增目录配置传递、清除及非法输入不发请求断言。
- Server：426 个文件、3,506 项通过；68 个文件、356 项依赖外部环境的用例跳过，不作为本次目标运行态证据。
- Desktop：192 个文件、1,131 项通过。既有浏览器导航模拟的 stderr 不影响测试结果。
- Server 类型检查及仓库边界检查通过；Server AI 源码检索未发现 Cloudflare、Workers AI 或其目录地址。
- 对新增目录执行、查询编排和前端配置模块使用复杂度 20、函数有效行数 220 的严格 ESLint 检查通过。初检发现两处函数复杂度超限，已按连接解析、单页 HTTP 读取和分页收集职责拆分，重新验证 36 项 Server 目录测试及严格检查通过；未调整阈值。

构建命令为 `pnpm --filter @thesis-ledger/server... --filter @thesis-ledger/api-client --filter @thesis-ledger/desktop -r --workspace-concurrency=1 build`，6 个受影响包通过；未执行原生构建或新镜像构建。最后将空地址校验并入目录输入 helper，编辑 hook 从任务前的 689 行收敛至 684 行，避免继续扩大存量文件；之后重跑 Desktop 全包 1,131 项、构建、局部 ESLint 和格式检查，均通过。Server／共享包输入未变化，复用其已通过结果。

`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs`、改动范围严格 ESLint、Prettier 及 `git diff --check` 通过。最终复杂度门禁通过，各组告警数与本轮首次仓库检查一致；新目录模块严格阈值检查无告警，未提高阈值或增加忽略项。相关原始日志及每次退出状态保存在私有验收目录。

## 正式更新与实际模块

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。正式入口：`./scripts/sync-code.sh thesis-ledger`，退出 0。目标 Server／Worker 已运行；变更不涉及运行时依赖清单、Prisma、migration、Dockerfile 或原生依赖，入口的兼容性预检通过，未绕过门禁。执行使用 `umask 022` 及工作区规定的 npm 镜像源。

[正式日志](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/formal-sync.log)确认仅更新 ThesisLedger 两个运行角色，未更新 DSA、数据库或外部卷。[模块反读](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/runtime-proof.json)确认：

- Server／Worker 的 7 个目录、查询、合同、保存和服务模块与当前宿主编译结果一致。
- 两端实际解析并消费的 188 个 Schema 模块逐文件一致。
- 两端均不存在已撤除的专属目录编译模块。
- 两端健康且镜像 ID 仍为原镜像；此次只更新容器可写层，重建后恢复镜像代码，不构成新镜像或生产发布证据。

## 实际前端临时规则

使用独立后台浏览器和任务自有的 `http://[::1]:5174/providers` 前端实例，保留用户原有浏览器草稿及占用 5173 的进程。进入现有 Provider 的连接配置，手动选择目录规则，填写目录地址以及下列通用字段：列表 `/result`、ID `/name`、筛选 `/task/name` 等于 `Text Generation`、页码 `page`、页容量参数 `per_page`、容量 100、起始页 1、返回空页结束。规则由表单提供，不依赖 Server 识别来源。

随后仅在模型页点击一次“从接口获取”：成功返回 39 个候选，保留原三款选择。没有点击保存、生成测试或启用。取消时确认放弃草稿，重开后仍为默认规则；完成后关闭独立标签页及自有 5174 进程。[浏览器记录](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/browser-proof.json)、[取消反读](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/browser-cancel-proof.json)及[截图](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/browser-catalog-39.png)保留。目标目录规则仍由用户后续在界面手动保存。

页面原有健康历史读取失败提示仍存在，不属于本次目录规则验收；目录按钮成功不代表该独立功能或 G3 真实模型验收通过。

## 配置、数据与额度反读

[最终保护记录](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/preservation-proof.json)确认 ProviderConfig 完整行、AI 设置、研究默认值 `openrouter/free`／修订 `5`、原三款模型、凭据及停用状态保持；未保存目录规则。V2 关闭、capabilities 的 `canCreate=false`，原 AI 历史不变，模型调用 0、余 2 次冻结。DSA、环境、`.zshrc`、原镜像及挂载保持，5 个服务健康。

不能声称 22 张表整体字节不变：初次严格检查发现 `PortfolioSnapshot` 从 6 条增至 9 条，失败状态与差异记录保留。只读追查确认新增的两条账户快照及一条组合快照来自北京时间 16:00 的既有 `snapshot-close-estimate` 定时作业，作业成功于 `2026-10-26T08:00:20.240Z`，早于本次快更。新增 3 条记录的 ID 与成功作业输出完全一致，来源 `DAILY_CLOSE`、估值 `ESTIMATED`、创建时间位于该作业执行区间，逐行摘要与差异精确匹配。[新增明细](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/snapshot-difference-details.json)和[作业关联](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/scheduled-snapshot-run.json)保留。

最终校验只接受上述经核实的三条独立后台新增：原 6 条快照全部保留，其余 21 张保护表完全不变。未删除、回滚或覆盖业务记录，未修改定时作业或其配置，也未把整表变化隐藏为“未变”。

## WIP 与最终 Review

[工作区反读](../../../.recovery-artifacts/provider-model-catalog-configuration-20261026/closed-workspace-proof.json)通过：三仓 HEAD 保持、暂存数均为 0，配置文件摘要保持。infra 的 119 项与 DSA 的 8,470 项既有 WIP 无内容变化；主仓变化均属于本主题声明的写入范围。两份撤除的专属源码／测试与私有备份摘要一致，其余基线文件无缺失，原验收包保留。

最终 Review 核对合同、保存、查询、前端规则、模块边界、分层验收和保护事实一致；当前通用规格保留，已完成任务与被替代规格归档，原路径仅保留必要跳转。归档收口只改变本主题文档，不影响上述源码与运行态验证结果。
