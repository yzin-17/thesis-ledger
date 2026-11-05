# 现金补期通知真实飞书验收与最终复核

日期：2026-11-01（北京时间）。对应[已完成 Task](../archive/tasks/2026-08-30-cash-account-funding-and-transfer.md#recurring-cash-acceptance)、[现金资金 Spec](../specs/2026-08-30-cash-account-funding-and-transfer.md)及[定期入账 Spec](../specs/2026-08-30-recurring-cash-deposit-plan.md)。

## 授权、范围与结论

用户在模拟通知通过后提供：“Provider我放在~/.zshrc的FEISHU_HOOK了”。本轮沿用此前单计划隔离验收范围，将真实接收对象固定为该 Webhook 绑定群：一个隔离计划、三期待确认汇总、最多一次真实请求，失败即停。执行前已说明发送范围、消息用途和一次上限，没有扩大到正常计划或全局通知。

2026-11-01 16:46:39–16:46:43，真实飞书请求一次完成。飞书返回 HTTP 200、`code=0`、`msg=success`，同时含 `StatusCode=0`、`StatusMessage=success`；隔离数据库通知从 `pending / attemptCount=0` 收敛为 `delivered / attemptCount=1`，`deliveredAt=2026-11-01T08:46:42.989Z`，错误码为空。双 Dispatcher 竞争、重复扫描及去除隔离冷却键后再次投递均未增加请求。

真实接收条件 NF1/NF2 通过，结合原 Scheduler、客户端和模拟失败恢复证据，当前现金 Task 全部验收条件满足并完成最终一致性复核。发送时飞书成功回执证明服务端接收；用户随后回贴全文，补充下述用户侧可见佐证，不推断其他群成员已读。

模型调用 0，费用 0。正常配置、全局路由及凭据文件保持，正常库 12 张受保护表摘要一致；临时 PostgreSQL/Redis 和子进程已清理。没有保存正常通知 Provider，没有自动启用后续通知。

## 消息与实际链路

发送文案来自现有现金通知 builder，只包含明确标识的隔离样本：

```text
[ThesisLedger 通知验收]隔离样本（非实际到账） · 待确认入账
停机期间已补齐 3 期待确认入账（2026-09、2026-10、2026-11），请逐期确认。
```

上述内容与[执行前预览](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/planned-message.json)及实际适配器请求一致，不包含真实账户、金额、凭据或正常计划信息。

用户随后在本聊天回贴上述完整标题与正文，与实际请求内容逐字一致，补齐用户侧可见佐证，见[回贴核对](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/user-receipt-verification.json)。这是已清理的隔离验收样本，无需逐期确认或实际入账。本次仅追加回贴证据，新增真实请求、模型调用及费用均为 0；保留原发送和最终复核回执。

链路为目标编译后的现金 handler → 独立 PostgreSQL → 通知 Outbox → 两个 Dispatcher/独立 Redis 抢占 → 生产飞书适配器及官方 URL 校验 → 真实官方 Webhook → 数据库终态。没有本机响应替换或关闭 URL 校验。

隔离数据最终为 1 个计划、3 条 `PENDING` 实例、1 条 `delivered` 通知、1 条 `source=delivery / state=healthy` 健康记录、0 条 `LedgerEvent`。通知确认不自动确认资金，也不改变实际余额。

## 可复用入口与保护

维护入口为 [`scripts/cash-notification-mock-smoke.mjs`](../../scripts/cash-notification-mock-smoke.mjs)，新增显式 `--mode=feishu-live`；不提供该参数时仍执行模拟模式。真实程序固定为 [`scripts/cash-notification-feishu.runtime.mjs`](../../scripts/cash-notification-feishu.runtime.mjs)，不接受任意运行文件、URL、目标或扩大请求次数。

[`cash-notification-mock.contract.mjs`](../../scripts/cash-notification-mock.contract.mjs) 仅解析 `~/.zshrc` 中唯一的字面量 `FEISHU_HOOK`，拒绝 Shell 表达式、重复定义、非官方 HTTPS、URL 额外参数及任意目标。没有 `source` 或执行 `.zshrc`；凭据只经 stdin 传给独立子进程，未进入命令参数、回执、日志或正常配置。诊断会隐藏 Webhook 与令牌。

隔离进程使用本轮随机加密密钥，只在独立数据库保存临时 Provider。外发包装器只允许该 Webhook 的一次 `POST`，要求 `redirect: error`、实际消息与预期 JSON 一致；首次请求即消耗上限，错误不重发，也不切源。飞书适配器保留原 5 秒发送超时，程序保留 30 秒看门狗。

Docker 仍只经仓库维护入口操作，沿用已验证的固定项目、健康 Server、编译模块摘要、同令牌 tmpfs/无宿主端口资源及有条件清理保护。复用本地 PostgreSQL 和项目 Redis 镜像，不拉取镜像或更新正常服务；36 个现有 migration 成功，结构 head 为 `20261023010000_report_metadata_snapshots`，84 张预期表存在。

目标 Server 镜像为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`；11 个编译模块与宿主一致。没有修改业务源码、依赖、迁移、客户端、镜像或启动入口，既有高成本验证按输入复用。

## 命令、检查与回执

工作目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。

```sh
/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/cash-notification-mock-smoke.mjs --mode=feishu-live --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/cash-notification-feishu-20261101T084201Z/live-run-1.json
```

退出码 0。[真实回执](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/live-run-1.json)包含脱敏业务响应、请求计数、实际消息、数据库终态、正常库前后摘要及清理结果；[精确命令](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/live-command.json)不包含凭据。真实程序 SHA-256 为 `87c55dadfcd32f894de55678b40604eb5525600b7aa0237b0f01702badcafe47`。

本轮验证：

- 5 个维护脚本的 `node --check` 通过，格式化及最终 `prettier --check` 通过。
- `node --test scripts/automation-process-recovery-smoke.test.mjs scripts/cash-notification-mock-smoke.test.mjs`：11/11 通过，包含字面量解析、诊断脱敏、固定模式/次数参数拒绝及原资源/清理守卫。见[检查回执](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/script-checks.json)。
- 共享入口发生变化后，先以默认模拟模式补一轮回归：5 场景、8 次回环 HTTP 通过，真实外部请求 0，清理与保护通过。见[共享入口回归](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/preflight-mock.json)。原故障、业务错误、三次重试及幂等结论继续复用[模拟证据](2026-11-01-cash-notification-mock-provider.md)，没有对真实飞书注入故障或重发。
- 真实发送仅 1 次，延迟 1231ms，成功业务回执及持久化 `delivered` 同时成立；重复/竞争新增请求为 0。
- `.mjs` 仍在既有 ESLint 忽略范围，不声称有效 ESLint 或新增 CI 通过；没有重跑输入未变的业务全量测试、原生编译或生产构建。

正常库以下行数及全行摘要前后一致：`Account(28)`、`AccountLedgerState(22)`、`LedgerEvent(138)`、`Trade(20)`、`JournalEntry(0)`、`ProviderConfig(5)`、`AiRoutingSettings(1)`、`AiRun(26)`、`AiToolCall(198)`、`NotificationDelivery(0)`、`RecurringCashDepositPlan(4)`、`RecurringCashDepositOccurrence(6)`。正常路由仍为空，两个原空字段及现有认证保持。

入口回执的 `protectedUnchanged`、`targetUnchanged`、`cleanup.postgres`、`cleanup.redis` 均为 `true`。最终的凭据泄漏扫描、源文件未变、主仓/DSA/infra 的 HEAD/index、资源不存在、正常服务健康及文档链接检查见[最终核对](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/final-verification.json)。没有暂存、提交、推送或清理既有 WIP。

最终本地 Git 状态核对首次报告未通过：基线采集时 `strip()` 去掉了首行状态前的空格，产生格式差异，三个仓库 HEAD/index 始终一致。按 Git 两列状态恢复该已知缺失空格后，DSA/infra 的完整状态列表一致；原始核对保留为[首轮核对记录](../../.recovery-artifacts/cash-notification-feishu-20261101T084201Z/final-verification-initial.json)。该修正仅影响本地报告比较，没有重发通知或改变仓库状态。

## 最终一致性复核

| 规格断言 | 当前证据与结论 |
| --- | --- |
| 现金资金 AC1–AC6 | 原 T1/T2 的账户范围、原子划转、修正链、历史快照及账本回归通过；本轮无业务源码变化，保留原证据 |
| 现金资金 AC7–AC8 | 原 T3/T4 和 10-16 的真实双向划转、未来入账、失败保留输入及客户端验证通过；本轮复用 |
| 定期入账 AC1、AC3、AC4 | 原实现的账户/计划限制、确认幂等及跳过恢复，结合 10-16 真实客户端证据通过 |
| 定期入账 AC2、AC5、AC6 | 10-17 真实 scheduled、独立进程、暂停/漏期、并发与 SIGKILL 恢复通过；本轮 3 条待确认及账本零新增补证 |
| 定期入账 AC7 | 本轮真实飞书明确业务成功回执、一条三期汇总及数据库终态通过；未配置、503/业务错误恢复、三次上限和失败不回滚由模拟证据独立证明 |
| 定期入账 AC8 | 10-16 宽窄屏、键盘、计划管理、确认、跳过/恢复、账户切换及失败重试通过 |

原资金验证及命令保留于[已完成 Task](../archive/tasks/2026-08-30-cash-account-funding-and-transfer.md)，执行面/消费面详见[10-16～17 证据](2026-10-16-cash-runtime-acceptance.md)。规格、权限、预算、写集、目标输入、样本及证据层已对账；没有待交付的现金实现或验收叶，没有把未验义务移入 TODO。最终结论：通过，可归档现金 Task；两份 Spec 继续作为当前产品合同。

当前非 Tushare 其余活动责任仍为研究 T13c/G4b 的到期及合格经济价格，以及有条件 P3 的合格固定集、封存评价和独立实验授权。它们由原研究 Task 持有，不被本次通知验收关闭。AI 非零费用仍按用户决定保留于 TODO。
