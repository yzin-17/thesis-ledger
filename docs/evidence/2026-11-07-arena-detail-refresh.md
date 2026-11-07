# 竞技场与周报详情刷新验收

## 结果与范围

Desktop 与 Mobile 的比赛列表、比赛详情、轮次、周报列表及周报详情复用既有刷新区域。同范围刷新保留原结果，在结果区可见部分中央展示一个加载圈；比赛详情等待详情与比较两个读取，轮次等待比赛与报告两个读取，以最后一个相关请求结束为准。

Desktop 策略中心的页面刷新纳入当前竞技场查询，周报复用共享刷新按钮。空列表的刷新区域采用 `min-h-8`，保证 32px 加载圈完整可见。首次读取、错误重试、Mobile 离线状态、中文空状态、比赛控制、冻结报告、修订号、模型过滤、来源和返回入口保持。

产品写集为 `ArenaPage.tsx`、`ArenaWeekPage.tsx`、`StrategyDashboard.tsx`、`ArenaScreen.tsx` 与 `ArenaWeekScreen.tsx`。查询仍由 TanStack Query 与原 feature 拥有，不增加请求或通用工具，不改变 API、费用、模型执行、数值精度或冻结事实；样式只组合已有原子类和组件。

## 受控回归

新增两端各 9 项回归，使用实际 API client、TanStack Query 和 Schema。比赛详情、轮次分别覆盖两种响应结束顺序；验证旧内容和链接保持、只有一个提示、较快请求结束后继续提示，以及首次加载、失败重试、列表与周报修订。Desktop 周报用例点击实际刷新按钮，并检查请求期间禁用。

| 检查 | 结果 |
| --- | --- |
| Desktop 定向 | 4 文件、25 项通过，`/tmp/goal-arena-refresh-desktop-focused-final.json` |
| Mobile 定向 | 3 文件、17 项通过，`/tmp/goal-arena-refresh-mobile-focused-final.json` |
| 冻结副本定向 | Node 24，竞技场、草稿恢复及全局账户旅程 3 文件、16 项通过，`/tmp/goal-arena-refresh-isolated-focused.json` |

受控响应归属 `scripts/fixtures/arena-detail-refresh.cjs`，比赛、比较、轮次、周报及空列表均通过实际 Schema 校验。延迟通过原生 `Promise.withResolvers` 控制，不新增共享工具。Mobile 单元测试用 React Native Web 承载实际原生组件，只替换运行时及焦点边界。

## 四宽实际浏览器

维护入口 `apps/desktop/scripts/check-arena-detail-refresh.cjs`。四种宽度为 1440、1024、768、390，覆盖列表、比赛详情两种完成顺序、轮次两种顺序、周报列表和长周报；当前版本额外覆盖两类空列表。检查真实刷新按钮、旧结果保持、最后一个请求结束、加载圈数量及可见区域几何、横向溢出、长结果滚动、错误恢复、周报到指定模型轮次和返回入口。

| 输入 | 场景 / 刷新阶段 / 截图 | 目标差异 | 受控 GET / 预设 503 |
| --- | --- | --- | --- |
| Desktop 基线生产资源 | 28 / 44 / 56 | 52 项 | 457 / 0 |
| Desktop 当前冻结副本生产资源 | 36 / 56 / 72 | 0 项 | 344 / 4 |
| Mobile 当前受控浏览器宿主 | 36 / 56 / 72 | 0 项 | 148 / 4 |

合计 100 个场景、156 个刷新阶段、200 张截图。基线 52 项检查差异分别为 28 次页面刷新未覆盖当前查询，以及两个等待阶段各 12 次缺少结果区提示，不是 52 个独立缺陷；基线另记录 7 次裁切。当前两端裁切均为 0，Desktop 最大中心误差 0.0078125px，Mobile 为 0。

三组写请求、真实外部请求、未知响应与未捕获异常均为 0。预设失败用于周报详情错误恢复，原有查询重试合同保持。基线没有覆盖竞技场的刷新按钮和周报直接刷新入口时，脚本记录差异，再经真实 AppShell 导航离开并返回触发缓存刷新；当前版本直接使用产品刷新入口。

Desktop 使用真实 App、Router、API client 和生产资源。Mobile 的 `browser-arena-refresh.tsx` 宿主使用实际 ArenaScreen/ArenaWeekScreen、共享原生组件、API client 和 Schema，仅替换登录运行时、焦点及导航接收边界；刷新按钮属于测试宿主。宿主父级采用有高度约束的 flex 布局，模拟原生滚动容器约束。该结果只证明受控浏览器中的实际组件，不等同于 Android/iOS 原生验收。

最终结果为 `/tmp/goal-arena-refresh-browser-closeout.json`，原始结果分别位于 `/tmp/goal-arena-refresh-desktop-baseline-browser/results.json`、`/tmp/goal-arena-refresh-desktop-isolated-browser/results.json`、`/tmp/goal-arena-refresh-mobile-current-browser/results.json`。人工复核当前 Desktop 1440 比赛、1024 轮次、768 长周报和 390 空列表，以及 Mobile 平板和窄屏长周报、空列表截图；加载圈完整，文字、边界、原入口与滚动保持。

## 最终验证

| 检查 | 结果与输入范围 |
| --- | --- |
| Desktop 完整包 | 冻结副本、Node 24、255 文件 / 1629 项通过，`/tmp/goal-arena-refresh-isolated-full.json` |
| Mobile 完整包 | Node 24、52 文件 / 231 项通过，`/tmp/goal-arena-refresh-mobile-full-supported-final.json` |
| Desktop 类型检查与生产构建 | 在冻结副本以项目锁定的 TypeScript 与 Vite 入口、Node 24 顺序执行，均通过；`/tmp/goal-arena-refresh-isolated-typecheck.log`、`/tmp/goal-arena-refresh-isolated-vite-build.log`，保留原大 chunk 提示 |
| Mobile 构建 | `tsc -p tsconfig.json` 通过，`/tmp/goal-arena-refresh-mobile-build.log`；原生配置和依赖未修改 |
| 静态检查 | 本轮 TypeScript/TSX 的 ESLint、12 份新增或局部重排文件的格式、CJS/MJS 语法及触及 diff 空白通过；StrategyDashboard 保留原有排版，只新增查询范围 |
| 仓库门禁 | Node 24 boundaries、workspace dependencies、`GUARDRAIL_BASE_REF=HEAD` 尺寸门禁通过，6 项既有尺寸告警未增加；日志为 `/tmp/goal-arena-refresh-{boundaries,dependencies,size}-final.log` |
| 入口体积保护 | 静态闭包 1,215,709 字节，相对按需加载前 2,854,018 字节减少 57.40%，`/tmp/goal-arena-refresh-isolated-bundle.json` |
| 共享复用 | 285 个 Mobile 输入与最终完整包输入一致；2562 个 Server/Domain/共享输入与[共享稳定证据](2026-11-07-fund-daily-decimal-display.md#最终验证)一致，复用 Domain 767 项及相关共享构建；`/tmp/goal-arena-refresh-reuse-final.json` |

## 共享工作区与冻结边界

共享工作区有并行的策略编写流程修改。本轮先前完整 Desktop 在并行测试与构建时有 11 项旧路由用例失败，独立重跑以同一输入 1629 项通过；记录分别为 `/tmp/goal-arena-refresh-desktop-full.json` 与 `/tmp/goal-arena-refresh-desktop-full-final.json`。这次成功发生在最终空列表最小高度调整之前，最终结论使用上述冻结副本。

最后一次主工作区 Node 24 完整测试期间，AuthoringClarification 的 JSX 正被改动，出现 3 个套件收集失败和 6 项测试失败（已收集 1612 项，其中 1606 项通过）。随后定向复核 6 文件 / 33 项，语法及全局旅程已恢复，剩余草稿恢复旧测试 3 项未适配新的“草稿操作”菜单。原始证据为 `/tmp/goal-arena-refresh-desktop-full-supported-final.json` 和 `/tmp/goal-arena-refresh-concurrent-focused.json`；本轮不改写其他任务源码或测试，不把这些结果改记为通过。

冻结副本位于 `/tmp/goal-arena-refresh-acceptance`。以最终输入清单的 SHA-256 为准，2003 个 Desktop 输入全部匹配：7 个被并行改写的旧文件从已保留基线 sourcemap 中取回，逐文件哈希相等才写入隔离副本；3 个冻结清单之外的并行新增文件未纳入该次验收。复制过程、恢复路径和差异记录于 `/tmp/goal-arena-refresh-isolation.json`。已安装依赖只做链接复用，共享包输入另行核对，未安装、修改或清理依赖。隔离目录执行 pnpm 时触发依赖目录校验并因无 TTY 主动退出，随后直接使用项目锁定的编译器和 Vite 入口完成等价构建；未绕过类型检查。

本轮 13 份产品、测试、样本与浏览器入口哈希与冻结副本一致，见 `/tmp/goal-arena-refresh-extra-inputs-final.json`。最终隔离包结果只对应此输入，不表示整个共享主工作区已全绿；并行策略编写流程的最终集成由其原任务持有。所有隔离恢复只写临时副本，主工作区新修改继续保留。

## 维护命令与证据输入

仓库正常工作区的定向入口为 `pnpm --filter @thesis-ledger/desktop exec vitest run test/arena-detail-refresh.ui.test.tsx test/list-refresh.ui.test.tsx test/page-refresh.ui.test.tsx src/features/strategy/strategy.ui.test.tsx` 和 `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test test/arena-detail-refresh.test.tsx test/loading-feedback.test.tsx test/parity/arena-entry.test.tsx`；具体测试文件以对应 JSON 的 testResults 为准。

冻结目录的 Desktop 完整包由 Node 24 直接调用已安装 `vitest.mjs run --reporter=json --outputFile=/tmp/goal-arena-refresh-isolated-full.json`；同目录顺序执行已安装 TypeScript 的 `tsc -p tsconfig.json --noEmit` 和 Vite 的 `vite build`。Mobile 完整包使用 Node 24 和相同已安装 Vitest 入口，参数 `run --dir test --passWithNoTests`。Node 24 位于 `/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。

浏览器入口为 `node apps/desktop/scripts/check-arena-detail-refresh.cjs <本地资源URL> <desktop|mobile> <baseline|current> <输出目录>`，通过 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 使用已安装浏览器。Desktop 使用 Vite preview 的 `configFile:false` 和显式静态资源根目录，Mobile 使用 `apps/desktop/test/arena-refresh.vite.config.mjs`。所有 API 读取被受控响应接管，写入及外部地址被拒绝并计数。

稳定输入清单为 `/tmp/goal-arena-refresh-desktop-inputs-final-validation.json`、`/tmp/goal-arena-refresh-mobile-inputs-final-validation.json`、`/tmp/goal-arena-refresh-shared-inputs-closeout.json`。最终一致性与临时服务清理结果随本轮 Task 保存。

## 清理与剩余验收

已停止本轮独立的基线、当前、移动宿主及冻结副本预览进程，所有受控浏览器已关闭；用户 5173 服务 PID 42737 保持运行，见 `/tmp/goal-arena-refresh-runtime-cleanup.json`。本轮未执行 Docker、数据库、真实行情、模型、通知、真实业务写入、提交、推送或发布。

[竞技场原任务](../tasks/2026-11-05-model-arena.md)和[周报原任务](../tasks/2026-11-05-arena-weekly-review.md)继续持有目标运行态、真实前向成交、自然周、Android/iOS 及各终端独立验收，本轮只补充刷新展示合同。本轮[实施任务](../archive/tasks/2026-11-07-arena-detail-refresh.md)已完成归档，[产品规格](../specs/2026-11-07-arena-detail-refresh.md)继续有效；本轮完成后结束当前实施。
