# 策略实验执行一致性与体验完善任务

关联规格：`docs/specs/2026-09-08-strategy-lab-execution-parity.md`

## 实施原则

- 使用测试驱动开发：先写能表达公开行为的失败测试，再实现，再重构。
- 每个任务完成后记录验证命令与结果；不得以类型检查替代引擎或交互测试。
- 保持改动集中在策略实验链路，避免顺手重构无关模块。

## 任务清单

### T-01 实现回测引擎缺失语义

依赖：无

对应验收：AC-02、AC-03、AC-04、AC-11

- 为 `trailing` 止损、ATR(14) 止损、`trailing` 止盈和 `risk` 仓位补充 Domain 级失败测试。
- 在 `runBacktest` 内维护每个持仓所需的峰值和 ATR 上下文。
- 实现退出触发、退出原因和 `risk` 仓位拒绝原因。
- 保持 `fixed` 为固定投入金额，并验证交易单位、现金与风险约束仍生效。

验证：Domain 定向测试、Domain 类型检查。

### T-02 打通数据截止时间与基准链路

依赖：T-01

对应验收：AC-01、AC-11

- 扩展 Desktop 任务输入，使用版本 Schema 的 `universe.asOf`。
- 获取基准行情；相同标的复用数据，基准失败时生成警告并允许主回测继续。
- 在 Server 持久化并向 worker 传递 `benchmarkBars`。
- 补充 Desktop action/API 与 `BacktestService.queue/run` 测试。

验证：Server 和 Desktop 定向测试、类型检查。

### T-03 修正策略编辑器一致性

依赖：T-01

对应验收：AC-05、AC-07、AC-10、AC-11

- 先补高级 JSON 切换与直接保存的失败交互测试。
- 将百分比显示转换、类型相关字段和默认草稿逻辑提取到职责明确的模块。
- 修正高级 JSON 草稿应用流程及错误状态。
- 修正单位、范围、空白默认、成本参数折叠、T+1 可访问名称和中文关闭文案。

验证：Desktop 组件测试、类型检查。

### T-04 完善版本与回测配置

依赖：T-02、T-03

对应验收：AC-06、AC-08、AC-10、AC-11

- 增加历史版本选择并确保编辑和回测动作使用当前选择。
- 将默认回测区间改为动态最近一年，增加至少三个时间预设。
- 完善任务空状态、状态回退和终态进度展示。
- 修正 1024px 页头布局。

验证：Desktop 组件测试、类型检查。

### T-05 完善结果反馈

依赖：T-02、T-04

对应验收：AC-09、AC-10、AC-11

- 用策略名称、版本、标的和区间建立结果上下文。
- 增加具有可访问摘要的权益、回撤与可选基准可视化。
- 展示结果中已有的费用、换手、拒单、数据完整性和警告。
- 对缺失字段使用明确的不可用状态。

验证：Desktop 组件测试、类型检查。

### T-06 全链路验收与文档收口

依赖：T-01、T-02、T-03、T-04、T-05、T-07

对应验收：AC-11、AC-12

- 运行相关测试、类型检查、lint、构建和边界检查。
- 启动本地页面，验证策略编辑、历史版本、JSON 防丢失、任务配置、结果和 1024px 布局。
- 检查控制台错误与警告。
- 将实际验证结果、未覆盖边界和必要的后续项写入本任务文档。

验证：全套命令与浏览器证据。

### T-07 Desktop 回测启动与弹窗关闭边界

依赖：T-04

对应验收：AC-13、AC-11、AC-12

- [x] 将 Desktop 的回测启动控制流拆为“同步校验”和“行情准备、入队、后台启动”两个阶段。
- [x] 同步校验通过并启动后台 pipeline 后立即返回成功给 Dialog，释放弹窗关闭边界并切换到“回测任务”；不得等待行情、queue、run 或完整回测结果。
- [x] 后台准备、入队、启动成功/失败分别展示 Toast，并刷新策略与任务查询；启动请求失败时不删除已入队任务，保留现有重试入口。
- [x] 使用 action 单测覆盖行情 Promise 尚未完成时先 resolve、行情完成后才 queue、queue 后 run 不阻塞，以及行情/run reject 后的反馈、刷新和 busy 释放行为。

验证：Desktop 策略 action/UI 定向测试、Desktop 类型检查、浏览器记录 submit-to-close（提交到关闭）耗时、任务页状态和 Console。

当前状态：T-07 代码、自动化验证和浏览器验收已完成；本次没有新增持久化回测任务。

验证证据：

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/refactor-contract.test.ts test/strategy-save-feedback.test.ts src/features/strategy/strategy.ui.test.tsx`：39 个测试通过。
- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- `git diff --check`：通过。
- 浏览器：`http://localhost:5173/strategy` 已验证。现有策略 v2 选择“近一个月”后，提交到 Dialog 隐藏并切换“回测任务”的 submit-to-close（提交到关闭）耗时约 271ms；后台继续约 35 秒后因主行情为空显示“回测排队失败 / 主标的没有可用行情”。Dialog 未重新打开，当前页签保持“回测任务 (1)”，页面仍可交互，Console error/warn 均为 0。因行情为空没有新增持久化任务，已有 1 条历史已完成任务保持不变。

### T-08 修复 Market Bar 日期适配与结果弹窗滚动

依赖：T-02、T-05、T-07

对应验收：AC-01、AC-09、AC-11、AC-12

- [x] Desktop 日线请求携带用户选择的回测起止日期，主标的与基准共用同一时间范围。
- [x] Desktop、Server、DSA facade 与 Provider runtime 逐层透传 `start`、`end`、`limit=365`，避免 DSA 默认只抓取最近 90 根后再过滤。
- [x] Desktop 在 Market API 边界把 Bar 压缩为引擎字段，避免一年期主标的与基准载荷超过 Server 默认 JSON 请求体上限。
- [x] Server 在 `BacktestService.queue/run` 边界将 Market Bar 的 `timestamp` 规范化为 Domain `BacktestBar.date`，同时兼容尚未执行的既有队列输入。
- [x] 结果 Dialog 使用固定标题区和独立正文滚动区，使共享关闭按钮不随正文滚走。
- [x] 先补充失败测试，再完成实现；覆盖 Server 持久化、Desktop 请求参数与弹窗滚动结构。
- [x] 重建 DSA 与 ThesisLedger 本地服务，发起新的真实一年期回测并验证完整区间、非空权益数据、关闭按钮滚动位置与 Console。

验证：Server、Desktop 定向测试与类型检查；本地浏览器真实回测和滚动位置检查。

当前状态：T-08 已完成。按 FAQ 启用 `ENABLE_EASTMONEY_PATCH=true` 后，真实回测任务 `e43b1618-c828-47d4-92eb-b074dee11f0f` 的主标的与基准均使用 243 根日线，完整覆盖 2025-09-08 至 2026-09-08，并生成 243 个权益数据点和 2 笔交易；主标的与基准均无缺失提示。

验证证据：

- `pnpm --filter @thesis-ledger/server test`：50 个测试文件、404 个测试通过；新增测试确认 Market 请求透传 `start`、`end`、`limit=365`，并确认 `timestamp` 在持久化前转换为 `date`。
- `pnpm --filter @thesis-ledger/desktop test`：28 个测试文件、193 个测试通过；覆盖回测区间与数量上限请求、固定关闭按钮结构和提示去重。
- DSA：相关 33 个测试通过，覆盖 facade 和 Provider runtime 的区间透传以及 ETF 东财失败后的腾讯通道回退；修改文件 `py_compile` 通过。
- Server、Desktop TypeScript 检查、Desktop production build、相关文件 ESLint、`node scripts/check-boundaries.mjs`、`git diff --check` 均通过。
- Docker：`daily-stock-analysis:thesisledger-dev` 与 `thesis-ledger:dev` 已重建并重建容器；DSA `/health` 返回 ok，ThesisLedger `/api/v1/health` 返回 healthy，database、redis、dsa 均为 healthy。
- 运行时接口：一年期日线返回 243 根，首尾为 `2025-09-08T00:00:00+00:00` 与 `2026-09-08T00:00:00+00:00`。
- 浏览器：新任务最终资产 ¥99,009.59、累计收益 -0.99%、最大回撤 -5.11%、权益曲线 243 点、交易 2 笔；基准收益 2.04%、超额收益 -3.03%，数据完整性为“完整”。结果正文从 `scrollTop=0` 滚到 `134.5` 时，关闭按钮保持 `top=40/right=1066.5`；Console error/warn 为 0。
- 验收过程保留了旧前端进程较晚完成的 90 根任务 `a713729f-4158-467b-836b-599d63dfb44c`；精确 Queue 诊断另创建了 `33333333-3333-4333-8333-000000000098`，自动权限审查未允许继续执行该任务，因此保持排队状态且未绕过权限。未删除或覆盖既有任务数据，最终证据取自页面创建的 243 根主标的与 243 根基准任务。

## 计划 Preflight

- Spec 覆盖：AC-13 已由 T-07 覆盖；原有 AC-01 至 AC-12 的任务映射保持不变。
- 占位扫描：未发现占位词或未定义的实现契约。
- 依赖检查：T-07 只依赖已具备策略任务与查询链路的 T-04；T-06 收口任务显式依赖 T-07。
- 未决问题：无 Blocking；未入队的 Desktop 会话内后台准备在关闭/重载时不保证继续，已在 Spec 中记录边界。
- Preflight 结论：Ready with non-blocking assumptions。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未创建提交，保留当前工作区改动
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：T-07、T-08 完成；全链路 T-06 仍保留未勾选状态，未将本次单一路径证据扩展为其他 AC 的新运行时证明。
- 发现的问题：首轮修复后主回测已成功入队并生成结果，但 DSA 默认上限导致所选一年区间只返回最近 90 根；基准恢复后，主标的与基准原始响应合计约 153KB，又超过 Server 默认 JSON 请求体上限。补齐 `start`、`end`、`limit` 全链路透传并在 Desktop 压缩 Queue Bar 后，真实任务已覆盖完整 243 个交易日及基准。
- 遗留风险：尚未入队的后台准备在关闭/重载应用时不保证继续；成功 queue 后的真实任务状态由既有自动化测试和任务轮询覆盖。
- 验证命令与结果：Server 404/404、Desktop 193/193、DSA 相关测试 33/33 通过；类型检查、构建、ESLint、边界检查和 `git diff --check` 通过；浏览器完整一年期任务成功，Console error/warn 0。

## 验收记录

已完成 Domain、Server、Desktop 与 DSA 的实现及自动化验证；完整一年期本地浏览器验收等待服务重建。

- Schemas：`pnpm --filter @thesis-ledger/schemas test -- contracts.test.ts`，8 个测试文件、104 个测试通过；已覆盖空信号值错误和可选基准。
- Domain：`pnpm --filter @thesis-ledger/domain test`，9 个测试文件、106 个测试通过；`pnpm --filter @thesis-ledger/domain exec tsc -p tsconfig.json --noEmit` 通过。已覆盖共同日期基准对齐、symbol/PIT 过滤。
- Server：`pnpm --filter @thesis-ledger/server test`，50 个测试文件、404 个测试通过；`pnpm --filter @thesis-ledger/server exec tsc -p tsconfig.json --noEmit` 通过。已覆盖版本 `universe.asOf`、Market 请求范围与上限透传、Market Bar `timestamp` 到 Domain `date` 的边界适配、`benchmarkBars` 持久化与 worker 透传。
- Desktop：`pnpm --filter @thesis-ledger/desktop test`，28 个测试文件、193 个测试通过；`pnpm --filter @thesis-ledger/desktop exec tsc -p tsconfig.json --noEmit`、`pnpm --filter @thesis-ledger/desktop build` 通过。已覆盖版本选择、动态日期、按回测区间请求最多 365 根日线、基准降级、空主行情阻止、高级 JSON 语义（未修改时切回常用配置不重复校验）、单位转换、类型切换安全默认值、比例范围、终态状态、结果可访问摘要、固定关闭按钮与提示去重；高级 JSON 未应用关闭会弹出确认。风险、执行与成本配置已提取至 `StrategyRiskExecutionFields.tsx`，主编辑器由基线的 1128 行降至 956 行，未突破既有文件技术债 ratchet。
- DSA：`tests/test_etf_daily_routing.py`、`tests/test_thesis_ledger_core_facades.py`、`tests/test_thesis_ledger_provider_runtime.py` 共 33 个测试通过；facade 与 runtime 均已覆盖 `start`、`end`、`limit` 透传，ETF 独立通道回退测试通过，相关 Python 文件 `py_compile` 通过。
- 静态检查：Desktop 策略文件 ESLint、相关文件 Prettier、`git diff --check`、`node scripts/check-boundaries.mjs` 均通过；Server `pnpm --filter @thesis-ledger/server build` 通过。
- 浏览器：`http://localhost:5173/strategy` 可正常加载；验证了新建策略为空标的与空信号值、T+1 可访问名称、止损切换到 ATR 后默认 2 倍、仓位切换到固定投入后默认 10,000 元、高级 JSON 未应用关闭确认、未修改 JSON 可返回常用配置、任务空状态操作。1024×768 下 `body` 与 `main` 无横向溢出，页头和操作区可用；控制台没有 error 或 warning。
- 浏览器成功链路：重建 DSA 与 ThesisLedger、启用 FAQ 建议的 Eastmoney patch 并重启最新 Vite 后，策略 v2 按 2025-09-08 至 2026-09-08 发起任务 `e43b1618-c828-47d4-92eb-b074dee11f0f` 并成功完成；主标的与基准输入均为 243 点，权益曲线 243 点，结果显示最终资产 ¥99,009.59、累计收益 -0.99%、最大回撤 -5.11%、基准收益 2.04%、超额收益 -3.03%、交易 2 笔，验证了完整区间、成功队列、worker 执行和基准比较。结果正文滚动 134.5px 后关闭按钮坐标不变，Console error/warn 为 0。
- 未完成证据：本次 Strategy V1 成功路径无未完成运行时证据；全链路 T-06 仍包含其他 AC 的浏览器覆盖，不因本次单一路径成功而自动勾选。
