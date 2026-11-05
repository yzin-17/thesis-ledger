# 现金补期通知的模拟 Provider 验收

> 本文保留模拟验收时点的事实；后续真实飞书单请求及现金 Task 收口见[真实验收与最终复核](2026-11-01-cash-notification-feishu-acceptance.md)。

日期：2026-11-01（北京时间）。对应[当前 Task](../archive/tasks/2026-08-30-cash-account-funding-and-transfer.md#recurring-cash-acceptance)及[定期入账 Spec](../specs/2026-08-30-recurring-cash-deposit-plan.md)。

## 授权与结论

用户回复：“你可以自己构造一个模拟的Provider进行测试”。本轮据此建立可复用维护入口，在独立 PostgreSQL、Redis 和回环 HTTP 接收端验证通知闭环。NM1、NM2 通过；原真实飞书送达条件仍未验证，原 Task 保持活动。

最终轮覆盖 5 个场景，实际接收 8 次本机 HTTP 请求；补期合并、失败恢复、三次失败封顶及重复/竞争投递均符合当前合同。隔离库保留 13 条 `PENDING` 实例、4 条通知（3 条 `delivered`、1 条 `failed`）、8 条投递健康记录，`LedgerEvent` 为 0。正常库 12 张受保护表的行数和全行摘要前后一致，正常 Server/Redis 身份保持，两项临时资源清理成功。

本轮模型调用、真实外部 HTTP 请求、真实群消息和费用均为 0。没有保存正常通知配置、启用渠道、修改全局路由或现有 AI 配置；两个原空字段保持。

## 输入与维护入口

- [入口](../../scripts/cash-notification-mock-smoke.mjs)：只接受固定项目 `thesis-ledger-dev` 和本仓 `.recovery-artifacts` 内的新回执路径；禁止覆盖已有回执。
- [资源合同](../../scripts/cash-notification-mock.contract.mjs)：固定资源名前缀、UUID 令牌、角色标签、项目网络、tmpfs 和无宿主端口条件；拒绝持久卷、绑定目录及正常服务目标。
- [隔离执行程序](../../scripts/cash-notification-mock.runtime.mjs)：使用目标编译后的现金 handler、Outbox、Dispatcher、真实 Redis 抢占及飞书消息适配器。
- [守卫测试](../../scripts/cash-notification-mock-smoke.test.mjs)：覆盖参数、资源归属、清理边界、既有 Redis 镜像及只读快照生成代码的语法回归；同时复用原进程恢复入口的守卫测试。

入口先校验健康的目标 Server 和本项目 Redis，核对宿主与目标的 11 个编译模块 SHA-256，再以只读事务取得正常库保护快照。现有镜像为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`；没有构建镜像、更新可写层、替换文件或重启正常服务。

临时 PostgreSQL 使用已存在的 `postgres:17-alpine`，Redis 复用既有项目 Redis 的镜像 ID，均使用 `--pull never`。两者仅挂 tmpfs、加入既有项目网络、不发布宿主端口。隔离数据库名为 `cash_notification_fixture`，owner 为 `fixture_owner`；按顺序执行 36 个现有 migration，结构 head 为 `20261023010000_report_metadata_snapshots`，84 张预期表全部存在。

隔离执行程序是正常 Server 容器中的独立 Node 子进程，仅连接上述临时 PostgreSQL/Redis。合成 Webhook 使用本轮随机加密密钥，凭据和 Provider 只写隔离库。生产飞书 URL 校验继续执行；只有该子进程内精确匹配合成 Webhook 的 `POST`、`redirect: error` 请求会转至 `127.0.0.1` HTTP 接收端，其他 fetch 请求拒绝。没有修改生产网络安全规则。

## 实际结果

| 场景 | 待确认期数 | 接收请求数 | 数据库投递状态 | 结果 |
| --- | ---: | ---: | --- | --- |
| 未配置通知 | 3 | 0 | 无 Outbox | 待办生成成功，不受渠道缺失阻断 |
| 单期正常发送 | 1 | 1 | `pending(0) → delivered(1)` | 消息内容和成功回执一致 |
| 三期合并、503 后恢复 | 3 | 2 | `pending(0) → retrying(1) → delivered(2)` | 一条汇总，错误码 `feishu_http_503` |
| 三期合并、业务错误后恢复 | 3 | 2 | `pending(0) → retrying(1) → delivered(2)` | HTTP 200、业务码 19002 触发 `feishu_business_19002` |
| 三期合并、持续失败 | 3 | 3 | `pending(0) → retrying(1) → retrying(2) → failed(3)` | 三次封顶，不再投递 |

括号内为持久化 attempt 次数。重试等待实际保存的 `scheduledAt`，没有修改业务时钟。成功后错误码清空并保存 `deliveredAt`。接收端逐次核对适配器实际发送的 JSON、计划名称和月份，与消息快照一致；三期只生成一条 Outbox。

四个已配置场景均由两个独立 Dispatcher 并发领取同一条记录，每个 attempt 仅有一次 HTTP 请求。重复 handler 扫描、移除本轮隔离冷却键后的并发重扫及再次投递均零新增请求、零重复实例；发送失败不回滚待办。HTTP 接收端错误数和非许可请求数均为 0。

实际链路为现金 handler → PostgreSQL → 通知 Outbox → Dispatcher → 飞书适配器 → 回环 HTTP → 数据库终态。本轮按 `scheduled` 参数调用真实 handler，不新增真实 cron/进程停机证明；Scheduler 停机与并发恢复继续复用[10-17 的独立证据](2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)。

## 执行与失败记录

工作目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。最终命令使用宿主缓存 Node v24.22.1，目标运行 Node v24.22.2：

```sh
/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/cash-notification-mock-smoke.mjs --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/cash-notification-mock-20261101T064052Z/run-3.json
```

最终执行时段为北京时间 14:49:15–14:49:23，退出码 0。[最终回执](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/run-3.json)保存逐次 HTTP 消息/响应、实例、投递状态、模块摘要、前后保护快照和清理结果；[命令回执](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/run-3-command.json)保留精确参数。

首轮在只读保护快照程序的语法预检失败，尚未创建临时 PostgreSQL/Redis，正常业务查询也未执行。原因是生成 JavaScript 时 SQL 单引号转义错误；修复为结构化查询映射及 `JSON.stringify`，新增生成代码的语法回归。[失败回执](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/run-1.json)保留，正常目标身份和清理条件均通过。第二轮闭环通过；随后将本轮脚本中的嵌套三元改为明确分支，并以最终输入完成第三轮复验，两轮成功结果一致。全程合计 16 次回环 HTTP 请求，真实外部请求仍为 0。

最终 runtime 源码 SHA-256 为 `ef9232a45e156218779421b03b4a63fa61a8fcac5fe6c41afc94ce59c6f99158`。四个脚本的最终摘要见[输入记录](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/input-hashes-accepted.json)。

## 验证与保护

- 4 个脚本的 `node --check` 通过；原进程恢复守卫与新增守卫合计 8/8 通过；精确文件集的 `prettier --check` 通过，见[检查回执](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/script-checks-accepted.json)。
- 仓库 ESLint 配置忽略 `*.mjs`，原尝试产生 4 条 ignored 警告，不能记作有效 lint 通过；本轮采用上述实际语法、格式和执行测试。不修改既有 ESLint/CI 规则，不声称新增 CI 运行证据。
- 没有修改生产业务源码、运行依赖、数据库结构或客户端；已过的原实现测试、构建及 Scheduler 证据按输入复用，没有重跑全量测试或生产构建。
- 正常库以 `READ ONLY`、`RepeatableRead` 事务比较下列全行摘要：`Account(28)`、`AccountLedgerState(22)`、`LedgerEvent(138)`、`Trade(20)`、`JournalEntry(0)`、`ProviderConfig(5)`、`AiRoutingSettings(1)`、`AiRun(26)`、`AiToolCall(198)`、`NotificationDelivery(0)`、`RecurringCashDepositPlan(4)`、`RecurringCashDepositOccurrence(6)`；全部一致。
- HTTP 接收端、Redis/Prisma 连接由隔离程序关闭；维护入口按令牌校验自有子进程和 tmpfs 容器后清理。最终 `cleanup.redis=true`、`cleanup.postgres=true`、`protectedUnchanged=true`、`targetUnchanged=true`。
- 不暂存、提交、推送或覆盖既有 WIP；主仓、DSA、infra 的 HEAD/index 和新增文档链接检查另存[最终核对](../../.recovery-artifacts/cash-notification-mock-20261101T064052Z/final-verification.json)。

## 剩余边界

模拟传输和响应通过，不证明真实飞书认证、群成员可见性、飞书侧送达或线上重试。正常路由仍为空，正常库仍没有通知 Provider；原真实外部通知叶保持未勾选，本轮不再次索取凭据。

研究 T13c/G4b 最早窗口仍为北京时间 2026-11-05 15:00，并同时需要合格经济价格；用户已明确“暂无，保留现行门槛”。P3 真实对照仍缺至少 20 条合格样本、封存评估材料及对应实验授权。没有重试已知不合格来源、重复写入未到期观察或扩大模型调用范围。AI 非零费用验收按用户决定保留于 [TODO](../TODO.md#ai-provider-positive-cost-acceptance)，Tushare 本轮不执行。
