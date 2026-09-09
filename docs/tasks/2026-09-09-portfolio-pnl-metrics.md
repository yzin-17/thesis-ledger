# 组合概览收益指标语义统一实施任务

对应 Spec：[`../specs/2026-09-09-portfolio-pnl-metrics.md`](../specs/2026-09-09-portfolio-pnl-metrics.md)

> 任务标识：`2026-09-09-portfolio-pnl-metrics`  
> 状态：代码实现完成，3/3 完成  
> 当前阶段：最终一致性 Review 已完成；真实 Server/浏览器/外部 FX 运行时验收边界已记录

## 执行约束

- 只修改组合估值契约、Trade 已实现收益聚合、组合概览展示和必要测试；不新增交易系统重构或 Prisma migration。
- 已实现盈亏只能消费有效 Trade Projection 的 Close Slice；成本/费用/FX 不完整时保留不可用状态。
- `dailyChange` 的上一交易日持仓收益语义必须保持；不得在 Desktop 复制收益计算。
- 保留工作区已有未提交修改，不清理、回滚、提交或重写无关文件。
- 每个任务只有在实现和对应验证均完成后才能勾选；验证证据写在任务项下。

## 任务依赖与跨任务契约

| 任务 | 依赖 | 产出契约 |
| --- | --- | --- |
| T1 | 无 | Trade Close Slice 已实现聚合、组合收益字段和 `/portfolio/valuation` Schema |
| T2 | T1 | Desktop Portfolio 类型映射、四宫格和持仓列表语义 |
| T3 | T1、T2 | 定向测试、包级验证和最终一致性 Review |

## 实施任务

- [x] T1：补齐 Server 组合级收益 read model 与 API 契约
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC7、AC8。
  - 依赖：无。
  - 涉及范围：`TradeQueryService`、`PortfolioService`、`packages/schemas`、必要的 API/Server 测试。
  - 完成条件：
    - 按组合账户范围和模式读取 Trade Close Slice，聚合已确认净实现盈亏与已卖出成本基础；
    - 支持无卖出、部分卖出、全部卖出和多次卖出；未知成本、费用币种不匹配或 FX 缺失不降级为 0；
    - 新增未实现/已实现/累计金额与收益率字段，沿用现有 FX 和 `dailyChange` 口径；保留旧 `totalPnl` 兼容字段；
    - 不修改 Prisma schema 或历史 migration。
  - 验证方式：Server portfolio/Trade 定向测试、Schema/API contract test、Server typecheck。
  - 验证证据：`trade-realized-pnl.test.ts` 5 个场景通过；`services.test.ts` 13 个组合服务测试通过；Server 全量测试 59 个文件、464 个测试通过；Server typecheck/build 通过；Schema/API contract、API client 和 Mobile fixture 契约测试及 typecheck/build 通过。实现使用 `TradeQueryService` 读取实际 Trade Close Slice，保留旧 `totalPnl`，新增 `unrealizedPnl`、`realizedPnl`、`cumulativePnl` 及对应收益率字段；未修改 Prisma schema 或 migration。

- [x] T2：调整 Desktop 组合概览与持仓列表语义
  - 覆盖验收标准：AC1、AC2、AC3、AC6、AC7。
  - 依赖：T1。
  - 涉及范围：`PortfolioOverview.tsx`、Portfolio 类型/API 映射、Desktop portfolio UI test。
  - 完成条件：
    - 保持 2×2 布局，移除最大持仓，展示总资产、今日收益、累计盈亏、已实现盈亏；
    - 今日收益展示金额和收益率，累计盈亏使用新的累计字段，已实现盈亏使用新的真实字段；
    - 持仓列表“累计收益”改为“未实现盈亏”，其数值仍为当前持仓 `pnl/pnlRatio`；
    - 保持现有颜色、排版、排序和交互。
  - 验证方式：Desktop 静态渲染/UI contract test、Desktop typecheck/build。
  - 验证证据：Desktop portfolio UI test 3 个测试通过；Desktop 全量测试 30 个文件、212 个测试通过；Desktop typecheck/build 通过。四宫格已改为总资产、今日收益、累计盈亏、已实现盈亏并移除最大持仓，持仓列表列名改为“未实现盈亏”；本次改动相关 ESLint 和 Prettier 检查通过。

- [x] T3：完成分层验证与最终一致性 Review
  - 覆盖验收标准：AC1–AC8。
  - 依赖：T1、T2。
  - 涉及范围：定向测试、Schema/API、Server/Desktop 包级检查、Spec/Task 一致性。
  - 完成条件：
    - 按“定向测试 → 包级 test/typecheck/build → 必要门禁”顺序执行；
    - 自行 Review BUY/SELL、部分卖出、全部卖出、无卖出、未知成本和多币种边界；
    - 记录当前工作区未提交状态，明确未执行的真实 Server/浏览器/外部 FX 验收边界；
    - 完成下方最终一致性 Review，不把未实现字段重命名为累计字段。
  - 验证方式：记录实际命令与结果，并检查 `git diff --check`。
  - 验证证据：按定向测试、包级测试与 build、门禁顺序完成验证。Schema 12 个文件/129 个测试、API client 10 个测试、Mobile 7 个测试通过；`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`git diff --check` 和相关 Prettier 检查通过。根级 `rtk pnpm eslint . --max-warnings=0` 未通过，但 16 个错误均位于本次未修改的 `RiskRuleWorkbench` 或 backtest 文件；本次改动文件的定向 ESLint 已通过。边界 Review 覆盖无卖出、部分卖出、全部卖出/多次 Close Slice、未知成本、费用币种不匹配及多币种 FX。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，保持未提交并记录状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：代码实现和分层验证完成，组合级累计盈亏没有复用旧未实现字段；任务范围内无 Blocking 问题。
- 发现的问题：根级 ESLint 仍受当前工作区其他未修改 backtest/RiskRuleWorkbench 文件的 16 个错误阻塞；未将该问题混入本次改动。
- 遗留风险：尚未启动真实 Server、浏览器和外部 FX 数据源做运行时验收；本地旧 Server 可能无法立即提供新增字段，需重启/重建后再验收。无卖出时已实现盈亏返回真实 0；成本、费用币种或 FX 不完整时已实现与累计结果保持不可用。
- 验证命令与结果：Server 59 文件/464 测试、Desktop 30 文件/212 测试、Schema 12 文件/129 测试、API client 10 测试、Mobile 7 测试均通过；相关 typecheck/build、定向 ESLint、Prettier、边界检查和 `git diff --check` 通过；根级 ESLint 的 16 个非本次文件错误已单独记录。
