# 实验详情状态隔离验收

日期：2026-11-15。对应[规格](../../specs/2026-11-15-experiment-detail-scope-isolation.md)及[任务](../tasks/2026-11-15-experiment-detail-scope-isolation.md)。输入是当前共享工作区，保留并行工作；本记录不代表部署、真实 API 或真实模型验收。

## 实现与复核

- 真实详情入口按 experimentId 创建独立子树，采纳版本、审阅、焦点目标、提交意图、克隆链接、回执、提示及 mutation 忙碌状态属于该实验。URL 只改变同实验页签时保持原状态。
- 采纳、克隆、取消、封存测试及失败重试在页面离开后只继续必要事实刷新，不更新新页面局部状态或显示旧提示。采纳异常等待事实回读后再次检查生命周期。
- 成功与错误提示由当前实验生命周期持有，离开时仅关闭自身提示。原请求仍归属原实验，离开不等于取消服务端操作，也不自动重复提交。
- 克隆只在缓存缺失时建立初始快照，已有候选和详情不被空列表覆盖。返回原实验从采纳事实恢复正式版本；原版本来源关联、服务端并发和候选资格门禁未改。
- 核对详情内全部 React 局部状态与 refs、原生折叠状态、详情／对比／审阅查询，以及失败重试子组件。该子组件另一消费者属于原审查已确认无可达路由的旧工作区，未启用旧入口或扩大旧协议。

## 回归覆盖

新增 [experiment-detail-scope.ui.test.tsx](../../../apps/desktop/test/experiment-detail-scope.ui.test.tsx) 使用实际页面、React Router 同参数路由、TanStack Query 和 StrictMode。所有业务 API 使用受控替身，未接管的 fetch 直接失败；每项验证真实 fetch 调用数为零。

20 项覆盖：采纳后直接切换和返回、克隆链接跳转、旧审阅上下文晚到、五类操作各自晚到成功／失败、提示清理及旧回执隔离、采纳异常在回读期间离开、旧详情与对比晚到、当前及离开后的克隆缓存保护、成功提示清理，以及同实验页签保持原意图而新实验产生独立意图。

## 执行记录

命令从主仓执行，pnpm 使用已安装版本；命令环境包含 PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false、PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 新增回归初版，修复前执行 | 12 失败、1 通过；包含产品状态泄漏及测试编写时的文案／刷新次数定位问题，保留原始输出；后续按真实页面文案及正常刷新时序修正新增样本，既有断言未改 | /tmp/p2-scope-red.log |
| 最终定向：pnpm --filter @thesis-ledger/desktop exec vitest run test/experiment-detail-scope.ui.test.tsx test/market-experiment-recovery.ui.test.tsx test/strategy-experiment-detail.test.ts test/strategy-version-records.ui.test.tsx src/features/strategy/strategy-experiment-detail.model.test.ts | 5 文件、52 项通过，含新增 20 项 | /tmp/p2-scope-targeted-final.log |
| pnpm --filter @thesis-ledger/desktop test，最终产品修改前一轮 | 329 文件、2115 项通过；成功提示清理追加后重新执行全量 | /tmp/p2-scope-desktop-full.log |
| pnpm --filter @thesis-ledger/desktop test，最终轮 | 329 文件、2116 项通过，无失败、跳过或待办 | /tmp/p2-scope-desktop-final.log |
| pnpm --filter @thesis-ledger/desktop build | 类型检查与生产构建通过；保留原 Node localStorage 实验提示和产物块体积提示 | /tmp/p2-scope-build-final.log |
| 受影响 6 个 TS／TSX 文件 eslint，--max-warnings 0，complexity 20、max-lines-per-function 220 | 通过，零错误、零告警 | /tmp/p2-scope-lint-final.log |
| pnpm guardrails:complexity | 首轮 Node 4 GiB 堆耗尽；仅以 NODE_OPTIONS=--max-old-space-size=8192 重跑，8 组 3948 文件检查完成；Arena 并行写集另有一项复杂度告警，详见下文 | /tmp/p2-scope-guardrails.log；/tmp/p2-scope-guardrails-retry.log |
| node scripts/check-file-size-guardrails.mjs；node scripts/check-boundaries.mjs；node --check apps/desktop/test/browser-experiment-scope.qa.cjs | 通过，尺寸无告警，边界无错误，浏览器脚本语法通过 | /tmp/p2-scope-size-final.log；/tmp/p2-scope-boundaries.log |
| 真实浏览器受控验收 | 1440／1024／768／390 全通过 | /tmp/p2-scope-browser-final.log |

全仓复杂度记录的唯一告警为 packages/domain/src/arena-live-plan-display.ts:12，arenaDecisionPlanLines 复杂度 21，原上限 20，属于并行 Arena 实施写集。本任务未改该文件，不将其计为本次修复的零告警结论；规则、阈值、既有断言与跳过条件均未修改。

后续处理（2026-11-15）：用户另行授权后，该项 Arena 告警已修复；领域包 873 项及全仓 3950 文件零告警检查通过，见[独立修复证据](2026-11-15-arena-plan-display-complexity.md)。本节原扫描结果保留当时事实。

浏览器脚本为 [browser-experiment-scope.qa.cjs](../../../apps/desktop/test/browser-experiment-scope.qa.cjs)，样本入口为 [browser-experiment-scope.html](../../../apps/desktop/test/browser-experiment-scope.html) 与 [browser-experiment-scope.tsx](../../../apps/desktop/test/browser-experiment-scope.tsx)。通过维护的 Vite 入口在本次独占 5197 端口运行，使用已有 Edge 和 Playwright；PLAYWRIGHT_MODULE=/tmp/complexity-browser-qa/node_modules/playwright 指向本机已有依赖。脚本只拦截真实 API 的 /api/v1/ 命名空间，未知请求直接阻断；对控制样本先执行实际响应 Schema 校验。四宽度分别核对正式版本隔离、克隆跳转、晚到成功／失败不关闭新审阅、确认按钮恢复、Escape 与焦点恢复、弹窗边界及页面溢出。每宽度四次模拟写入均被 Playwright 本地 fulfill，真实 API 请求和非预期请求为零。

浏览器准备阶段保留的失败日志 /tmp/p2-scope-browser.log 至 /tmp/p2-scope-browser6.log 分别记录入口静态模块被过宽拦截、样本缺少标的、异步读取尚未就绪及退出动画尚未结束。修复样本和等待条件后，原行为断言全部保留，业务规则与阈值未放宽。

## 数据与资源边界

未调用模型、真实 Provider、真实采纳或重试接口；没有数据库连接、真实业务写入、Docker 操作、部署、业务服务重启、暂存、提交或推送。本次 Vite 5197 与浏览器验收进程已退出，已有前端及业务服务保持原状。原流程审查的服务端／API／隔离持久化 106 项证据按不变输入复用，没有重复运行受保护数据操作。

最终一致性复核完成：AC1—AC6 对应身份边界、五类回调、缓存保护、同实验意图保持、20 项新增回归及四宽度真实页面受控证据。未发现本范围新增回归或关联遗漏。git diff --check 通过；没有修改既有测试断言、启用状态、lint 配置或规则阈值。
