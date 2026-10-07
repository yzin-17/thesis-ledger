# E01-N1.3 NAV Domain 输入适配

## 范围与结论

2026-09-30 完成现行冻结 NAV 到申赎内核的输入适配。适配器复核冻结 Manifest 和上下文，不生成旧 Snapshot 或 OHLC；尚未接通创建入口、真实 Provider、Worker 或策略事件编排。

## 变更

- `apps/server/src/backtest/backtest-nav-domain-input.ts`：映射基金身份、CNY 现金、净值、发生/可见时刻、来源 Provider 与修订；保留完整 NAV 模型、分段、费用和日期延迟，不提供模型缺失降级。十进制字符串不经过浮点转换。
- `apps/server/src/backtest/backtest-nav-domain-calendar.ts`：处理日期来自独立冻结日历，非处理日跳过、超出覆盖立即拒绝；日历未声明交易时段，时段查询明确拒绝。
- `apps/server/test/backtest/backtest-nav-domain-input.test.ts`：使用真实 Parquet 冻结读回后适配，验证输入副本、微秒可见性、身份/现金/模型/摘要拒绝及既有内核消费。

`pricingFactAt` 同时核验事实 occurredAt、availableAt、评估时刻和 dataAsOf；缺记录、无效时间及不可见记录返回不可用。预热事实保留给信号计算，交易授权仍由 N3 的执行日期控制。

## 经济核验

受控费用模型规定本金之外另收 1% 申购费，赎回费按费前回款收取 1%，CNY 两位小数 half-up。按显式事件调用既有 CnNavSimulation：

- 初始现金 10000 元，申请本金 100 元、NAV 1.25，确认 80 份，申购费 1 元，总扣款 101 元。
- 10 份赎回的费前金额 12.50 元，费用 0.13 元，净回款 12.37 元。
- 最终持仓 70 份、已结算现金 9911.37 元；确认、可卖和赎回资金日期使用冻结处理日历。

此处事件由测试明确提供，只证明输入映射与既有经济内核消费；完整信号到申请的编排、期末待处理状态及结果合同由 N3 验收。

## 验证

| 检查 | 输入/命令 | 结果 |
| --- | --- | --- |
| NAV 定向 | Server 的 Domain 输入、冻结读写和依赖计划三个测试文件 | 51/51 通过：11 + 24 + 16 |
| 最终适配器定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-domain-input.test.ts` | 11/11 通过；类型映射修复后执行 |
| 既有 Domain 回归 | `pnpm --filter @thesis-ledger/domain exec vitest run test/nav-simulation.test.ts` | 9/9 通过；Domain 源码未修改 |
| Server 类型/构建 | `pnpm --filter @thesis-ledger/server typecheck`、`build` | 通过 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 1777 通过、83 跳过；230 个测试文件通过、25 个跳过 |
| 样式 | 本叶三个文件 ESLint、Prettier check | 通过 |
| 模块边界 | `node scripts/check-boundaries.mjs` | 通过；继续保持 Server Backtest 单向消费 Domain，现有门禁覆盖，未新增依赖方向 |

## 后续验收边界

来源和日历为受控数据，未宣称真实 Provider 历史发布时间/PIT 合格。N2 负责真实准备与持久化创建；N3 必须调用可见性查询后编排事件，执行窗口限制和期末处理保持独立验收；N4 负责目标运行态与客户端。

既有 `expectedCutoffSchedule` 在等于截止时间时按当日处理，而冻结 NAV 模型声明 `atOrAfterNextTradingDay`。本叶映射完整保留该声明，经济核验使用截止前申请；N3 接通执行前须修复并验证等于截止时间的边界，不能据本叶通过认定该事件编排语义已验收。
