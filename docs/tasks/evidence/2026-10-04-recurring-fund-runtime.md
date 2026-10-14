# 基金定投运行时验收证据

- 日期：2026-10-04，Asia/Shanghai。
- 范围：原建议顺序第三项，原基金定投任务 T2.R1、T2.R2、T2.R3。
- 结论：创建、Scheduler 到期物化、确认成交、计划管理、跳过/恢复及账户入口隔离已验收，原 T2 可关闭。
- 权威需求：[基金定投 Spec](../../specs/2026-09-08-recurring-fund-investment.md)。
- 完成任务：[原基金定投任务](../../archive/tasks/2026-09-08-recurring-fund-investment.md)。

## 发现与修复

真实 PostgreSQL 验收发现首次日期精度买入返回 500：自动创建的初始成本策略使用完整时间戳，开仓边界使用日期字符串；字符串比较把同日零点策略误判为尚未生效。

Domain 现在按解析后的实际时间排序和比较策略。日期与同日零点等时，未来策略仍拒绝；不同 UTC offset 按实际时间排序。未改变 Ledger 事实结构、基金调度或费用算法。独立修复的 [Spec](../../specs/2026-10-04-ledger-date-cost-boundary.md) 与[完成任务](../../archive/tasks/2026-10-04-ledger-date-cost-boundary.md)记录该边界。

## 验收标准与证据

| 标准 | 已完成证据 |
| --- | --- |
| AC1：账户和资产约束 | 隔离 PostgreSQL 的生产 HTTP 拒绝证券、现金、模拟、停用账户及未确认/非基金资产；确认时重新检查账户与资产 |
| AC2：唯一待确认、漏期补齐 | 生产 Scheduler/Automation 与全部真实迁移验证一月、二月末、三月补期和重复运行；目标 Scheduler 真实轮询补齐九月、十月；物化后 Ledger 为零 |
| AC3：确认恰好一次且成交页可见 | 真实 HTTP 并发确认与重放仅一个 envelopeVersion=3 买入事实；目标浏览器确认后显示 100 份、1.25 CNY、2026-10-03；API 重放仍为同一事件 |
| AC4：计划及发生记录生命周期 | 数据库验证历史字段冻结、版本冲突、暂停月份不补齐、恢复从当前到期日起继续、结束不物化；浏览器完成编辑、暂停、恢复、结束、跳过、恢复及确认 |
| AC5：账户入口隔离 | Browser 在真实基金账户显示完整区域，证券账户无区域；Desktop 渲染回归同时验证证券、现金、模拟基金和停用基金无入口 |
| AC6：现有功能兼容 | 当前 Ledger、定期现金、Automation 共 138 项定向回归通过；账户/现金 Desktop 35 项通过；原目标验收账户未修改 |

## 隔离 PostgreSQL

执行入口：`node scripts/test-fund-investment-postgres.mjs`。使用本次新建的 `postgres:17-alpine` 容器、tmpfs、随机本机端口，数据库 `fund_investment_fixture`，owner `fixture_owner`；连接前与测试启动时均核对数据库身份。按目录排序执行全部 26 项 migration，head 为 `20261001120000_require_explicit_strategy_contract`。

两个测试文件共 13 项全部通过，使用生产定投 Controller/Service、Ledger Repository/Command/Query、Automation Handler/Service/Scheduler。存储、事务、调度租约与乐观版本均由真实 PostgreSQL 执行。

竞争回滚场景先持有账户数据库行锁，再发起确认；确认阻塞后跳过获胜。释放锁后确认返回 `409 / FUND_INVESTMENT_PLAN_VERSION_CONFLICT`，Ledger 事实、持仓、现金均为零，账户 Ledger Revision 和 Projection Generation 均保持零。正常并发确认只产生一个买入，数量 100，现金变化 -126（125 买入金额加 1 手续费），投影版本仅推进一次。

脚本已清理本次隔离容器，没有操作目标数据库、持久化卷或其他容器。CI 新增独立基金定投隔离 PostgreSQL 步骤；本机入口通过，远程 CI 未运行。

## 目标容器与浏览器

代码更新使用相邻 infra 的 `./scripts/sync-code.sh thesis-ledger`，兼容性预检、Server/workspace 构建、同步、重启及健康检查完成。Server 与 Backtest Worker 的镜像 ID 仍为 `sha256:f9738d362de75b1adf4de91160ac44c630a2243a27ea2054b268bc5a0db18811`。此证据只代表容器可写层更新，不代表新镜像或生产发布。

本机与目标容器中的 Domain `trade-costs.js` 产物 SHA256 均为 `11a7f6977b7a441d2c8526d912572e4d86bff5949841a75060d28ca19893cd73`，确认修复已进入目标实际消费代码。

- 目标 API：`http://127.0.0.1:3000`；健康状态 `healthy`，结构 head 与隔离环境一致。
- Browser：当前 Desktop 源码的 Vite 页面 `http://127.0.0.1:5176/accounts`，请求由 Vite 转发到目标 Server。
- 新建验收账户：`93337db7-a5a0-40c5-823f-63577e9e924b`，名称 `T2 基金定投验收（固定输入，非实际交易）`，真实基金账户模式仅用于功能验收。
- 目录内 `161725.OF` 通过现有确认接口建立 Asset 关联；未执行外部下单。
- Browser 创建计划 `dc104ed3-6437-454f-bef9-f2e34524ea86`，默认开始月份为 `2026-10`；物化、跳过、恢复、确认前均无 Ledger 事实。
- 确认发生记录 `98202874-abf3-470b-b1eb-88750ad996b5`：版本 4、100 份、1.25 CNY、手续费 1 CNY、日期 2026-10-03。
- Ledger 事件 `0d2ea85d-494f-463e-9241-ad6928ef3966`，事实 `80669a4f-e07b-4182-8f82-dbdd30428414`，envelopeVersion=3、Ledger Revision=1；重放返回同一事件。持仓 100 份，现金 -126，待付为零，初始成本策略 `AVG / 2026-10-03T00:00:00.000Z`。
- 计划经 Browser 编辑至 1200、暂停、恢复后结束。已确认发生记录仍冻结原计划金额 1000。

真实轮询使用第二个专用计划 `b9dc60d2-03ae-47cc-bf86-7a7f35e0af38`。固定任务临时设为每分钟运行，真实 Scheduler 在北京时间 01:03:05 执行，补齐 `2026-09`、`2026-10` 两期。运行 `5063f593-2d06-4fc8-9d90-6b02f730d7d7` 的数据库租约为 `trigger=scheduled`、`scheduledAt=2026-10-03T17:03:00.000Z`，终态 `succeeded`、executionAttempt=1。随后自动恢复 `0 9 * * * / Asia/Shanghai / enabled=true`，下次运行时间为北京时间 09:00。

两项验收计划均已结束，Scheduler 产生的两条待确认已跳过；该账户保留一笔固定输入买入和验收记录供复核，不是用户实际交易。原有两个 E03 验收账户未写入或修改。目标 Server 本轮日志未匹配到成本策略缺失、未处理异常或缺表错误。

浏览器截图：[验收完成画面](/tmp/2026-10-04-fund-investment-target.png)。未验证 Electron 或原生设备；原 Spec 的客户端门禁为 Desktop Browser，本次没有原生工程改动。未将外部基金平台成交、实时净值或真实费用验证作为本功能证据。

验收结束后已关闭本次临时 Browser 页和 `5176` Vite 进程；目标容器继续健康运行，截图和专用验收记录保留。

## 本机检查

| 命令或范围 | 最后结果 |
| --- | --- |
| Domain 定向成本测试 | 16 项通过，含新增 5 项日期/时间边界回归 |
| `pnpm --dir packages/domain test` | 39 文件、300 项通过 |
| `node scripts/test-fund-investment-postgres.mjs` | 2 文件、13 项通过，容器已清理 |
| Server `test/ledger`、基金定投、Automation、定期现金定向回归 | 20 文件、138 项通过；另 11 项既有 PostgreSQL 测试未在此命令启用，不算通过 |
| Desktop 账户基金定投/账户 UI/现金回归 | 3 文件、35 项通过 |
| Domain/Server typecheck，Domain/Server build，Desktop build | 通过；Desktop 包含既有 chunk 体积提示 |
| 本次 TS/TSX 定向 ESLint、Prettier、脚本语法检查 | 通过 |
| 模块边界、workspace 依赖图 | 通过，8 packages |
| 全仓 complexity lint | 8 组、1424 文件通过；存量警告保留 |
| 文件规模门禁，`GUARDRAIL_BASE_REF=HEAD` | 通过，10 项存量超限未增长 |
| `git diff --check`、本次文档相对链接检查 | 通过 |

全仓检查覆盖当前工作树，包括前两轮已有改动。未提交、未推送，没有重置、清理或覆盖已有工作。

## 手动继续顺序

本项已经完成。下一项按原建议顺序为第四项：组合快照与受管估值任务，先建立 `T3` 调度闭环，再验证组合估值走势 `T2` 的查询与客户端消费。继续时读取各自当前 Spec/Task，不把本次基金定投验收作为组合估值或真实 Provider 已验收的依据。
