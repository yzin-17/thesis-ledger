# 现行 Run 持久化模式与原子条件接线证据

> 日期：2026-09-29；对应 C02-b，源码、包级与隔离 PostgreSQL 验证完成；实际 Worker 集成门禁未通过，目标运行态尚未验收。

## 改动

- 现行 `BacktestV3RunLifecycle` 创建成功和不可用终态均写 `mode='V3'`；合同判断只在模式与输入版本同时匹配时认可 V3。旧模式携带 V3 输入不再被认作当前 Run。
- 执行尝试的领取、成功、失败、重排与取消 CAS 使用被领取 Job 的持久化 `mode`，维持原状态与 attempt 条件。Server/Worker 分派、冻结快照检查、取消、重试、队列恢复和重试预算读取同步识别当前模式。
- API Client 以当前响应 Schema 解析创建、读取、取消与重试结果；旧 `mode='V2'` 响应被拒绝。V3 响应 Schema 与 Server 实际返回的持久化 Job 字段对齐，不要求不存在的顶层 `contractVersion` 与 `snapshotVersion`。
- 未知合同在执行尝试前拒绝，保持持久化记录不变；没有凭输入版本自动把旧记录升级为当前模式。

## 验证

- 构建 `@thesis-ledger/schemas` 后运行 Schema 包级测试：46 文件、568 项通过。
- Server 定向创建/执行/冻结比较/配置解析及旧 V2 尝试共多组通过；最终 Server 包级测试：232 文件、1822 项通过，25 文件、91 项跳过。
- API Client 包级测试：6 文件、36 项通过，含旧模式响应拒绝；Server、Schemas、API Client 与 Desktop typecheck 通过。Schemas、API Client 和 Server build 通过。
- `node scripts/check-boundaries.mjs`：`Import boundaries: OK`。改动代码 `git diff --check` 通过。
- API Client 现存 Market 图表方法和测试中的旧排版使整文件 Prettier 检查仍报警；本叶未做无关整文件格式化。Server 改动文件及本叶新增片段已按当前格式处理。
- 专属临时 PostgreSQL 17 建立 `backtest_v3_fixture`，按目录顺序成功应用 20 项 migration；`BACKTEST_V3_TEST_DATABASE_URL` 定向真实 Prisma 测试 3/3 通过，覆盖创建至终态、并发领取与失败重试。隔离账户/账本哨兵保持不变。临时容器已停止并自动删除。
- 另建 `backtest_worker_fixture` 和隔离 Redis，运行实际 Worker 进程测试。首次创建返回 `DATA_UNAVAILABLE` / `FUTURE_DATA`：窗口证据实际 `fetchedAt` 晚于测试 `dataAsOf`。一次重试仍在创建阶段失败；复用库中的既有证据使该重试不能证明测试时间修复。测试期间未放宽产品 PIT 门禁，试验性测试时间改动已撤回，临时 PostgreSQL/Redis 容器均已停止并自动删除。按本任务“重试一次仍失败则记录并跳过”的规则，本门禁记为 `skipped_after_retry`。

## 尚未满足的门禁

- 实际 Worker 进程测试未通过，因此不能声称 BullMQ→Worker→终态闭环；上面的 Prisma 测试使用明确的队列投递替身。
- 目标 Docker 尚未更新本轮代码；Server/Worker/DSA 同源、鉴权 HTTP、Desktop 真实交互及旧记录读取拒绝仍未验收。运行态检查时目标应用容器未运行。
- V2 旧 Runner、旧 `jobs` 创建/执行、旧 Snapshot、Market、Ledger 与 DSA 旧路由尚可达。C02-b、C02-c、C02-d 和总体替换均保持未勾选。
