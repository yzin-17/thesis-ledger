# 规则监测执行与保存验证

对应[规格](../../specs/2026-11-15-rule-monitor-execution.md)与[任务](../tasks/2026-11-15-rule-monitor-execution.md)。日期：2026-11-15（Asia/Shanghai）。当前共享工作区未提交，既有修改保留。

## 实现范围

DSA `src/services/rule_monitor_runtime.py` 一次取得登记目录执行快照，对所选来源地址去重并逐件处理。总时限从执行开始计算，最长300秒；文档读取受剩余时间保护，到期后未读项目记录 `run_budget_exceeded`，停止标志继续终止任务。保留每件2MiB、最多15秒、连接3秒、不重定向和不重试；普通后台检查仅保存当前正文，逐件落库后释放。单来源 `inspect_once` 按既有协议返回捕获结果。

主仓 `packages/schemas/src/rule-source-monitor.ts` 允许目录扩展后的单来源文档计数和完整失败数组，保留历史分页及最近64条观察窗口。Desktop `useRuleSourceMonitor.ts` 每次人工保存先读取当前修订，再提交原选择；读取失败不提交，冲突不自动重发。`RuleSourceMonitorSettings.tsx` 仅显示保存错误，保留原保存操作；既有面板、hook 与两个浏览器脚本同步验证该行为。

## 已通过验证

主仓执行：

- `pnpm --filter @thesis-ledger/schemas exec vitest run test/rule-monitor-source-growth.test.ts`：3项。
- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-data/useRuleSourceMonitor.test.tsx src/features/market-data/RuleSourceMonitorPanel.test.tsx`：10项。
- 修改的两个组件、hook和相关测试定向 ESLint：通过。
- `pnpm --filter @thesis-ledger/schemas test`：149文件、1606项。
- `pnpm --filter @thesis-ledger/api-client test`：当前共享输入51文件、276项。
- Server 监测代理、来源增长与自动化投影定向测试：3文件、11项。
- `pnpm --filter @thesis-ledger/desktop build` 与 Schema build：通过。

DSA 执行 `.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py -q`（实际展开文件列表）：68项。覆盖当前全部登记来源和29去重文档的受控成功、25/53文档扩展、地址去重、53项失败历史完整记录、总时限后零请求、超时取消且无重试、停止、逐件对象释放及单来源按需返回协议。全部使用临时 SQLite 和受控读取，不请求真实外网。

DSA 修改文件 `py_compile`、语法边界、能力边界、runtime 打包合同及测试清单检查均通过；新增测试登记后有451个数据测试目标。本轮不运行 DSA 全仓离线测试或网络测试。组件测试沿用 React `act` 与 Node localStorage 的非失败警告。

## 门禁、同步及运行验收

边界与依赖门禁通过。第一次 `pnpm guardrails:complexity` 启动时因共享工作区新增开发依赖触发 pnpm 自动依赖校验，Context Mode 调用超过300秒；未以工具超时声称检查通过。后续使用等价原始入口 `NODE_OPTIONS=--max-old-space-size=8192 node scripts/lint-workspace.mjs --guardrails` 及 `node scripts/check-file-size-guardrails.mjs`，退出0：8组、3948文件，文件尺寸无警告。另一个任务拥有的 `packages/domain/src/arena-live-plan-display.ts` 有复杂度21的非失败警告，本轮不修改其职责。日志位于 `/tmp/rule-monitor-execution-guardrails.log`。原有包配置与锁文件的并发修改保留，未归为本任务实现。

浏览器使用本地5173前端，`PLAYWRIGHT_MODULE` 指向既有 Playwright 安装，`CHROMIUM_EXECUTABLE` 使用本机 Edge。来源保存脚本在1440、1024、768、390宽度验证十项选择，并在1440验证十七项扩展；均通过。先保存返回409、下一次人工保存遇读取503且无POST、再次人工保存成功；全程仅两次受控POST，没有真实配置写入，执行前后真实配置一致。原 `check-rule-monitor-schedule.cjs` 四宽回归通过，覆盖自动化时间编辑、启停、任务手动触发的受控幂等及返回导航，每场景真实写入0。

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，无额外跳过参数，兼容性预检与脚本退出0。Server及依赖重新构建通过，DSA、Server、Worker健康；无数据库结构或卷变更。镜像保持：DSA `sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`，Server/Worker `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`。更新只在容器可写层，容器重建后需再次同步或更新镜像，不作为生产发布证据。

独立只读核对：DSA容器runtime文件SHA256为 `71ba790395763f9b05dd5b090326136af76a944af81180e759ca09d179d2ca9f`，Server和Worker实际Schema文件为 `044493c4d80cb2caf3a21331bc7e321e6a28298a9d3cccc5a1ef1c7cfc32befd`，均与宿主输入一致。容器导入后的执行函数具有逐件释放及剩余时间超时保护；真实目录10来源、29文档。真实API返回200，配置revision=4、已选9来源，原计划和启停保持。

同步后首次浏览器验证在选择来源时遇候选节点不稳定并超时；脚本改为等待页面就绪和键盘选择后，完整四宽及十七项扩展再次通过，退出0。主保存入口覆盖409冲突、读配置503时零写入、后续按新修订成功；真实配置前后相同。截图包含失败和成功状态，位于 `/tmp/rule-monitor-source-growth-qa/`，不入仓；窄屏失败态已人工查看，错误独立显示，勾选完整保留且无横向溢出。

## 最终一致性审查

AC1–AC4均有实现与验证映射。目录规模不再限制单轮文档总数，单件大小、总读取时限、串行、URL准入和原子终态保护保留；后台结果及时释放，按需读取协议通过回归。人工保存统一读取最新修订，不自动重发写请求。未提交真实配置或发起真实外网资料检查；当前全部29文档执行的成功证据采用真实登记目录、隔离SQLite和受控文档响应，不宣称29个真实站点均可达。规格和变更记录已同步，无本轮剩余事项，任务及证据归档，Git未提交。
