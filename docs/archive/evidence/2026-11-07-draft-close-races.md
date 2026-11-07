# 草稿关闭竞态保护验证

关联[规格](../../specs/2026-11-07-draft-close-races.md)与[任务](../tasks/2026-11-07-draft-close-races.md)。本记录持有关闭保护与测试存储修复当轮的 Desktop 集成验证；后续活动任务共用的集成输入由[导航保护证据](2026-11-07-navigation-draft-snapshots.md#最终集成)持有。

## 故障与实现

在真实 `useDraftCloseGuard` 上控制确认 Promise，再通过 React 提交更新忙碌状态、草稿、打开状态或回调。原有两项取消/重入及初始忙碌保护通过；新增五项竞态在修改前全部失败，日志与结构化结果为 `/tmp/goal-draft-close-before.{log,json}`。

修复在 `useLayoutEffect` 中保存最新已提交状态；打开状态变化或卸载使原会话失效。确认返回后检查当前是否仍挂载、是否忙碌、是否仍为同一会话和同一草稿，再调用最新关闭回调。保留确认锁和调用方文案，不触发保存、取消或业务请求。

覆盖 AC1～AC4 的挂载回归包括：

| 场景 | 结果 |
| --- | --- |
| 确认期间开始保存 | 晚到确认不关闭；结束保存后可重新确认 |
| 确认期间内容改变 | 保留新草稿，下次关闭重新确认 |
| 面板关闭再打开 | 旧会话确认无效 |
| 组件卸载 | 不调用关闭回调 |
| 确认期间回调更新 | 仅调用最新已提交回调 |
| 取消、重复点击、初始忙碌、未修改草稿 | 保留原行为，未修改草稿直接关闭 |

源码消费者共 18 个文件，覆盖账户现金/定投/审计、策略回测、风险、来源与自动化设置、研究、复盘、配置目标及持仓边界。共享 Hook 只拥有关闭资格；保存成功后的直接关闭仍由各业务模块持有。未改变消费者的请求或保存流程。

## 本地测试与构建

以下均从主仓执行，实际命令带 `rtk proxy`。测试显式清除外部 `NODE_OPTIONS`，由项目配置建立 jsdom 存储环境。

- `env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test test/draft-close-confirmation.test.tsx test/navigation-draft-recovery.ui.test.tsx test/market-experiment-recovery.ui.test.tsx test/global-mode-transition.ui.test.tsx test/performance-workspace.ui.test.tsx test/research-form-v2.ui.test.tsx src/features/strategy/strategy.ui.test.tsx src/features/strategy/strategy.v2.test.tsx --reporter=json --outputFile=/tmp/goal-combined-targeted.json`：8 个文件、68 项通过。
- `env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test --reporter=json --outputFile=/tmp/goal-integrated-desktop.json`：236 个文件、1349 项通过，退出 0；没有跳过本轮失败用例。
- `pnpm --filter @thesis-ledger/desktop build`：退出 0，包含 Desktop 源码类型检查及 Vite 生产构建；保留既有大 chunk 提示。日志 `/tmp/goal-desktop-build.log`。
- `pnpm exec eslint apps/desktop/src/features/shared/useDraftCloseGuard.ts apps/desktop/test/draft-close-confirmation.test.tsx apps/desktop/test/browser-draft-close-races.tsx apps/desktop/src/features/strategy/strategy.ui.test.tsx --max-warnings=0`：通过。首轮误将仓库默认忽略的 `vite.config.ts` 列入，产生一条忽略警告；未修改 ignore，以独立配置类型检查和格式检查验证该文件。
- 配置类型检查：`pnpm exec tsc --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --typeRoots node_modules/.pnpm/@types+node@24.13.3/node_modules/@types --types node apps/desktop/vite.config.ts` 通过。首次从根目录直接指定 `--types node` 未能解析未直连的类型包，改用当前锁定类型目录后通过，没有安装或修改依赖。
- 现有 Codex Node 执行 `scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs`：通过，8 包依赖图有效。`GUARDRAIL_BASE_REF=HEAD` 执行文件尺寸门禁：通过，6 条既有债务告警未增长。

### 共享输入与并行变动

完整包执行前后记录 1914 个 Desktop 源码、测试、配置及 Schemas/Domain/API Client 源码和构建输入的 SHA-256。原始索引为 `/tmp/goal-integrated-inputs-{before,after,final}.json`。本轮自有源码和用例在完整包检查期间保持不变；`StrategyBacktestJobsPage.tsx` 被其他任务更新，随后定向复验相关五个文件共 39 项通过。其后其他任务更新 `test/strategy-center-ui.test.tsx`，再次单独检查该文件，14 项通过。

该结果支持当轮完整包加受影响范围复验，不能使整个主工作区成为干净提交，也不替代 Server、Mobile、数据库、来源或部署验收。后续源码发生变化时只复验受影响范围。

## 实际浏览器

使用仓库保留的 `/test/browser-draft-close-races.html` 与 TSX 受控入口，消费真实共享 `ConfirmDialogProvider`、输入组件及关闭 Hook。按照锁定 shadcn CLI 的 info/docs 核对 Base UI 组件，未安装、覆盖或修改组件库。

现有 Vite 服务和本机 Chromium 分别覆盖 1440、1024、768、390 宽度。每个宽度都实际编辑草稿、打开确认框，再由受控状态入口模拟保存开始、草稿更新和面板关闭重开，使用真实确认及取消按钮完成操作。确认框动画结束后测量边界并截图，不能以过渡缩放阶段的尺寸代替最终边界。

四宽均通过：保存时保留面板，新增内容保留，重开后旧确认无效，取消保留输入，新会话未修改时直接关闭；无整页横向溢出，确认框完整位于视口内。未捕获页面异常，业务 API 请求为 0。

运行脚本 `/tmp/goal-draft-close-browser.cjs`，结构化结果 `/tmp/goal-draft-close-browser.json`，截图 `/tmp/goal-draft-confirm-{1440,1024,768,390}.png`、`/tmp/goal-draft-saving-{1440,1024,768,390}.png`。已人工查看桌面与窄屏确认框及窄屏保存状态。首轮截图捕获到过渡动画，等待真实动画完成后重新验收；没有调整产品样式以迁就测试。

## 消费者快照补全与最终集成

进一步核对 18 个文件的 20 处调用，发现 9 处传入 `draft: null`，因此不能用前一轮共享 Hook 结果代收消费者的内容变化。现金入账/划转/快照、持仓边界、研究新建、风险编辑、JSON、证据及复盘草稿已补齐实际内容和业务身份；审计、更正、研究提交、回测、目标及自动化入口补齐已有快照的上下文。定投计划和发生项已通过业务 ID / 动作 ID 的 `key` 卸载旧编辑器，沿用原边界；来源表单原快照已有身份。

真实现金快照、JSON 和风险组件新增三项回归：确认期间切换账户、外部内容刷新、切换规则记录。旧空快照输入三项全部失败（`/tmp/goal-draft-consumers-before.{json,log}`），补齐后通过。扩展定向集为 8 个实际文件、55 项通过（`/tmp/goal-draft-all-consumers.json`）；测试选择参数中两个不存在的旧名称未发现用例，不将其计入文件数。

最终稳定输入验证：

- `env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test --reporter=json --outputFile=/tmp/goal-consumers-desktop-full.json`：237 个文件、1352 项全部通过。
- `pnpm --filter @thesis-ledger/desktop build`：源码类型检查和生产构建通过，仍有既有大 chunk 提示；日志 `/tmp/goal-consumers-build.log`。
- 20 个本轮 Hook、测试及消费者文件的 ESLint 通过（`/tmp/goal-consumers-lint-final.log`）。脚本目录按仓库默认不纳入 ESLint，最初列入时仅产生两条忽略警告；没有修改 ignore，脚本由 Node 测试和实际门禁验证。
- `node --test scripts/draft-close-boundaries.test.mjs`：四项通过，覆盖空快照调用、属性调用、合法空业务字段、注释/字符串/其他文件不误报；实际 `scripts/check-boundaries.mjs` 通过。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`：6 条既有债务告警，ratchet 通过。本轮初次误用不存在的 `check-file-size.mjs`，按实际维护入口纠正后通过；没有调整阈值或忽略规则。
- 本机已有 Codex Node 24.22.1 直接运行锁定 Vitest，清除 `NODE_OPTIONS` 后，三个存储回归及两个关闭保护文件共 41 项通过（`/tmp/goal-node24-storage-close.json`）。宿主普通入口的完整包仍为 Node 26.13.0，两个运行器的证据分别记录。

本轮完整包前后及浏览器验收后记录 1917 个输入的 SHA-256（`/tmp/goal-consumers-inputs-{before,after,final}.json`），三次完全一致；没有并行源码或测试变化需要再次扩大全量检查。

浏览器新增 `/test/browser-draft-close-consumers.html`，直接挂载真实现金快照和 JSON 侧栏，复用实际 Provider。1440、1024、768、390 四宽均验证新账户/刷新内容保留，侧栏在视口内且无整页横向溢出；同轮重新验证共享 Hook 的保存、内容变化、重开、取消和未修改关闭。结构化结果仍为 `/tmp/goal-draft-close-browser.json`，新增截图 `/tmp/goal-draft-consumer-{cash,json}-{1440,1024,768,390}.png`，已查看桌面 JSON、窄屏现金及确认框。首次新增入口加载失败源于验收脚本把源码路径 `/src/shared/api/` 当作业务请求拦截；按 URL 的实际业务前缀和外部来源分类后通过。页面异常和业务/外部请求均为 0。

## 范围复核

AC1～AC4 有原实现失败、修复后通过的 Hook 与实际消费者证据；AC5 有稳定输入的完整包、构建及四宽真实浏览器受控交互；AC6 有 AST 门禁测试与实际仓库结果。共享 Hook 只判断关闭资格，消费者只补齐快照，不改变提交、金额精度、业务请求与历史数据。此处浏览器使用真实组件和内存样本，不冒充真实账户写入验收。

本次没有 Docker 更新、外部行情或模型请求，也没有提交、推送或发布；完整主工作区仍含其他任务改动。当前子任务收口，全线程持续优化目标仍在执行。
