# 收益、再平衡与目标保存实施证据

> 主题日期：2026-10-18；运行跨至 2026-10-19（Asia/Shanghai）。[当前 Task](../2026-10-18-performance-correctness.md)是状态唯一入口；没有提交或发布。

## 实施范围与经济合同

- PFC0：核对 Domain `performance.ts`、Server analysis/target/ledger-flow、API Schema、Desktop Summary/卡片及目标表。现有持仓、现金与模式口径保留；不重写历史 Ledger、Snapshot、目标或成功结果。
- PFC1：目标身份保持 `scope + accountId|null`，保存前拒绝 scope/account 不一致；事务级 advisory lock 串行同身份的停用、最高版本读取和新版本创建。本修复不新增 Schema、migration 或唯一约束；保护现有服务写入路径。专用真实 PostgreSQL 五项已通过，覆盖账户/组合 null 身份并发、跨身份隔离、创建失败回滚及读者看不到零 active。
- PFC2：新增纯经济边界计算模块 `performance-time-weighted.ts`。有流前/流后估值的 100→200→220 得到 10%；有现金流但缺边界时返回不可用。Server 保存事件数，零净额不能伪装成无流量；有明确且位于当前组合范围内的对手账户时，TRANSFER 才按内部划转排除，账户范围仍按外部资金处理。不新增采样、调度、持久化或回填。
- PFC3：`performance-money-weighted.ts` 固定 365.25 天及原毫秒日期差；排序并合并同时间戳流量，归一化后在 log(1+rate) 范围内保护求根，以回代残差确认结果。严重亏损可计算；多根/根歧义/有界搜索不足分别解释，不输出非有限数或假零。非传统流量不强选某个候选根。
- PFC4：规范化当前与目标类别并集；现有未设目标按 0，目标未持有按 0。金额保留原展示精度，舍入尾差分配到最大金额项，并通过 `roundingAdjustment` 记录，使完整无外流时差额守恒。partial、缺 FX 或非法分母不输出完整建议；不执行交易。
- 消费：新增 `ttwrorReason`；Server 独立计算 TTWROR/XIRR，Schema 保留新原因与边界。Desktop 复用现有卡片，显示各自原因及可计算指标，保留旧响应兼容；提取显示职责后 `PerformanceSections.tsx` 从本轮入口的 948 行缩为 930 行附近，没有堆积职责或新增 DOM/样式分支。

## 失败反例与定向结果

1. 修复前 `pnpm --filter @thesis-ledger/domain exec vitest run test/performance-return-correctness.test.ts`：6 项中 5 项失败，覆盖无边界仍返回收益、零净额绕过、严重亏损 Newton 不收敛、多根强选及遗漏现金来源；明确边界的正常分段一项原本通过。
2. 修复后 `pnpm --filter @thesis-ledger/domain exec vitest run test/performance.test.ts test/performance-return-correctness.test.ts`：2 文件、17 项通过。含严重亏损残差、极端合法初值、同时间戳流量合并、无效输入、多根、有限搜索不足、未持有目标、零目标、舍入及零分母。
3. `pnpm --filter @thesis-ledger/server exec vitest run test/performance-correctness.test.ts test/performance/services.test.ts`：最初 33 项通过；补充实际配置/严重亏损消费后，最终两文件共 35 项通过，已包含在 40 文件合流回归中。验证真实 PerformanceService/Analysis 逻辑；存储受控，不计真实数据库或 HTTP 验收。
4. `pnpm --filter @thesis-ledger/desktop exec vitest run test/performance-ui.test.tsx test/performance-target-save.test.tsx test/performance-mode-account-scope.ui.test.tsx`：3 文件、20 项通过；提取显示逻辑后重跑 UI 文件 16 项通过。包含独立不可用原因、仍显示 XIRR、失败保稿与模式账户范围。
5. `pnpm --filter @thesis-ledger/schemas exec vitest run test/performance-correctness.test.ts test/strategy-authoring.test.ts test/strategy-authoring-output.test.ts`：3 文件、33 项通过，其中本主题 3 项验证身份、V1 兼容与边界证据不丢失。

## 包级与工程证据

- Domain 全量：49 文件、441 项通过；之后按变化范围重跑指标/收益 4 文件、36 项并重新构建 Domain，全部通过。未变文件复用前次结果。
- Server 受影响集合：25 文件、212 项通过，4 文件、23 项因专用数据库条件缺失而跳过；后续提取执行前置/现金流投影后重跑受影响 4 文件、44 项通过。跳过不计通过。
- 最终合流：Schema 全量 101 文件、1,129 项通过，Server 受影响 40 文件、433 项通过，包含风险、收益、V3/NAV 与 DSA/新闻；后续新闻 HTTP 错误分类的 61 项补充通过，本主题源码未再变化。隔离脚本的 `node --check` 通过，不代表容器执行通过。
- 正常 `pnpm --filter @thesis-ledger/server typecheck/build` 与 `pnpm --filter @thesis-ledger/desktop typecheck/build` 均通过；Desktop 有原有大 bundle 提示，未调阈值。
- `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` 与文件尺寸门禁通过。新增 Risk 不能反向依赖 Automation/Performance 的规则。
- 全仓 `node scripts/lint-workspace.mjs --guardrails` 未通过：本轮新增显示函数的两处冗余断言已修复；剩余三处错误在既有 `apps/desktop/src/features/portfolio/portfolio.account-actions.ts:60/106/141`，为 `no-floating-promises`，该文件在本轮开始时已修改且未由本轮写入。未为了通过而改动该写集、降低门禁或加 ignore。
- 定向 lint 对本轮新模块无错误；复杂度按职责提取，现有 `runBacktestAttempt` 从含版本分支时的 33 降至 29，旧超阈值职责没有继续扩张。全仓旧警告不记作本轮消除。

## 真实隔离存储/HTTP 与剩余门禁

初次 Docker 连接失败；本次续做只读检查确认五个既有容器健康，环境已经恢复，未由 Agent 启动 daemon 或更新目标。在主仓执行 `node scripts/test-performance-correctness-postgres.mjs test/risk/valuation-postgres.integration.test.ts`，最终退出 0：目标原子性 5 项、收益 HTTP 4 项、风险 3 项，共 3 文件 12 项通过。

入口只创建随机前缀临时容器，使用 tmpfs、回环随机端口、专用库 `portfolio_valuation_fixture`/owner `fixture_owner`。34 份 migration 顺序成功并核对实际 marker 为 `20261019010000_research_submission_v2`，脚本已清理本次容器，未挂载业务卷。研究新增迁移属于 T4，不表示本主题修改了目标表结构。

HTTP 专用夹具装配真实 PerformanceController、Service、Analysis、Target、Snapshot 与 Prisma，未装配行情/通知/模型客户端。历史输入为隔离库中的合成 V1 快照和现金流：缺边界/零净额场景 TTWROR 不可用而 XIRR 可独立返回；严重亏损按 365.25 天验证残差，读取前后原快照相等。summary 再通过共享 `performanceSummaryResponseSchema`，与 API client 的解析合同一致。另验证精确分段 10%、股票 +500/现金 −500、partial 不生成建议、目标拒绝后保留原值。wire 正例使用合同要求的完整 ISO 时间，未放宽输入 Schema。

Desktop 三文件 20 项再次通过；新 HTTP/风险测试严格 lint（复杂度 20/函数 220）为 0 错误/0 警告，Server 类型检查通过。PFC5 完成上述本地受控消费层；当时 PFCG 尚未运行，数据库、共享 Schema 或组件测试不替代目标/浏览器证据。

## 2026-10-19 目标关闭证据

PFCG 已分别通过正式保留更新、目标容器内实际 HTTP/ORM 五组消费和浏览器操作。保存 503 后保留草稿与原活动版本，重试成功并在刷新后读取 v2 60%/40%；缺边界原因、有限负收益、现金来源和真实/模拟隔离通过。现行正向输入由实际现金命令写成当前信封版本，未降低旧信封拒绝条件。正式备份/恢复演练和最终原数据/快照保护通过，PFC-AC6 完成。本主题未新增 migration，也未写用户账户。候选、截图、精确请求统计及资源清理见[三项 P0 目标验收记录](2026-10-19-p0-target-acceptance.md)。

保留三仓既有未提交修改、来源配置、凭据、模型预算、通知渠道及业务数据。没有向用户账户写测试交易或修改历史；后续从 PFCG 的候选版本/受控范围核对接续，按正式 infra 入口及原前置执行。
