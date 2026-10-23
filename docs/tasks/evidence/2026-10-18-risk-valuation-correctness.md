# 风险估值正确性实施证据

> 主题日期：2026-10-18；本次执行跨至 2026-10-19（Asia/Shanghai）。[当前任务](../2026-10-18-risk-valuation-correctness.md)持有状态，本页记录证据。未提交、未发布。

## 写集与合同

- `RiskValuationContextService` 接管后台持仓估值，Automation 只负责调用与保存摘要。复用 Market 正式报价、基金 NAV 和 FX 入口，不依赖 Performance。
- 组合用 CNY 比较；单币账户用自身币种，多币账户用 CNY；分母保持持仓市值，不含现金。数量、金额、换算和求和使用 `DecimalValue`，仅最终比例转换为有限浮点数。
- 缺价持仓保留身份；没有完整分母时省略权重。`dataQuality` 分别记录组合与账户覆盖、比较币种、价格来源/时点、FX 证据版本与稳定原因，不保存上游任意错误正文。
- Risk 派生账户使用账户比例；跨账户同标的组合比例相加，缺失不能经 `?? 0` 变成合法比例。依赖不合格时通过现有扫描结果错误字段报告，事件状态机和通知不执行该候选。
- 写入范围：`apps/server/src/risk/risk-position-valuation.ts`、`risk-valuation-context.service.ts`、`risk-context-aggregation.ts`、`risk-input-availability.ts`，现有 Risk Context/Service/Module、Automation Runtime、专用测试与 `scripts/check-boundaries.mjs`。大 Context 文件按职责提取并缩小。

## 已运行的验证

1. 修复前运行 `pnpm --filter @thesis-ledger/server exec vitest run test/risk/valuation-context.test.ts`：3 项全部失败。100 USD 与 700 CNY 被算为 0.125/0.875；缺价时剩余上下文只有一个；缺 FX 仍返回完整比例。汇率 7 是合成输入。
2. 修复后专用文件扩为 14 项：覆盖币种、分层覆盖、过期/未来/未知报价、缺失/过期/未来/未知日期质量 FX、高精度微量持仓、零分母、正式 NAV、派生账户及同标的合并。
3. `pnpm --filter @thesis-ledger/server exec vitest run test/risk/valuation-context.test.ts test/risk-state-machine.test.ts test/risk/services.test.ts test/automation/services.test.ts test/automation-runtime.test.ts test/automation/automation-runtime-foundations.test.ts`：6 文件、86 项通过。既有通知失败日志来自其受控故障测试。
4. `pnpm --filter @thesis-ledger/server typecheck`：通过，包含新 PostgreSQL 测试的静态类型；不证明数据库测试运行成功。
5. 最终合流的受影响 Server 40 文件 433 项通过，包含上述 6 个文件。非 CNY 基金资产不套用 CNY 净值，专用回归已覆盖。Server 正常 `build`、边界、workspace 依赖与文件尺寸检查通过；本轮新模块定向 lint 无错误。
6. 全仓 lint 尚未通过，剩余三处既有错误位于 `apps/desktop/src/features/portfolio/portfolio.account-actions.ts:60/106/141`（`no-floating-promises`），该文件未由本轮写入；未为此修改无关 WIP 或放宽门禁。

## 真实隔离 PostgreSQL 与剩余门禁

- 最初 Docker 只读连接失败；本次续做重新检查时，五个既有目标容器均健康，环境已恢复。没有由 Agent 启动 daemon、重建或同步目标。
- 在主仓执行 `node scripts/test-performance-correctness-postgres.mjs test/risk/valuation-postgres.integration.test.ts`：最终退出 0，风险 3 项、目标原子性 5 项及收益 HTTP 4 项合计 3 文件 12 项通过。专用库为回环随机端口的 `portfolio_valuation_fixture`，owner 为 `fixture_owner`；34 份 migration 全部执行，实际 marker 核对为 `20261019010000_research_submission_v2`。
- 风险文件实际使用 Prisma、Automation 执行/历史、Risk 规则和事件状态；仅价格、FX 和通知传输受控。完整估值验证组合 50%/账户 100%；缺价、缺 FX 分别保持原集中度状态/事件，独立账户及价格规则继续，历史读取保留不可用原因。没有投递外部通知。
- 首次隔离运行发现测试夹具 `backoffMs=0` 不符合既有严格合同，改为合法值 1；各场景独立重置自有规则状态并自行建立初始事件，消除测试顺序依赖。按传输职责提取合成市场输入后，严格复杂度/函数尺寸 lint 为 0 错误/0 警告，Server 类型检查通过。
- 隔离容器使用 tmpfs，未挂载业务卷，脚本已清理本次容器。过去的无数据库跳过仍不计通过；上述为新增的实际执行证据。
- 上述本地阶段未执行 RVCG；当时未扫描用户持仓、探测外部来源或发送通知，未改用户持仓/规则。后续目标层结果见下节。

## 保护与接续

三仓原未提交修改保留；没有 commit、push、tag、PR、配置/来源启用或真实模型请求。

## 2026-10-19 目标关闭证据

用户授权保留数据的正式更新后，RVCG 已在目标 Server 执行实际 handler、估值、规则、状态机和历史持久化，六组受控消费结果通过；原生产数据和快照另经更新前后及验收后保护核对，通知外发为 0。RVC-AC5 与 IR02 关闭对账通过。候选身份、输入范围、正式备份/恢复演练、结果及清理仅在[三项 P0 目标验收记录](2026-10-19-p0-target-acceptance.md)维护；不以受控输入认定真实来源资格。
