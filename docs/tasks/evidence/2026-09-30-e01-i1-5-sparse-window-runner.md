# E01-I1.5 稀疏行情冻结与 Runner 消费

日期：2026-09-30。范围：共享合同、DSA 来源运行时、Server 准备/冻结、Domain、离线 Runner 与隔离 PostgreSQL/Redis/生产 Worker；目标部署与真实 Provider 业务验收由 I1.6 跟踪。

## 实施结果

- 固定来源 CN 日线回测显式请求 `tradabilityMode=assume-untradable-no-bar`。实际价格保持稀疏；默认市场行情仍要求完整窗口。成功但全部缺日的来源可以提供状态分区，执行范围无实际 Bar 时拒绝创建完整回测。
- 行情返回 `historicalTradabilityWindows`，保留每个来源窗口的原始响应 SHA-256、分页完成状态、来源修订、真实采集时间及独立日历/上市事实。验证状态分区并集、重叠一致性、实际 Bar 日期、正量价与请求模式相关性；多窗口价格交集兼容性继续检查。
- Server 从同次执行行情取得日级证据；`instrument-facts?identityOnly=true` 仅取得静态身份事实。原始身份响应与组合后的依赖响应分别冻结，重放从原始身份响应和冻结行情证据重新组成同一合同，防止两次采集的行情分区不一致。
- 冻结窗口指纹区分显式缺日模式，子窗口裁剪已有状态而保留原来源摘要。依赖证明的可空 `sourceResponse` 列保持 Parquet 行规范一致。
- Runner 从冻结证券事实验证交易/缺日分区，只在实际 Bar 上决策和成交；缺日订单延至下一根实际 Bar，估值保持独立交易日历并沿用上一条可用价格。来源价格的原时间保持不变，末日缺日不延长执行截止日期，预热只计实际 Bar。
- 基准缺日估值沿用已可用的原价格；首日缺日从首个实际价格开始，无法对齐或未来可用价格仍不可用。成本等既有基准资格继续独立核验。

## 验证结果

| 层级 | 命令或入口 | 结果与输入范围 |
| --- | --- | --- |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-multi-window-snapshot.test.ts test/backtest/v3-sparse-market-contract.test.ts test/backtest/v3-sparse-tradability-runner.test.ts test/backtest/v3-sparse-benchmark.test.ts test/backtest/backtest-run-preparation.test.ts` | 25 项通过；随后新增稀疏准备案例，准备文件单独 15/15 通过。合同负例、来源摘要裁剪、首/中/尾缺日、实际预热不足、执行范围全缺日、跨缺日成交和离线结果一致 |
| 基准回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-runner.test.ts test/backtest/v3-sparse-benchmark.test.ts` | 8/8；保留既有成本披露与取消/到期行为 |
| Domain 包级 | `pnpm --filter @thesis-ledger/domain exec vitest run` | 318/318，包含 5 项日级分区/实际 Bar 一致性测试 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas exec vitest run` | 555/555；新增稀疏合同组合负例另由 Server 定向运行共享 schema |
| Server 包级 | `pnpm --filter @thesis-ledger/server exec vitest run` | 227 文件、1726 测试通过；25 文件、83 测试因未配置对应外部环境跳过，跳过项不是验收通过 |
| DSA 定向 | `.venv/bin/python -m pytest tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_daily_tradability.py tests/test_thesis_ledger_hithink_credential_admission_runtime.py tests/test_thesis_ledger_v2_dependencies.py tests/test_thesis_ledger_identity_only.py -q` | 62/62；通过真实准入调度与来源适配器的固定响应输入测试稀疏/全空 wire 响应、身份读取不重复采集。外部 HiThink HTTP 为测试输入，未调用真实账号；缓存写权限警告不影响结果 |
| 类型与构建 | Schemas、Domain、Server `typecheck`；Schemas、Server `build` | 通过；Domain 本轮新增导出已构建 |
| 边界与局部检查 | `node scripts/check-boundaries.mjs`；修改的合同/helper、冻结编排、Reader、Runner 执行 ESLint；新 helper 复杂度 20 | 通过；多窗口存量校验函数复杂度 33 为既有债务，本轮新验证提取为独立 helper；未放宽阈值 |
| 隔离 Worker | `BACKTEST_WORKER_TEST_DATABASE_URL=postgresql://<隔离用户>:<测试密码>@127.0.0.1:<临时端口>/backtest_worker_fixture BACKTEST_WORKER_TEST_REDIS_URL=redis://127.0.0.1:<临时端口>/0 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-worker-runtime.integration.test.ts` | 1/1 集成场景通过：HTTP 创建、真实 BullMQ 投递与生产 Worker 进程、普通/多窗口/缺日数据库成功终态、损坏快照失败终态、缺日无成交与三日日历估值、离线校验和相同、账户/账本哨兵不变 |

隔离 PostgreSQL 使用本机已有 `postgres:17-alpine`，Redis 使用 `redis:7-alpine`；随机容器名、loopback 随机端口、内存目录，无业务 volume。数据库通过项目完整结构发现/生成入口及 infra 应用角色 SQL 初始化，24 项 migration，head 为 `20260930100000_rebase_legacy_market_policy`。测试后临时容器停止并自动删除。DSA HTTP 夹具的采集时钟固定在模拟五月场景内，生产 Worker 的 DSA URL 指向不可连接端口，终态和重放只能消费冻结输入。

验收过程中修正了旧多窗口夹具未带显式模式、夹具真实当前采集时间晚于历史截点，以及离线测试误用旧 Runner 版本的问题；修正后对应定向与隔离场景通过。未放宽生产截点校验。

## 后续顺序与边界

I1.5.1–I1.5.4 完成。下一项为 **I1.6**：使用官方 infra 更新入口部署同源 Server/Worker/DSA，验证真实 HiThink 准备→创建→Worker 终态、缺路由/撤销负例与客户端业务结果。当前采集的缺日假设仍不授予历史 PIT 资格；本次没有更新目标容器，也没有将测试输入作为真实 Provider 业务验收。
