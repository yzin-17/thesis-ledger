# 保留数据升级实施任务

对应 [规格](../../specs/2026-09-27-preserve-data-database-upgrade.md)，用于解除多源复权回测 G-Deploy 的结构阻塞。P1–P6 全部完成，2026-10-01 归档；历史阶段记录按其日期保留。

- [x] P1 只读计划：已知 head、严格增量、目标身份及全部源码摘要。12 项计划测试和 11 项既有结构测试通过，当前源码从已知部署 head 到新 head 为 4 个增量。Server typecheck 与定向 lint 通过；不代表目标结构已复核或可执行。
- [x] P2 备份与隔离副本演练：真实目标备份恢复、结构/权限与静止副本旧数据摘要验证通过，生成绑定计划的演练证据。
  - [x] P2-a 演练记录校验：绑定目标、应用角色、计划、权限脚本、备份摘要/大小和消费者停止批次；检查恢复源 head、升级目标 head、结构/角色权限/数据保留结果及时间顺序。9 项测试、typecheck/lint 通过。拒绝更换角色或以 owner 作为应用角色；字段校验不替代真实备份恢复。
  - [x] P2-b 真实备份、恢复和演练执行器；由受信执行流程产生记录，实际目标演练通过。
    - [x] P2-b-backup：真实 pg_dump custom 流式备份，实际数据库/owner 预检，0600 独占 partial 文件、落盘同步、原子发布且不覆盖；返回大小/摘要与开始结束时间。隔离 PostgreSQL dump→restore 验证成功，恢复中文数据、摘要、权限与禁止覆盖均通过；Server typecheck/lint 通过。
    - [x] P2-b-restore：在官方执行流程创建隔离副本，验证备份后恢复、升级、数据与权限，产生可信演练记录；实际业务库 3,119,701 字节备份已恢复验证。
      - [x] 恢复函数：拒绝源容器，核对本次隔离标签/无网络/运行状态、库与 owner/空用户表，恢复前及传输中验证摘要/大小，pg_restore 使用单事务且不清理既有对象。双隔离容器真实备份恢复及拒绝场景通过，typecheck/lint 通过。
      - [x] 创建/清理隔离容器、恢复后升级与业务数据核对的自动编排：使用源镜像 ID、新容器与隔离标签，禁用网络并限制资源；TCP 就绪后恢复，检查源 head、旧数据摘要，执行增量与实际权限脚本，复核目标 head、逐项角色权限及数据后生成绑定记录，finally 清理本次容器。真实备份端到端测试通过，源库 head 保持不变；尚未接入官方更新入口。
      - [x] 应用权限核验：每表逐项检查 SELECT/INSERT/UPDATE/DELETE，SchemaVersion 仅 SELECT，LedgerEvent 仅 SELECT/INSERT；验证序列权限、schema USAGE/禁止 CREATE、数据库 CONNECT 及角色属性。实际 bootstrap 脚本通过；撤销 INSERT、误授 SchemaVersion UPDATE、提升 CREATEDB 均拒绝。
      - [x] 既有数据摘要：在静止隔离副本枚举旧表/旧列，对排序后的逐行 SHA256 流计算表摘要及行数；升级后按原列重算。SchemaVersion 单独核对，新增列不误报，旧字段修改拒绝。真实四项增量的全部旧表摘要一致，故障/回滚集成 3 项通过；typecheck/lint 通过。
- [x] P3 事务执行：目标、旧 head、源码复核，增量与权限初始化，失败回滚且保持消费者停止；实际目标增量事务成功。
  - [x] P3-a 事务 SQL 生成器：复核计划/权限脚本摘要，精确目标、advisory lock、旧 head 锁定，增量和权限/结构检查成功后才更新 marker；14 项计划/生成器测试通过。
  - [x] P3-b 隔离 PostgreSQL 17：实际源码四项增量成功，旧数据保留、新表应用角色 INSERT 权限通过；旧 head 重复执行拒绝，权限阶段故障使 DDL、数据及 marker 一并回滚。3 项集成测试通过；Server typecheck 和 lint 通过。
  - [x] P3-c 绑定真实备份恢复演练证据并接入执行入口：准备命令校验消费者停止、镜像/本地迁移输入一致、演练后源码和源 head 未变化；仅本次演练成功才生成受限权限的事务 SQL。SQL 内再次核对应用角色和逐项权限，失败回滚。真实准备命令集成通过，目标执行仍属 P5。
- [x] P4 官方更新入口：`DEV_DATABASE_MODE=upgrade` 显式升级，默认只检查；精确 `DEV_DATABASE_CONFIRM=项目名/数据库名`，停止 Server/Worker 后进入备份/演练，失败保持停止。备份与记录保留在 `.database-upgrades/` 独立目录并忽略 Git，执行日志只保存成功/失败，不保存可能含凭据的 SQL 错误。生命周期与现有 Compose 合同测试通过；真实目标部署由 P5 验收。
- [x] P5 本次数据库升级目标验收：Server/Worker/DSA 健康、API、结构/权限与数据保留证据已核对。只解除 G-Deploy 的数据库升级阻塞；主任务完整 G-Deploy 的其他依赖和真实业务运行验收仍按主 Task 判断。

本任务不授权清库；无备份及演练证据时不得执行目标升级。

## 2026-10-01 增量归档对账修复

- [x] P6-a 校验状态：由本次待执行迁移选择归档映射，保留全量旧列摘要守卫；验证不同起点及空增量。映射/计划/演练记录共 24 项通过，类型与 lint 通过。
- [x] P6-b 隔离执行：构造已完成归档、当前 Policy 非空的 PostgreSQL 副本，真实备份恢复后仅升级 NAV 准备表，核对全部旧数据、角色权限与源 head 不变。真实 PostgreSQL 7 项通过（新增场景 11.8 秒），测试容器已清理，日志 `/private/tmp/n4-nav-upgrade-postgres-final.log`。
- [x] P6-c 目标验收：官方入口保留数据升级成功，核对目标结构及已有策略/任务身份，再继续 N4 业务验收。目标 head `20261001100000_nav_backtest_preparation`、71 张表；原有 Strategy 10 条和 BacktestJob 37 条的数量及排序 ID 摘要与升级前一致。Server/Worker/DSA 健康，HTTP 健康检查 200；备份及完整演练记录保留于 `.database-upgrades/run.eXosbN/`，详见 [N4 目标记录](../../tasks/evidence/2026-10-01-n4-nav-target.md)。

写集为 `database-upgrade-data-witness.ts`、`database-upgrade-run-rehearsal.ts`、专属映射测试与既有 PostgreSQL 集成测试；不修改历史 migration 或目标业务数据。首次目标失败保留在 infra `.database-upgrades/run.BSpyKk/`，未执行源库事务，消费者保持停止。

## 2026-09-27 自动演练验证

- 命令：`DATABASE_UPGRADE_TEST_CONTAINER=tl-upgrade-transaction-check-20260927 pnpm --filter @thesis-ledger/server exec vitest run test/platform/database-upgrade-postgres.integration.test.ts test/platform/database-upgrade-rehearsal.test.ts`；14 项通过（5 项真实 PostgreSQL 集成、9 项记录校验）。输入为当前四项增量、真实权限脚本及演练相关模块。
- `pnpm --filter @thesis-ledger/server typecheck` 与本轮修改文件定向 ESLint 通过。
- 目标业务库尚未备份或升级。P2/P3/P4 父项保持未完成，接下来接入官方执行入口的消费者停止、备份批次和演练结果复核。

## 2026-09-27 官方入口接入验证

- 定向测试：四个升级测试文件共 29 项通过，包含 6 项真实 PostgreSQL 集成。新增实际 CLI 准备测试：拒绝运行中的消费者，生成本次演练记录和 SQL，源库 head 不变。
- Server typecheck、build、定向 ESLint、依赖边界通过；infra `preserve-database.test.sh`、`compose-contract.test.sh`、Shell 语法及 diff check 通过。
- runtime 打包门禁增加编译后的升级结构导出入口验证，检查导出的 head 和全部 migration 名单。
- 真实目标只读复核为库/owner `thesis_ledger`，head `20260922100000_ai_provider_test_facts`；未执行清库或手工 marker 修改。
- 官方执行命令：`DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger REPAIR_BUILD_CACHE_ON_NO_SPACE=false ./scripts/update.sh all`。需等待本次构建、真实备份演练、事务和 Server/Worker/DSA 健康检查结果，才能勾选 P5。

## 2026-09-27 真实目标升级结果

- 首次官方更新因沙箱禁止写入 Docker Buildx activity 目录，在构建前失败；权限流程获准后重试同一入口成功，退出码 0。未执行清库、删除 volume 或手工 marker 更新。
- 持久证据目录：`../thesis-ledger-infra/.database-upgrades/run.YKDSZk/`，包含 0600 的 `backup.dump`、`rehearsal.json`、`upgrade.sql` 和脱敏执行结果；备份 3,119,701 字节，SHA256 为 `f9f79221b144134c91fb8400872abd5a218381e64034418b0bf47d4ffef4ee08`。实际应用角色 `thesis_ledger_app`。
- 官方流程先恢复真实备份并完成四项增量演练，再提交目标事务和完整结构检查。目标 head 为 `20260927090000_market_derived_series_snapshot`，public 业务表 68 张。
- Server、全部 Worker、DSA、Redis 均 healthy。`GET /api/v1/health` 返回 200/healthy，database/redis/dsa 依赖均 healthy，API schemaVersion 与源码一致。三个应用容器本次启动日志中无缺表、Nest 依赖或入口模块缺失错误。
- V3 官方协议检查在提供目标 origin 和容器实际 Control Token 后通过：Data/Control V3、真实目录及非法凭据拒绝均通过；未调用行情 Provider 或创建回测/AI 任务。
- 重新从备份建立独立副本，比对 65 张旧表的旧列：58 张全量摘要一致。7 张在线自动化/目录/健康状态表已出现变化，全表值一致检查未通过；另行逐一校验这些表的旧主键，缺失均为 0。该结果证明旧记录仍在，不把运行后的可变字段宣称为完全未变。日志：`/private/tmp/goal-upgrade-live-data-20260927-retry2.log`。
- 升级日志：`/private/tmp/goal-preserve-upgrade-all-20260927-retry.log`。所有本轮隔离演练容器均已清理，备份保留。主目标继续推进 G-Run/G-UI/G-AI 及其他未完成项；本次结果不等于正式发布升级流程或全功能验收完成。
