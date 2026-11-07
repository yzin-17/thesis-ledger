# 风险规则自动接入验证

对应 [Spec](../specs/2026-11-06-risk-monitoring-schedule.md) 与 [Task](../tasks/2026-11-06-risk-monitoring-schedule.md)。本次是用户否定“另开 16:05 扫描”后的改造；旧排程方案的通过结果不构成本次完整验收。

## 当前交付与边界

- 已启用、已生效、未归档且无需修复的规则由数据库统一发现；保存规则不再另外登记或创建扫描任务。规则版本或准入集合变化时首评已有合格数据；未来生效、停用与恢复后的停用由相同查询条件处理。
- Market 记录已经成功取得的报价、正式净值和汇率，Risk 单向消费 Redis 有界更新日志。每秒仅检查本地日志与规则准入，不请求行情，未变数据不重复扫描。普通价格、止损和持仓集中度参与；策略应用、K 线及尚无自动输入的指标明确显示阻塞，未调用远程历史接口填补。
- 数据库持久越界状态覆盖普通和移动止损：首次越界建事件、持续越界复用事件、有效输入恢复后允许再次触发。事件事务锁定规则与目标，过期修订不能提交；峰值读写事务与旧定时扫描共享锁。显式不可用价格不更新峰值。
- 事件写入和通知入队错误保留日志检查点。输入不可用、执行失败与通知入队失败使用不同原因码；终止失败通知不因扫描无限重新入队，重复入队也不重新打开已投递记录或改写冻结消息，停用、归档或旧修订的待发通知会取消。模拟组合仍只记录事件。
- 报价保留真实 source time、fetchedAt 与 live/delayed；本地使用上限为 live 5 分钟、delayed 30 分钟，属于保守使用条件，不代表上游 SLA。正式净值保留 navDate，同一净值的新来源核验可更新 fetchedAt，缓存命中不伪装为新价格；过期输入不能确认风险恢复。日志截断、缺价、缺汇率与处理器不可用分别展示。
- 两端无独立开启 16:05 的按钮；引导仅检查规则。已有任务及通知设置保持原值，旧任务仍是可在自动化设置管理的兼容补充。历史通知与事件没有改写。

**持续行情阻塞仍在。** 当前接缝是按需 HTTP 快照，没有持续报价订阅，也没有可自动消费的已完成 K 线更新来源。不能据此承诺关页后的盘中及时告警，也不能回溯断线期间未取得的变化。未新增凭证、受限行情请求、轮询抓价或外部通知配置。

## 定向与包级检查

宿主依赖执行采用已安装 Node 26.13.0；项目要求的 Node 24 宿主镜像缺失，应用捆绑的 Node 24 加载本地 Rollup 原生扩展又受 Team ID 限制。没有为此改版本或安装依赖。以下 Node 26 结果不能当作 Node 24 生产运行态验收。

| 检查 | 输入范围与最后结果 |
| --- | --- |
| Server 风险及通知定向组合 | `vitest run test/notification-runtime.test.ts test/risk test/risk-state-machine.test.ts test/risk-market-contracts.test.ts test/notifications`：117 项通过，11 项需要隔离环境而跳过；后续新增输入原因投影的局部组合为 44 项通过。 |
| Desktop 定向 | 风险交互、恢复、读取状态、新监控组件与 onboarding：45 项通过。 |
| Mobile 定向 | 新监控状态的真实 API Client 契约消费：1 项通过。 |
| API Client 包 | 全部 40 个文件、208 项通过。 |
| Schemas / API Client 构建 | 各自 `tsc -p tsconfig.json` 通过。 |
| Desktop 构建 | `tsc --noEmit && vite build` 通过；保留既有大 chunk 警告。 |
| Mobile 类型检查 | `tsc --noEmit` 通过；本次未改原生工程，不将此视为 Native compile。 |
| Server 生产源码定向编译 | 临时 tsconfig 继承原设置，仅选择全部 `apps/server/src/**/*.ts`，输出到 `/tmp`，通过。没有更改仓库 tsconfig。 |
| 边界 | `node scripts/check-boundaries.mjs` 通过，新增 Market 禁止反向依赖 Risk、自动监控禁止直接依赖远程 integration 的门禁。 |
| 定向 lint / 复杂度 | 新增执行、观察和事件代码按 complexity 20 检查。RiskContext 原有两个方法在 HEAD 为 33/23，当前仍为 33/23，没有放宽阈值或 ignore。 |

全量 Server 检查未取得通过结论：一次包级运行在当前沙箱下为 459 文件通过、35 失败、89 跳过（3643 通过、77 失败、582 跳过，6 个运行错误）；主要包含本地 HTTP listen EPERM、当时尚未适配新通知门禁的测试 mock，以及并行任务的 `test/research/first-close-page-local.integration.test.ts` 隔离配置问题。通知 mock 随后修复并在上表定向组合通过。完整 Nest build 当次也被该并行研究测试的类型错误阻塞。没有把生产源码定向编译或本次风险测试扩大为全仓通过。

## PostgreSQL + Redis 隔离执行

正式仓库入口：`scripts/test-risk-monitoring-runtime.mjs`；执行目录为主仓根目录，命令为 `node scripts/test-risk-monitoring-runtime.mjs`，PATH 选择上面的 Node 26。脚本仅用本地缓存 `postgres:17-alpine`、`redis:8-alpine`，`--pull never`、tmpfs、随机 loopback 端口和本次 UUID 容器名；不创建 volumes，不更新开发服务。测试先核对数据库名 `risk_monitoring_fixture`、owner `fixture_owner` 和 Redis 本次所有权标记。

当前输入：全部按目录排序的 48 个 migration SQL，head `20261106030000_strategy_submission`。执行事件、状态、峰值、通知取消均走真实数据库；上游行情与外部通知为受控替身，不联网。

最终结果：退出 0，1 个文件、8 项通过（测试耗时 1.17 秒），脚本确认全部临时容器已清理。场景包括自动接入、关闭/归档/未来生效、持续越界去重、恢复、重启、乱序/陈旧输入、并发事件与峰值、真实事务写入拒绝后的重放、通知入队失败，以及正式净值来源核验时间。

保留原始失败：第一次启动就绪检查误命中 PostgreSQL 临时初始化 socket，改为 TCP 就绪后通过；一次数据库故障注入使用基对象 spy，未进入 Prisma transaction delegate，因此测试失败，改为仅隔离库中的真实 INSERT 拒绝 trigger。两次失败后都已清理临时容器，未操作开发服务或数据。

## 浏览器受控组件验收

真实 IAB 浏览器打开 Vite 提供的测试组件，fetch 仅允许 `GET /risk/monitoring` 的假数据，其他请求均拒绝。可复用输入为 [fixture](../../apps/desktop/test/fixtures/risk-monitoring.html)，引用的是真实组件及项目样式，不是截图替代实现。临时服务绑定 `127.0.0.1:5187`，完成后已停止。

实际 viewport 1440、1024、768、390 均无横向溢出；1024/768/390 的 section 实测宽度为 992/736/358。窄屏文字正常换行，未出现扫描开启按钮；未来生效、缺输入来源、延迟数据与断线限制可见。viewport override 已恢复。缺汇率原因的新增一行由组件测试覆盖，未将先前截图当作这行文案的浏览器证据。

这只证明受控风险状态区的布局。目标完整风险页面、真实通知、跨市场持续行情与 K 线运行链没有验收；未执行 infra 的 sync-code.sh 或 update.sh，没有声称镜像或目标运行态已更新。


后续补充：分钟来源不是全局不存在。当前富途已有交互分钟合同，但尚未被当前 policy 选用，也未接入风险执行流。现有来源、600秒限制和目标旧任务0的精确续查见 [来源与迁移检查](2026-11-06-risk-monitoring-source-readiness.md)，不改变本记录的隔离测试和未部署边界。
