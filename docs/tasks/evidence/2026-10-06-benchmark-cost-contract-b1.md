# B1：基准执行模型成本合同本地交付

> 日期：2026-10-06
> 对应任务：[B1实施记录](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md#benchmark-net-return-tasks)
> 结论：B1 本地合同通过；B2～B4 继续保留，当前目标基准净收益仍按既有不可用结果披露。

## 实施范围

用户要求从 B1 开始，按现有执行叶先交付成本合同。实施前主仓611条、DSA56条、infra49条未提交记录全部保留。已向获用户授权协调的“历史市场规则来源核验”说明共享文件与目标窗口归属；本次没有占用目标更新窗口。

Domain 的 `BacktestBenchmarkCostAssumption` 和同名 V3 Schema 增加 `{ kind: 'execution-model', version, fingerprint }`。版本非空，指纹沿用16位小写十六进制报告格式；旧 zero-cost／proportional／unsupported 及传输层 unavailable 合同保持。Schema 拒绝新身份中混入 commissionRate、paidFees 或 fills。

兼容比较继续使用确定性完整成本身份：相同计算版本和费则指纹可比较，成交次数和已付费用各自计算。最低额、收费方向、生效边界、包含关系、滑点、取整和计算版本变化的合同回归均覆盖。生产指纹生成及冻结规则解析属于 B2，B1 测试构造的规则输入仅用于验证身份合同。

仅有首末价格的旧快捷算法不能读取完整费则和资金，所以遇到新身份返回 `BENCHMARK_EXECUTION_MODEL_REQUIRED`。旧零成本、比例费用与明确不支持算法保持行为；Server 当前计算限制继续由 B2 修复。

## 实际变更

- `packages/domain/src/backtest-benchmark-compatibility.ts`：新增成本类型及快捷算法明确拒绝路径。
- `packages/schemas/src/backtest-result.ts`：新增严格传输合同，保留文件已有公共费用 WIP。
- `packages/domain/test/backtest-benchmark-compatibility.test.ts`：成本身份兼容、差异与旧算法回归。
- `packages/schemas/test/backtest-benchmark-cost-assumption.test.ts`：Domain与Schema类型／传输接缝、非法身份和旧合同回归。
- 当前 Spec／Task：合同细节、局部完成状态及 B2 依赖前沿。

## 验证

所有命令从主仓执行，并按RTK规则使用 `rtk proxy`；表内省略该共同前缀。

| 检查 | 输入与命令 | 结果 |
| --- | --- | --- |
| Domain定向 | `pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-benchmark-compatibility.test.ts` | 15项通过 |
| Schema定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-benchmark-cost-assumption.test.ts test/backtest-v2.test.ts` | 28项通过 |
| 包级回归 | 两包各自 `pnpm --filter <包名> test` | Domain43文件396项；Schema63文件712项通过 |
| 构建 | 顺序执行两包 `pnpm --filter <包名> build` | 均退出0 |
| 消费类型 | Server／Desktop／Mobile／API Client各自 `pnpm --filter <包名> typecheck` | 均退出0；Mobile仅类型检查，未涉及原生工程 |
| Server既有语义 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-benchmark.test.ts test/backtest/public-fees-model-v3.test.ts` | 15项通过；当前最低费基准仍按既有不支持结果返回 |
| 局部格式／Lint | 仅表述的4份代码与测试路径，`pnpm exec prettier --check`／`pnpm exec eslint` | 首次2份测试格式检查失败，局部修正后通过；Lint退出0 |
| 边界／尺寸 | `node scripts/check-boundaries.mjs`／`node scripts/check-file-size-guardrails.mjs` | 均退出0；尺寸门禁保留9项其他文件存量告警 |

## 稳定基线与后续

两份修改源码验证后的 SHA-256：

- Domain：`b577600b8848d2ed9b49c3cf8a3dc5f04b3887c009a83b45553f6191065ea6b1`，164行。
- Schema：`eee9f058fc29b31eac5053f4c822f8f7c6fbcf99164e45a78ff16e1778eff8db`，263行。

Server `backtest-v3-benchmark-cost.ts`／`backtest-v3-benchmark.ts` 与开始时一致，分别为 `5fb5608420e0ef01601b42cb0c5081e26d963f1472a6b97d6156d61b9b3ecbf0`／`8308b86b90b2970e3e4ece12aae21561c6a988a63721f2074a879889190ba1a3`。本次没有新建任务、写入Snapshot、修改结果或部署。

B2 下一步在现有冻结模型入口生成规则成本身份，复用现有逐笔费用与可负担数量计算；B3处理实际指标与说明；B4创建独立新结果、核对基准资金与费用、离线重放并验收页面。旧股票验收结果和partial保持原事实。

局部交付审查通过，整组AC6／AC7保持待验收；未归档或转移当前义务，未stage／commit／push。
