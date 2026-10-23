# 全局账户模式与切换保护验收（2026-10-18）

对应[全站 UI Task](../2026-09-08-ui-interaction-consistency.md)的 T6.R4/R5、T2.R14、T4.R4、T8.R1；稳定合同见[全局账户模式 R01](../../specs/2026-09-08-ui-interaction-consistency.md#全局账户模式r01)。这五个叶项通过，整份 UI Task 的全量入口、适用状态与最终 AC 继续开放。

## 输入和边界

- 开始时为 `main@da002744bd317b7754832c6ac41d169bcf005e27`，可见 `origin/main` 同提交，已有 376 个变更路径、暂存 0；在原工作区增量实施，保留既有修改。
- 本轮处理 Desktop 的全局模式、离开保护、账户往返和研究上下文；没有原生工程、依赖清单或数据库结构变更。
- AI 真实生成、连接探针、用途请求继续停止；路由故障切换暂缓。浏览器写入全部替代响应，未新建真实账户、研究、策略或实验，未修改交易、资金、凭证、路由或任务。
- 复用此前管理入口、查询失败、晚响应和保存恢复的未变输入证据，只补全局接线及转换差集。当前记录不替代 [AI 三项真实运行时门禁](../2026-08-25-ai-research-workbench.md#运行时验收门禁未完成)、Electron 或原生安装态验收。

## 实现与所有权

| 部分 | 当前实现与行为 |
| --- | --- |
| 外壳和记忆 | `App.tsx` 挂载 `NavigationGuardProvider` 与 `PortfolioModeProvider`；`AppShell.tsx` 提供唯一可见开关。宽屏在品牌与导航之间，折叠可用，≤800px 在普通流顶栏；三个业务页的旧可操作开关移除。`portfolio-mode-context.tsx` 同步恢复设备记忆，默认实际，存储失败保留内存模式并提示。 |
| 转换保护 | `features/shared/navigation-guard.tsx` 统一表单注册、单个 Router blocker 和刷新离开保护；现有 `useDraftCloseGuard` 接入。草稿确认可取消且单飞；确认后再次检查在途，操作及确认读取结束前不切模式或离开。模式不依赖共享导航层，新增的两条边界检查保护其依赖方向。 |
| 局部状态 | 账户页、复盘及与范围有关的策略表单按模式清理；策略中心整体保持挂载，模式无关的实验改名输入保留。收益、风险和研究历史不因整页重建丢失既有筛选或归属。 |
| 账户和链接 | `useAccountDataNavigation.ts` 在同一保护内提交账户、页签及管理入口变更；自动 URL 归一化使用 replace。复盘仅选择当前模式账户并写回 accountId；跨模式链接解释当前范围，历史导航不切模式。新账户归属只读继承当前模式，既有账户属性编辑仍按原合同。 |
| 研究范围 | `features/ai/research-account-scope.ts` 拥有模式内账户/持仓查询和 context 构造；非策略研究显式记录 mode，策略研究不携带它。跨模式重试禁止直接提交；旧 context 不补写或迁移。Schema、AiRunService 和 AiResearchExecutor 验证并消费同一冻结范围，非法显式 mode 拒绝执行；展示依据原 context。 |

## 源码验证

下列结果绑定本轮源码；定向回归先通过，再执行包级验证。测试中的 SDK 与请求均为受控替代，没有真实 AI 请求。

| 入口 | 最后结果和证据范围 |
| --- | --- |
| Desktop `vitest run` | 163 文件，935 项通过，0 失败/跳过；机器结果 `desktop-vitest-final.json`。 |
| Schemas `vitest run` | 99 文件，1088 项通过，0 失败/跳过；`schema-vitest.json`。 |
| Server `vitest run test/ai` | 42 文件，241 项通过、44 项环境跳过、0 失败；`server-ai-vitest.json`。跳过条件未关闭，不能称 Server 全量或目标数据库全量通过。 |
| `pnpm --dir apps/desktop typecheck`、`build` | 正常 TypeScript 与生产构建通过；最后策略局部挂载调整后再次类型检查通过。 |
| Server `typecheck`、`build`；共享包构建 | 通过；infra 快更再次按正式脚本构建必要共享包和 Server。 |
| 定向 ESLint、边界、可访问性 | 本轮源码/测试定向 lint、`scripts/check-boundaries.mjs` 和 13 项可访问性检查通过。新增文件格式检查通过，未全量格式化已有修改。 |
| 文件尺寸检查 | 返回 0，仍有 9 个存量告警，且未提供有效 baseline；该次不能证明相对基线的 ratchet，未提高阈值或新增豁免。 |

新增或补强的行为回归：

- `test/global-mode-transition.ui.test.tsx` 六项：首次请求前恢复、URL/重挂载、取消和单飞、写入及确认读取锁、确认期间新在途、浏览器返回、存储失败。
- `test/global-mode-account-journey.ui.test.tsx` 三项：真实路由/账户组件的选择和前进后退、创建模式继承、独立实验改名输入保留。仅替代 HTTP，未以简化页面代替业务组件。
- `test/research-account-mode.ui.test.tsx` 四项：模式内实体查询、草稿转换、重试归属、请求 context；真实生成 mutation 未调用。
- Server `research-context-mode.test.ts` 两项、`research-executor.test.ts` 四项增量及 Schema `ai-context-mode.test.ts` 三项：错配在创建前拒绝、显式范围持久化、两种模式与并发上下文的 Tool 谓词、旧 context 和非法范围。

## IAB 差集验收

使用生产预览 `http://127.0.0.1:5174` 与内部浏览器，没有使用外部浏览器。布局与账户往返阶段的包为 `index-CdlrhgCX.js`；最后收窄策略中心重建边界后，重新构建并在 IAB 加载 `index-BwIykdsn.js`，完成两项策略差集。后一次仅改策略局部挂载，未重做外壳和账户的已过矩阵。

最终资源 SHA-256：`3a5f0c9376405f643a91e2cf952c66f745673fbb07aa157505080827b4f26eb9`。

| 场景 | 实际结果 |
| --- | --- |
| 唯一入口和跨页 | 九个主导航页面均保持模拟模式，每页仅一个可见全局开关；刷新与重新打开研究页仍为模拟。投资组合、收益、风险页没有重复可操作开关。 |
| 宽窄和折叠 | 宽度 1440、1024、801、800、521、520、390 分别只有一个可见开关，无文档横向溢出；折叠侧栏 72px、开关 40px，当前中文模式可辨认。九页 × 浅深主题 × 390×844 共 18 组通过。 |
| 账户选择与往返 | 合成实际账户 A1/A2 与模拟 B；实际只列 A1/A2，选择 A2 后去投资组合再返回保持 A2。切模拟后只用 B；浏览器返回旧实际 URL 仍保持模拟 B，没有旧实际账本 GET；前进及重新切实际恢复各自选择，跨模式链接有说明。 |
| 复盘与空范围 | 复盘仅列当前模式账户，选择写入 URL，跨页返回保持选择；模拟无账户时明确显示模拟空态，不退回读取实际账本。 |
| 新账户和在途 | 从模拟空态创建，归属为只读“模拟账户”。第一次 POST 暂停时开关及表单禁用，浏览器返回受阻并反馈“操作尚未完成”。受控 503 后，返回确认可取消；重试保留原名称及 mode=shadow。受控 200 后，账户读取未完成仍锁住开关，GET 完成才解锁。 |
| 研究草稿返回 | 输入问题后返回触发确认；取消后原问题及 URL 保留。放弃并关闭后切实际，重开新研究为空问题，读取边界为实际。没有点击开始研究。 |
| 策略草稿切换 | 新建策略输入名称后切模式出现一次确认；继续编辑保留原名称，确认放弃后模式切换且新表单回到初始名称。无策略保存请求。 |
| 独立实验改名 | 修改行内名称后直接切模式，名称输入仍原样保留，没有 PATCH、创建或执行实验。此项修复了粗粒度重建策略中心会丢输入的风险。 |

客户端在途、503、空态及成功恢复使用合成账户/实验响应。它们只证明界面与请求合同，不是实际新建账户或实验业务成功证据。已过的慢响应测试按原输入复用；被取消的 GET 不作为成功晚响应消费证据。

主标签从基线重载起捕获的 38 个阶段无 hasMore/truncated 缺口。非 GET 请求为两次 `/performance/allocation` 与两次 `/accounts`：前者是 `PerformanceAnalysisService.allocate` 的纯计算读取，不持久化；后者均在发出前截获，分别返回 503/200，两次请求名称相同且 mode=shadow。没有研究/生成、探针、用途、故障切换或实验写入请求。重新打开的另一个标签只用于设备记忆的界面证明，其启动捕获存在截断，不据此宣称完整请求审计；目标 AI 开关和任务计数另行核对。

## Docker 同步与只读消费

Server 与 Schema JSON 合同发生变化后，使用 infra 正式入口 `./scripts/sync-code.sh thesis-ledger`。兼容性预检、构建、同步、重启及健康检查通过，未改依赖或结构，不需要数据库重建；末次策略调整仅在 Desktop，不重复同步 Server。

- Server 容器 `1a145a5e4db7`、Backtest Worker `336c51074cc2` 均 running/healthy，容器 ID 未变。实际镜像为 `sha256:01a95577d04eae13c33e284a8b1d9c441d340796be813a7365190bce9b0468a1`，两者 `/app/var/backtest` 的 `thesis-ledger-backtest-data` 挂载未变。
- `ai-run.service.js`、`ai-research.executor.js`、`ai-research-query.js` 的目标与宿主产物哈希逐项一致。快更只更新容器可写层，不能作为正式镜像或安装包已更新的证据。
- 在目标已编译 AiResearchExecutor 上直接调用只读 `toolAdapters(mode)` 的组合、持仓、风险和复盘适配器；未创建 AiRun、未启动执行器生命周期、未调用 SDK。
- 模拟范围读取现有活跃账户 1、持仓 1，成员范围正确，证明该范围正向只读消费；实际活跃账户 0、持仓 0，仅证明空范围隔离。风险/复盘均为空，不据空样本证明这些业务的正向消费，也不关闭真实 Provider、在途重启或长任务门禁。
- 验收前后数据库计数保持：Account 8、Position 1、AiRun 0。最终再次从目标 Prisma 只读计数，并确认 `AI_RESEARCH_EXECUTION_ENABLED=false`。

## 恢复与仍开放条件

所有响应替代已清除并重新加载真实数据。管理列表仍为 8 个账户，活跃子集 1 个与开始时完全一致；合成新账户不存在。模拟选择重新归一到真实账户，最后恢复初始有效模式“实际”、深色主题和原涨跌配色，撤销临时视口，关闭两个自建标签及本轮预览进程，Docker 保持运行。

本地原始结果及截图在 `.recovery-artifacts/global-mode-r01-2026-10-18/`：`browser-receipt.json`、`browser-cleanup.json`、三份测试 JSON、`global-mode-{collapsed,cross-history,strategy-draft-confirm,experiment-rename-preserved}.jpg`、新账户/研究草稿截图及 `global-{dark,light}-*.jpg`。本文件保留核心步骤、结果和限制，临时截图不构成唯一状态依据。

T1–T6/T8 的其余完整入口/适用状态与最终 AC、真实 AI 三类业务、Electron/原生安装态和各 Task 的外部条件继续开放。基金 NAV、来源资格及真实通知等不因本轮通过而关闭；故障切换和 AI 真实生成继续遵循暂停决定。没有提交、推送或删除历史证据。
