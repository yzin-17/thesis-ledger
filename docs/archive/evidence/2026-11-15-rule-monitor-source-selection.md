# 规则监测来源选择验证记录

对应[规格](../../specs/2026-11-15-rule-monitor-source-selection.md)与[已归档任务](../tasks/2026-11-15-rule-monitor-source-selection.md)。

## 输入与变更

日期：2026-11-15（Asia/Shanghai）。主仓与 DSA 使用当前共享工作区，修改未提交；本轮未改 package manifest、依赖、数据库、Dockerfile 或部署实现。主仓与 DSA 原有其他修改保留。

生产逻辑写集：主仓 `packages/schemas/src/rule-source-monitor.ts`；DSA `api/thesis_ledger_rule_monitor.py`、`src/services/rule_monitor_runtime.py`。移除来源选择九项与目录十项的常量；请求仍需符合标识格式且去重，最终成员资格由 DSA 同一次目录快照核对。文档数量、单件大小、总时限和外部请求次数预算不变。

回归新增于 Schema、API 客户端、Server 的 `rule-monitor-source-growth.test.ts`、Desktop `useRuleSourceMonitor.test.tsx` 和 DSA `tests/test_rule_monitor_source_growth.py`；后者登记到 `tests/data-test-scope.json`。受控浏览器脚本为 `scripts/local-runtime/rule-monitor-source-growth-browser.mjs`。

## 局部与包级验证

以下命令在主仓执行，均通过：

- `pnpm --filter @thesis-ledger/schemas exec vitest run test/rule-monitor-source-growth.test.ts test/rule-source-monitor.test.ts`：5 项。
- `pnpm --filter @thesis-ledger/api-client exec vitest run test/rule-monitor-source-growth.test.ts test/rule-source-monitor.test.ts`：7 项。
- `pnpm --filter @thesis-ledger/server exec vitest run test/market/rule-monitor-source-growth.test.ts test/market/market-rule-monitor.test.ts test/market/rule-monitor-schedule.test.ts`：10 项。
- Desktop 原 `RuleSourceMonitorPanel.test.tsx`：8 项；新增 `useRuleSourceMonitor.test.tsx`：2 项。
- `pnpm --filter @thesis-ledger/schemas test`：149 文件、1605 项。
- `pnpm --filter @thesis-ledger/api-client test`：50 文件、271 项。
- Schema、API 客户端、Server 与 Desktop 的包 `build` 均通过。
- `node scripts/check-boundaries.mjs` 与 `node scripts/check-workspace-dependencies.mjs`：通过。

DSA 中执行 `.venv/bin/python -m pytest tests/test_rule_monitor_*.py -q`（实际通过 Shell 展开文件列表）：42 项通过。`py_compile` 覆盖两处生产 Python 与新增测试，通过。覆盖创建、配置、再次更新保留计划及启停、旧修订409、手动入队、运行、状态和历史完整往返；未登记、重复、非法和不允许空选择均422，数据库与外部请求无变化。17 来源共享受控文档，只读取一次；既有25文档超预算零请求测试仍通过。

测试首次运行遇到 Desktop jsdom 路径转换问题、DSA 新测试未登记及关闭任务后下一次运行时间断言不符既有语义，均修正后通过。组件测试保留 React `act` 与 Node localStorage 的非失败警告。

## 重新读取任务

`reloadTask` 执行只读 `status.refetch()`。成功后仅将保留草稿的 `revision` 更新为最新值并 `create.reset()`，不会替换草稿的 `sourceIds`，也不会自动保存或启动资料检查；用户随后点击保存才提交。读取失败直接返回，保留草稿、原修订和保存错误。

已有保存失败处理会自动失效并重读查询，但草稿保留旧修订；显式重新读取让用户确认以当前修订继续提交。本次来源数量错误发生在客户端校验，重新读取不能修复限制本身；因此保留既有恢复行为，新增两条恢复回归。

## 部署与运行验收

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，兼容性预检及执行退出码0。使用当前共享工作区输入，不添加跳过参数；目标覆盖 DSA、ThesisLedger Server 与 Worker。三者健康，镜像 ID 保持不变：DSA `sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`；Server/Worker 使用 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`。本次更新仅写容器可写层，容器重建后需要再次同步或更新镜像，不代表生产发布。

独立验证：DSA 容器导入实际 `Input` 和 `RuleMonitorRuntime.validate_sources`，接受当前登记的十来源，无数据库写入和外部调用；Server 容器导入实际 `@thesis-ledger/schemas`，十项、十七项任务输入均通过。真实 `GET /api/market-data/rule-monitor` 为200，来源目录10项、保存9项、revision=4。核对部署文件与宿主输入摘要一致。

浏览器命令：`PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node scripts/local-runtime/rule-monitor-source-growth-browser.mjs`。使用实际 `http://localhost:5173` 前端及代理 API。默认 Playwright 浏览器版本未安装，改用现有 Edge；API 的3000端口只提供服务接口。

真实页面只读检查通过。受控请求分别覆盖1440、1024、768、390宽度的十项全选，以及1440宽度的十七项扩展；全部通过，无页面异常和横向溢出。保存首次返回409，失败读取返回503后错误和全部选择保持，再次成功读取只更新修订，随后保存完整来源成功；每个场景仅两次受控保存请求，没有实际配置提交或资料检查。执行前后真实配置逐字比较一致。截图位于 `/tmp/rule-monitor-source-growth-qa/`，不纳入仓库。

复杂度门禁：新增 hook 测试的类型和异步规范问题修正后，默认堆运行在 Server lint 阶段内存耗尽；`NODE_OPTIONS=--max-old-space-size=8192 pnpm guardrails:complexity` 退出0。未修改门禁配置或阈值。DSA 的语法边界、能力边界、运行时合同、测试清单四项检查通过（测试清单450个目标）；本轮使用42项监测回归，未运行 DSA 全仓离线测试或网络测试。

## 已确认的独立预算边界

当前十个来源包含29个去重文档，超过原有单轮24文档预算。来源保存与读取已修复，真实全选任务若执行仍会按原预算拒绝，未将扩大外部资料读取额度包含在此次修改中。此结论来自本地登记目录的只读统计，未发出外部文档请求。既有预算保护回归通过。

## 一致性审查

AC1–AC4 的来源数量修复、目录成员校验、恢复交互和本地同步均已有对应证据。生产改动仅三处小范围逻辑；认证、修订、去重、预算及历史语义保持。无数据库迁移，无真实配置修改，无提交或推送。规格已同步当前目录边界，原九来源夹具继续作为历史受控样本；本轮完成任务后归档，不新增后续实现承诺。
