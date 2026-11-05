# E01-I1.4 Server 日级证据核验与冻结

日期：2026-09-30。范围：本地 Server、共享合同、文件 Snapshot 与隔离 PostgreSQL；目标运行态由 I1.6 验收。

## 实施结果

- 证券事实请求绑定实际选中的日线口径、Provider、上游来源及来源索引；预检复用同一次已验证行情读取，冻结使用选中响应，离线重放从冻结行情证据重建。
- 核对日级证据的标的、窗口、口径、来源、日历/上市事实来源及修订、可见时间、实际 Bar 日期和 `tradable` 汇总。独立冻结日历必须与预期会话一致，缺 Bar 日保持开市日身份。
- 完整日级证据写入证券事实行的 `historicalTradability` 规范 JSON；完整请求/响应、事实及行指纹继续保存在依赖元数据中。来源原始响应摘要与行情完整响应摘要分别冻结。
- 缺证据、来源/日期不符、未知修订、未来事实、篡改及来源撤销拒绝；当前采集证据不能用于严格 PIT。既有缺日证据可验证全日不可交易汇总，但当前完整行情读取/执行链尚未支持全空窗口。

## 验证

| 层级 | 命令或入口 | 结果 |
| --- | --- | --- |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-snapshot-v3-tradability.test.ts test/backtest/backtest-preflight-v3-dependencies.test.ts test/backtest/v3-complete-snapshot.test.ts` | 28/28；包含 15 项新增来源绑定、缺日、全空汇总、篡改、日历及撤销验证 |
| 请求与兼容回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/integration/dsa-instrument-facts-source-v3.test.ts test/backtest/v3-legacy-calendar-replay.test.ts test/backtest/backtest-run-preflight.test.ts` | 10/10 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test` | 555/555 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 224 文件通过、25 跳过；1715 测试通过、83 跳过。未设置外部运行时环境的测试未视为验收通过 |
| 静态与构建 | Schemas `typecheck/build`、Server `typecheck/build` | 通过 |
| 导入与局部门禁 | `node scripts/check-boundaries.mjs`；修改的核验/编排 helper 执行 ESLint 复杂度 20、函数有效长度 220；局部 `git diff --check` | 通过；未改动既有超限执行预检函数 |
| 隔离 PostgreSQL | `BACKTEST_V3_TEST_DATABASE_URL=postgresql://<隔离用户>:<测试密码>@127.0.0.1:<临时端口>/backtest_v3_fixture pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-postgres-isolation.integration.test.ts` | 3/3；持久化创建/终态、并发领取、断网后仅重放冻结输入；账户/账本哨兵不变 |

隔离数据库使用本机已有 PostgreSQL 17 镜像、随机命名临时容器、内存数据目录及 loopback 随机端口；未挂载业务 volume。通过项目 `discoverDatabaseStructure`、`buildDatabaseRebuildSql` 和 infra `bootstrap-app-role.sql` 初始化专属 `backtest_v3_fixture`，同时核对数据库/owner、完整表清单与 head。24 项 migration 的结构 head 为 `20260930100000_rebase_legacy_market_policy`；临时容器完成后停止并自动删除。首次直接逐项执行 migration 时发现 marker 仍为 baseline，随后使用项目完整结构生成入口完成初始化，未将该首次检查当成成功。

## 后续顺序

1. I1.5：行情稀疏窗口接线与 Runner 消费；覆盖预热、交易日历、估值和冻结重放。
2. I1.6：通过官方 infra 更新入口部署 Server/Worker/DSA，再验证真实来源、目标 Run 终态、撤销/缺路由负例与客户端。

本次未更新目标容器，未调用真实 HiThink，未完成缺日经济结果或客户端业务验收；这些门禁保持未勾选。
