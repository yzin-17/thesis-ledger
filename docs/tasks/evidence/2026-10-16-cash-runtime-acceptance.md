# 现金资金、定期入账与自动化进程验收（2026-10-16～17）

对应[当前 Task](../2026-08-30-cash-account-funding-and-transfer.md)、[资金合同](../../specs/2026-08-30-cash-account-funding-and-transfer.md)及[定期入账合同](../../specs/2026-08-30-recurring-cash-deposit-plan.md)。

## 范围与运行态

- 使用本地 Web `127.0.0.1:5174`、目标 Server `3000` 和原 PostgreSQL；仅新增两份专用实际账户，原账户只读。
- 现金账户 `a3d195aa-ace2-48bb-8460-91c949666357`；证券账户 `e9d5c7d7-13ce-453e-aa5c-f1e67affcacb`。对象、版本和初始配置保存在 `.recovery-artifacts/recurring-cash-2026-10-16/owned-objects.json`。
- Server 修复经 infra `./scripts/sync-code.sh thesis-ledger` 兼容性预检、构建、同步及 Server/Worker 健康检查通过。日志为同目录 `official-sync-code.log`。这是可写层代码更新；镜像仍为 `2f4419bb…`，没有新镜像或数据库结构变更。
- 通知路由实际为空；没有新增渠道、凭据或外部通知，没有 AI 生成请求。

## 真实执行与客户端结果

| 场景 | 结果与边界 |
| --- | --- |
| 正常到期与补期 | 两计划分别从 10 月、8 月开始；通过既有固定任务的“立即运行”生成 1＋3 条实例，现金余额仍为零。补期结果明确列出 8、9、10 月，`notificationQueued=false`。这是手动 Handler 验收。 |
| 重复扫描 | 第二次手动运行返回 `planCount=0, results=[]`，四条实例没有重复；不据此宣称 Scheduler 正向触发或并发重启通过。 |
| 确认金额、日期和防重 | 10 月补期实例改为 `123.45`、当地 `2026-10-15 12:34`；快速双击仅一条 POST、HTTP 201，实际保存 `2026-10-15T04:34:00.000Z`，一条确认历史、余额 123.45。原始记录为 `confirm-request.json`。 |
| 错误恢复 | 受控 409 在浏览器拦截，未进入 Server。原实现因表单级 `FieldError` 缺少 `Field.Root` 整页崩溃；修复后错误留在 Sheet，金额与日期保留，清除拦截后同一表单成功。原崩溃图与修复图分别保存。 |
| 跳过与恢复 | 九月实例通过键盘跳过，余额不变；恢复后返回待确认。最后三条未入账实例全部跳过，保留原因和版本。 |
| 计划修改、启停 | 预期金额从 200 改为 250，已生成的八、九月实例仍冻结为 200；暂停、恢复和结束均成功。关闭新建草稿后重新打开，恢复默认名称和空金额。 |
| 双向划转 | 专用现金向专用证券划转 50，再更正为 40；证券向现金反向划转 10，双方余额一致变化。创建及更正为 999 时真实返回余额不足，输入保留，未产生单边事实。 |
| 修正链 | 更正原因缺失留在原 Sheet；真实服务端 409 也保留金额和原因。划转作废、恢复、再次作废均经产品入口完成，两端最终无有效划转。 |
| 未来资金 | 一次性入账 10 CNY，时间为 10-18 12:00，只进入待结算应收，当前余额仍为 123.45。回收时复现尚未生效入账被误当已结算扣减，按下节修复后目标命令成功作废。 |
| 宽窄屏、键盘与上下文 | 390×844 的 Sheet 宽度与滚动宽度均为 373，无横向溢出；确认错误仍可见。计划保存、确认、跳过、更正及关闭通过键盘操作；账户切换后原表单不带入其他账户，最后恢复原选中模拟账户。 |

## 修复及验证

1. `AccountDataRecurringCashDeposits` 和 `CashTransferCorrectionSheet` 的表单级错误改用现有 `Alert`，不改变共享 `FieldError` 的字段语义。实际挂载组件的三条回归先复现崩溃，再通过；增加划转本地/服务端失败及重试断言。
2. `transactionAmount` 为现金流显示方向、原始金额和币种；非空账本表格不再以“暂无其他账本事件”命名。金额测试先得到 `—` 而失败，修复后通过。
3. `CashLedgerCommandSupport` 对外部现金流按同一校验时点计算生效增量，复用 `cashEffectiveAt` 的 `settledAt ?? expectedAt ?? occurredAt`。未来入账修改/作废不扣当前现金，已被消费的入账不能移到未来。内部划转保留已结算余额约束。四条命令回归先失败后通过。

| 检查 | 结果 |
| --- | --- |
| Desktop 现金三个文件定向测试 | 35 项通过 |
| Server 现金命令、投影、计划、日期、Automation runtime | 5 文件、60 项通过 |
| Desktop 全量 `pnpm --filter @thesis-ledger/desktop test` | 141 文件、841 项通过 |
| Server 全量 `pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=4` | 368 文件、2892 项通过；47 文件、217 项按原条件跳过 |
| Server 首次默认并发全量 | 一条本机 HTTP/SSE 100ms 时序测试失败；该文件隔离 6 项通过，降低并发后的完整测试通过；未修改超时或测试门槛 |
| Server/Desktop typecheck、build、目标八个文件 ESLint | 通过；Desktop 仅既有 chunk size 提示 |
| Prettier、边界、依赖、文件尺寸、无障碍 | 通过；文件尺寸报告 9 项既有警告，未新增豁免或提高阈值 |

日志、截图、回执及只读最终核对脚本保存在 `.recovery-artifacts/recurring-cash-2026-10-16/`。主要截图：`confirm-error-preserved-wide.png`、`confirm-error-preserved-narrow.png`、`confirmed-narrow.png`、`frozen-occurrences-narrow.png`、`transfer-error-preserved-wide.png`、`future-cash-pending-wide.png`。

## 对象回收与仍未通过条件

- 两计划均 `ENDED`，四实例为一条 `CONFIRMED`、三条 `SKIPPED`，没有待确认。确认历史保留原实际金额/日期；其 Ledger 入账随后通过现行作废命令保留修正链。两份专用账户均停用，两端有效 Ledger 事件、已结算余额与待结算均归零，没有永久删除。
- `verify-final-state.mjs` 只读确认上述状态，并断言原现金扫描任务的 `cron=0 9 * * *`、enabled 和下次时间 `2026-10-17T01:00:00.000Z` 未变；两次手动运行历史保留。
- 原始数据保护脚本只按这两份精确账户 ID 排除新增行，七张原有业务表逐行摘要相同，原 54 份成功 V3 回测校验值相同，运行中回测为零。未覆盖的表不作完整备份声明。
- **10-16 当时开放：**真正 scheduled、进程补期/并发恢复及外部通知；前两类已由下述 10-17 独立进程补验接续，外部通知仍开放。正常目标扫描 cron 和通知配置未改，不使用此前手动结果关闭进程条件。
- 未提交、未推送；现有用户修改保留。

## 10-17 Scheduler 进程与现金补期恢复

新增可复用入口 [`scripts/automation-process-recovery-smoke.mjs`](../../../scripts/automation-process-recovery-smoke.mjs)；执行目录为主仓，命令 `rtk proxy node scripts/automation-process-recovery-smoke.mjs --output=.recovery-artifacts/automation-process-2026-10-17.json`，最终退出 0，UTC 时间 `2026-10-16T20:28:41.676Z`。

入口只读核对 Compose 项目 `thesis-ledger-dev`、Server 服务身份/健康及镜像 `sha256:1d91cb246e789a404b4b8738b2adc6efb00dd50606b645fba6ffe7624d76208a`；Scheduler、AutomationService、ExecutionStore、RuntimeHandlers 与现金计划/日期/通知构造共七份编译输入的 SHA-256 均与宿主构建一致。没有重建或替换容器。

数据库使用同网络的独立 `postgres:17-alpine` 容器，数据目录为 256MiB tmpfs，无命名/匿名持久卷；实际库 `automation_process_fixture`、owner `fixture_owner` 与精确目标核对后，依序应用全部 33 份 migration，marker 等于 head `20261006030000_strategy_authoring_save`。原业务库不作为该进程的连接目标。正常 Compose Server 内的专用 Node 子进程加载生产编译模块并执行 `AutomationScheduler.onModuleInit()`；采用真实时钟、定时启动回调、实际 PostgreSQL 租约及 SIGKILL，没有调用手动执行 API。

| 场景 | 最终结果 |
| --- | --- |
| replay-safe 运行中中断 | scheduled Run `3be1fe25-9256-4876-855f-bba40cf01c0a`；专用 PID `8069` 进入真实现金 handler 且持久化后 SIGKILL。租约实际到期，新实例接续，owner `1→2`，最终 `succeeded` |
| 双实例竞争与旧 owner | 恢复 PID `8098/8099` 同时启动，只有一个进入 handler；新 owner 仍 running 时，旧 owner 的 complete、fail、renew 均被拒。放行后唯一 canonical Run 成功，终态后旧 owner 也不能改写 |
| unknown-outcome | 固定无外部副作用 handler 的 Run `36b5c249-46d7-485f-ab2a-67ef3c791a2c` 被 SIGKILL 后收敛 `unknown_outcome`；owner `1→1`，两个恢复实例均未重跑 handler，canonical Run 仍为 1 |
| 真实现金补期 | 隔离库现金扫描保持 `0 9 * * *`、`Asia/Shanghai`，以已错过的最近 09:00 occurrence 接续；真实 RuntimeHandlers 扫描两个启用计划，分别创建 1 和 3 条 PENDING，暂停计划 0 条，LedgerEvent 为 0 |
| 中断后幂等与通知构造 | 首 owner 已创建四条后被终止；新 owner 读取 planCount=0，不重复物化。四个 `planId+periodKey` 唯一；两个计划各捕获一次合并通知入队，重放没有追加通知。捕获入口返回空投递列表，未配置渠道或发送外部通知 |

当前 baseline 本身含现金单例和已到期的估值种子。演练只在已核对身份的隔离库停用种子，再按主键更新目标；不将 SQL 的现金部分唯一索引误当作 Prisma `type` 唯一选择器。初次初始化的两次失败未进入正常业务库。资源保护检查也修正为从 Docker `HostConfig.Tmpfs` 核对 `--tmpfs`；曾因拒绝清理而留下的本入口临时容器，经同一维护脚本的 `--cleanup=<本入口容器名>`、令牌/名称/网络/挂载核验后回收。未删除持久卷。

最终临时容器清理成功，正常 Server 的 ID、镜像、启动时点与全部挂载完全不变。入口包含 45 秒自清理上限，仅终止自己创建的执行子进程。三项保护测试及 Node 语法检查通过；仓库边界和尺寸 ratchet 通过，仍为原九项警告。既有 Server 2892 项按未变生产源码复用，不重复全包或构建。项目原 ESLint 配置排除维护 `.mjs`，强行取消忽略会缺少 TypeScript 项目信息，不把该尝试计作 lint 通过，也未修改 lint 规则。

此证据补齐 Scheduler 原六项进程门禁及 Cash 的 scheduled、漏期、暂停、并发和恢复条件。外部补期通知仍因路由为空未通过；不把通知参数捕获当作外部送达。AI 真实生成、连接探针、用途测试及其他上游 HTTP 请求均为 0。原始回执保留在上述 `.recovery-artifacts/automation-process-2026-10-17.json`，关键版本、Run、代次和范围已在本文件保存。
