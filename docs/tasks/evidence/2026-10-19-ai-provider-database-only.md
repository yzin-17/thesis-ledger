# AI 服务统一页面配置实施与验证记录

## 范围与基线

- 日期：2026-10-19。
- 主仓基线：`da002744` 加既有未提交工作区；infra 基线：`3f661df` 加既有未提交工作区。验证对象是当前混合工作区，不是干净提交或已发布镜像。
- 先建立[Spec](../../specs/2026-10-19-ai-provider-database-only.md)和[Task](../../archive/tasks/2026-10-19-ai-provider-database-only.md)，再实施。主代理串行工作，未执行暂存、提交、重置或部署。
- 保留原有账户模式、研究 V2、Provider 页面/保存交互、infra 运维脚本等未提交修改；实际 `.env`、数据库凭证、默认模型及生成开关未改写。

## 实施内容

启动时使用空 Registry，初始化和动态刷新只从数据库加载 Provider 与路由。删除环境解析器、部署来源摘要、同名合并、接管和隐式演示注册。保留摘要 `source = database`、加密凭证、默认引用保护、配置版本与测试后保存门禁。基础设施环境配置继续保留。

页面统一使用新增与编辑流程，去掉接管状态及部署来源操作分支；已有密钥不回显，草稿关闭保护和模型用途配置继续使用原实现。Compose 不再透传 Provider 环境配置；示例环境和指南提示升级前通过页面重新录入仅存在于旧环境的服务，不自动导入密钥。

### 本次写集

- Server：`apps/server/src/platform/config.ts`；`apps/server/src/ai/` 下的 `ai.module.ts`、`ai-provider.service.ts`、`provider-adapters.ts`、`ai-provider-summary.ts`、`ai-provider.contracts.ts`、`contracts.ts`、`ai-research.executor.ts`（仅缺配置提示）。
- Server 测试：`apps/server/test/ai/` 下的 `configured-providers.test.ts`、`ai-provider-management.test.ts`、`ai-provider-environment-takeover.test.ts`、`ai-provider-database-only-postgres.integration.test.ts`。原接管测试保留文件位置与凭证/默认/版本断言，调整为数据库唯一来源语义。
- Desktop：`apps/desktop/src/features/providers/` 下的 `useAiProviderEditor.ts`、`AiProviderEditorFields.tsx`、`ProviderEditorSheet.tsx`、`ProviderSettings.tsx`、`ProviderSettingsSections.tsx`、`ai-provider.actions.ts`、`providers.types.ts`。
- Desktop 测试：`apps/desktop/test/` 下的 `ai-provider-ui.test.tsx`、`ai-provider-catalog-refresh.test.tsx`、`browser-ai-provider-model-removal.tsx`、`browser-ai-database-only.html`、`browser-ai-database-only.tsx`。
- 工程与入口：`scripts/check-boundaries.mjs`、`README.md`、`docs/README.md`、`docs/tasks/README.md`。
- 现行合同：`docs/specs/` 下的 `2026-09-14-openrouter-free-ai-provider.md`、`2026-09-19-vercel-ai-sdk-integration.md`、`2026-09-23-ai-provider-auto-test-save.md`、`2026-09-21-remove-ai-free-evidence.md`、`2026-09-21-remove-ai-capability-declaration.md`、本主题 Spec；`docs/tasks/` 下的 `2026-09-19-vercel-ai-sdk-integration.md`、`2026-09-21-ai-provider-model-usage-configuration.md`、本主题 Task 和本证据。
- infra：`compose.yml`、`.env.example`、`README.md`、`scripts/ai-provider-contract.test.sh`。未修改实际 `.env`、运行容器或镜像。

## 验证结果

以下命令均从主仓执行；运行工具链需要正常的 Volta、Node、pnpm 和 Docker CLI 路径，记录省略 RTK 包装和仅用于补齐工具发现的 `PATH`。

| 检查 | 命令或入口 | 结果与证据边界 |
| --- | --- | --- |
| Server 定向行为 | `pnpm --filter @thesis-ledger/server exec vitest run test/ai/configured-providers.test.ts test/ai/ai-provider-management.test.ts test/ai/ai-provider-environment-takeover.test.ts test/ai/ai-provider-upstream.test.ts test/ai/ai-provider-readiness.test.ts` | 5 文件、59 项通过。合法/非法遗留变量不影响解析；不隐式注册演示服务；空数据库初始化、数据库读取失败、停用/删除不重现、来源摘要、凭证与默认保护通过。 |
| Desktop 回归 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/ai-provider-ui.test.tsx test/ai-provider-auto-save.test.tsx test/ai-provider-lifecycle.test.tsx test/ai-provider-catalog-refresh.test.tsx test/ai-provider-model-selection.test.ts test/providers-automation-ui.test.tsx test/provider-query-invalidation.test.ts test/provider-credentials.test.tsx` | 8 文件、78 项通过。统一操作、新增/编辑草稿、凭证不回显、版本、目录竞态和默认引用保护通过。 |
| 真实隔离持久化 | `node scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-database-only-postgres.integration.test.ts test/ai/ai-provider-save-postgres.integration.test.ts test/ai/ai-provider-default-postgres.integration.test.ts` | 正式隔离脚本创建临时 PostgreSQL，核对数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`，执行 35 个 migration，3 文件、16 项通过，脚本自动清理。未接触目标业务库。 |
| 类型检查与构建 | `pnpm --filter @thesis-ledger/server typecheck`、`pnpm --filter @thesis-ledger/desktop typecheck`、两包各自 `build` | 均通过。Desktop 保留现有大 chunk 提示；不放宽限制。 |
| ESLint | 对本次 Server/客户端源码、新增测试与浏览器入口执行 `pnpm exec eslint <路径>` | 通过。首次发现删除来源标签后遗留的 `Badge` import，移除后复验通过。未执行全仓格式化。 |
| Compose 契约 | `bash ../thesis-ledger-infra/scripts/ai-provider-contract.test.sh` | 通过：即使宿主遗留变量有值，Server 配置也不包含六个退役键；执行开关继续保留，Worker 不接收 AI 配置。仅运行 `docker compose config`。 |
| 工程边界 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` | 通过。新增来源门禁能拦截退役键/工厂，允许超时、预算策略、加密主密钥。 |
| 文件尺寸 | `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | ratchet 通过；8 个已有大文件告警，无阈值调整。AI 服务文件由 1136 行降至 1085 行，适配器由 445 行降至约 248 行。 |
| 写集卫生 | 两仓 `git diff --check`；现行入口相对链接检查；运行源码退役键扫描 | 通过，无额外 Provider 环境入口。生成构建目录仍按原忽略规则处理。 |

隔离持久化新增用例通过真实 API 保存停用配置、验证加密与留空保留，再由第二个服务实例读取同一数据库，检查 Registry 状态刷新与删除后不重现。启用状态消费段直接调用生命周期服务，仅证明持久化消费；启用前用途验证由既有保存门禁测试覆盖，不冒充真实上游验证。

首次 Context Mode 的工具路径不包含 `rg`、`pnpm` 和 Docker CLI；补齐既有工具的绝对路径后检查正常运行，没有改依赖或锁文件。来源扫描一次因 `rg` 的无匹配退出码被当成异常，改为明确区分无匹配与命令错误后确认无残留。

## 浏览器交互

- 使用临时本机 Vite `127.0.0.1:5189` 与 `test/browser-ai-database-only.html`；挂载真实 `ProviderTable`、`ProviderEditorSheet`、编辑 Hook 和应用共享组件。
- 空列表可打开 AI 新增表单；修改名称后关闭出现放弃确认，放弃后回到列表。
- 数据库样例统一展示编辑、选择模型测试、启用、删除，没有部署来源标签或接管入口。
- 编辑样例显示“已配置且不会回显”，名称只读，API Key 不回填；关闭后返回列表。页面错误日志为空。
- 页面使用合成记录，保存/测试动作不会发送请求；只证明本次受影响界面交互，不证明目标数据库保存、Electron 或真实凭证可用性。
- 截图：`/tmp/ai-provider-database-only-browser.jpg`（临时本地验收图）。临时 Vite 在验收结束后停止。

## 扩大回归的现有失败

`pnpm --filter @thesis-ledger/server exec vitest run test/ai test/strategy-optimization/ai-provider-strict-routing.test.ts test/ai-trust-boundary.test.ts` 得到 326 项通过、1 项失败、62 项因未提供专用数据库环境跳过。专用数据库子集随后由上面的隔离脚本独立验证，不把其他跳过项记为通过。

失败位置：`apps/server/test/ai/services.test.ts:109`。现有未提交的 `AiRunService.list()` 增加了 `researchOwnerId: null` 隔离条件，旧断言仍精确期待 `where = { status: failed }`。该服务与旧断言均未由本次修改，不回退用户的隔离实现，也不为通过回归删除该过滤。扩大回归并非全绿。

## 最终复核与未过门禁

本次实现、定向回归、真实隔离持久化、浏览器受影响交互、构建与工程边界通过；凭证、版本、默认引用与暂停状态保持原合同。所有源码和模板改动均未提交。

目标 Docker 尚未更新；因此目标 Server 的新列表/能力、实际存量数据库配置、实际凭证保留与安装态保存未在本轮证明。目标验收保留在 Task，不以本地构建或隔离数据库替代。若后续需要更新，须由 infra 正式入口判断模板变更及兼容性，不能直接替换容器或绕过预检。真实模型生成保持停止。

## 2026-10-20 目标只读与同一镜像副本接续

以上“未更新”和扩大回归失败属于 10-19 当时结果，以下为本次独立核实的后继证据。目标已经通过[P0 正式保留更新](2026-10-19-p0-target-acceptance.md#正式更新与候选身份)进入 C1 镜像；无需重复部署。本次客户端按用户决定只验 Web，真实连接、用途生成和费用请求继续暂停。

### 产物与只读存量验证

目标 Server 镜像为 `sha256:c1f3c9d890e17f6ffa827aae9c80a8b21fd53e4d37d08ed4a51a3f3de8187eac`。宿主与实际容器的 `ai.module`、`ai-provider.service`、`ai-provider-runtime`、`ai-provider-summary`、`ai-provider.contracts`、`provider-config.service`、`platform/config`、`credential-security` 共 8 个编译 JS 文件逐字节相同，清单 SHA-256 为 `3eac44a1287e6d8bb25b9b43506372e8e72dac288fe53e59f49c75257e1dd44e`。

实际 `GET /api/v1/ai/providers` 的 3 个配置均为数据库来源，2 个启用，1 个 `credentialConfigured=true`。在显式 `SET TRANSACTION READ ONLY` 事务中使用纯 `decryptProviderCredential` 解开 1 份现存密文，确认非空且没有旧明文；没有调用可能自动轮换密文的 `ProviderConfigService.readCredential`。解密值只存在进程内存，没有输出或保存。

Web 直接通过 Vite 代理读取目标 API：列表显示 3 项；编辑已配置凭证的条目显示“已配置且不会回显”，没有明文输入值；模型、价格与用途按数据库回显，已获取目录数量仍为 0。仅打开页签并取消，没有取目录、测试、保存、启停或删除。三个截图保存在 infra 私有目录 `.maintenance-backups/ai-provider-copy-20261020-1/web-*.png`。

Web 前后两次只读核对相同：ProviderConfig（包含密文）SHA-256 为 `3a76afb6065f1e7ae84976089b35a42d0dd0b4b08914748b905ff4c212657774`，AiRoutingSettings 为 `e9f92ae3c39b05a4cf52d27c459e08e16e08826eeeeb221a3ce2ce95e9bebdf9`。五服务健康，7 张保护表和 57 份成功结果不变，AiRun/AiToolCall/ResearchObservation/AiInvocation/AiInvocationFact 均为 0。现有启用状态与运行开关原值保留；本轮未调用真实模型。

### 同一产物的隔离保存和重启

维护入口：

```sh
# thesis-ledger-infra
rtk proxy node scripts/ai-provider-copy-acceptance.mjs \
  --target thesis-ledger-dev \
  --baseline /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/g2a-baseline-20261020-1 \
  --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/ai-provider-copy-20261020-3
```

目标/固定库/回执所有权与镜像校验后，在无外网、无用户挂载的保留副本内启动实际编译 Server；原有只读 Server 不变，拥有写权限的子进程只连接 `restore_owner@127.0.0.1/restore_db`。畸形退役变量 `AI_PROVIDER_CONFIGS_JSON={` 不影响启动，也没有环境条目回流。

4 次独立 Server 启动、14 次实际 HTTP 请求通过：存量数据库列表、已有验证配置的停用及重新启用、空库启动、无用途的停用配置保存、合成凭证加密且不回显、留空编辑保留原密文、旧修订保存/删除 409、未验证启用 400、停用生命周期、重启加载、删除及再次空库启动。启用正向复用数据库已有验证记录，没有新验证或生成请求。

首轮 12 请求矩阵已通过；补启停场景时，原研究默认配置的停用被 409 正确阻断。随后选择同一副本中已有验证且不承担研究默认的条目完成启停，没有放宽默认引用保护或修改生产逻辑；失败回执与清理记录保留于 `ai-provider-copy-20261020-2`。

副本只改变 ProviderConfig/AiRoutingSettings 两表，其他业务表摘要全部不变；7 张保护表、原 57 份结果、10 份保存研究/9 条 Tool 审计和调用计数保持。上游请求 0、真实模型请求 0，所有本轮隔离资源已通过所有权校验清理。

最终私有 `ai-provider-copy-20261020-3/report.json` 输入 SHA-256 为 `bb975f4cd4d435676c2d85d33d50a1b85d9b71db2b659a4febfcbac04df5fead`，基线 Manifest SHA-256 为 `365c42b6e52768e4b5b40e7f0477ccb3f22409e58133e0c05aab423913134d07`。这证明同一镜像的隔离写入与重启，不能代替目标 Web 保存或真实用途。

### 扩大回归后继结果

只修正 `test/ai/services.test.ts` 的两处旧预期，补上生产已有的 `researchOwnerId: null`；生产过滤不变。`pnpm --filter @thesis-ledger/server exec vitest run test/ai` 为 39 文件、343 项通过，12 文件、63 项因缺少专用环境跳过。维护入口的参数/源文本边界测试 2 项通过。未将跳过项计为通过，也未因测试断言修改重新构建镜像。

此前目标实际 Web 保存按 T5-W 单独请求临时停用配置授权，后继已获准完成，见[最终记录](#2026-10-20-获准目标-web-保存与最终复核)；真实连接、用途、预算和费用条件不因本次结果解除。

目标保存预案由 infra `scripts/ai-provider-web-acceptance.mjs plan --target thesis-ledger-dev --output <新私有目录>` 只读检查通过：专用名称 `controlled-web-save-20261020` 不存在，当前 3 个配置，V2 创建关闭。后续仅在单独授权后执行 `prepare`，创建停用/无密钥/无用途/回环地址的临时配置，Web 把优先级 991 改为 992，再执行 `finish` 删除自身条目并逐项核对原配置/默认/保护表/调用事实；未获得授权时不执行 `prepare`。参数及固定输入安全测试 2 项通过，预案未写目标。

最终检查：导入边界、8 包依赖图和两仓 `git diff --check` 通过；本轮 15 个相关 MJS 文件语法检查通过，修改的 Server 测试 ESLint 无错误。ESLint 按现有配置忽略维护 MJS，不将其视为这些脚本的 lint 证据；尺寸检查报告 8 个既有大文件警告，本轮没有扩大这些文件。三仓 HEAD 不变、暂存区为空，没有提交或推送。临时 Web 页和 Vite 已关闭，隔离标签资源剩余 0；目标五服务健康、原保护表/57 份结果保持，五类 AI 任务/调用计数仍全部为 0。

## 2026-10-20 获准目标 Web 保存与最终复核

用户已明确回复“允许上述临时配置验收”。该授权只覆盖专用停用、无密钥、无用途条目；已同步到现行 Spec，不扩大到原配置、真实连接或生成。

实际执行目录为 `thesis-ledger-infra`，两次维护命令均退出 0：

```sh
rtk proxy node scripts/ai-provider-web-acceptance.mjs prepare \
  --target thesis-ledger-dev \
  --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/ai-provider-web-20261020-1

# 在真实 Web 编辑专用条目的优先级并保存、刷新后：
rtk proxy node scripts/ai-provider-web-acceptance.mjs finish \
  --target thesis-ledger-dev \
  --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/ai-provider-web-20261020-1
```

`prepare` 拒绝接管同名条目并先保存保护回执，创建后为 `enabled=false`、`credentialConfigured=false`、优先级 991。IAB 经本机 Vite 直接访问目标 API，在专用条目编辑器仅将优先级改为 992，点击“保存修改”；页面显示“配置已保存”，列表值 992，刷新页面后仍为 992，操作仍显示“启用”，没有执行测试、取目录或启用动作。截图为私有目录的 `web-saved-992.png`。

`finish` 再次真实 GET，核对专用条目地址、模型、停用、无密钥和无用途，按当前修订删除；随后完整比较验收前后的容器身份、7 张保护表、57 份成功结果、配置（含密文）、默认/路由和五类 AI 任务/调用事实，全部相同。回执 `passed=true`、`fixtureRemoved=true`，时间为 `2026-10-20T05:27:57.449Z`，真实模型请求为 0。`report.json` SHA-256 为 `44c39ca2a725fcac13ebb140a5492eacfa683b2c47ed983ef0cf13a642c3b95b`。

最终按本主题断言逐项复核：

| 断言 | 当前证据与层次 |
| --- | --- |
| AC1 | 退役变量/演示入口的定向回归、边界扫描，以及同一镜像副本的畸形退役变量实际启动；目标列表只有数据库来源。 |
| AC2 | 原隔离 PostgreSQL 持久化/竞争；同镜像副本的保存、密钥保留、启停、删除和重启；目标现有密文只读可解且不回显，获准临时条目真实保存并还原。 |
| AC3 | 原失败/原子替换定向回归；同镜像空库实际启动及删除后空态重启。没有清空目标库。 |
| AC4 | 原客户端及浏览器交互、目标列表/编辑/密钥隐藏，加上本次真实 Web 保存及刷新持久化。 |
| AC5 | 原模板、部署指引和边界门禁；实际镜像受影响文件与宿主一致，基础设施与真实凭证未改写。 |
| AC6 | 原定向、隔离数据库、两包类型/构建和工程门禁，加上后继 343 项 AI 回归、同镜像生命周期及目标 Web；63 个未具备专用环境的跳过项不计通过。 |

本主题完整范围通过，无新增 TODO；当前 Task 依项目规则归档，Spec 保留现行合同。真实连接、用途、非零费用、完整研究和策略业务仍由原 AI Task 管理并保持暂停，DG3 继续为原 TODO；本轮未验 Electron。原始证据继续留在原路径，临时条目已删除，用户已有数据保留。

归档前已跨三仓扫描引用，归档后核对受影响文档的 229 个本地链接均存在，归档 Task 没有未勾选项；当前正文 17 份、兼容跳转 3 份，与索引相符。现行 Spec 未移动，证据保留原路径，旧 Task 只保留单行跳转以兼容先前聊天中的文件链接。`git diff --check` 通过，临时浏览器页与 Vite 均已结束，没有提交或推送。
