# 自主比赛可选研究步骤与时限验收

日期：2026-11-12。合同：[自主竞技场规格](../specs/2026-11-12-autonomous-model-arena.md) AC16。

## 行为与执行边界

研究步骤和时限默认空白、归一为 `null`，分别关闭模型轮次／工具次数限制与本次研究耗时限制。有限正整数仍保持原校验；零及非法值拒绝，已有数值协议和旧日频不改写。自主兼容字段 `decisionDeadlineMinutes` 未设时同为空，不提供隐藏截止。

不限时领取任务时 `deadlineAt=null`，不以当前会话结束时间强制截断。后台租约独立采用 60 秒窗口、每 5 秒续约；这是执行者存活检查，不发模型请求、不触发新研究。续约带状态、attempt、未失效租约及比赛运行条件；查询失败中止，不视作任务缺失。有限时任务的租约不能超过业务截止。

执行循环、SDK 和工具共用中止信号。不限时 SDK 请求的 `timeout` 为空；有限时保持总超时。暂停／结束使持久化状态失效并在下一次心跳取消在途工作；后续调用另经事务门禁拒绝。Worker 停止主动取消，防止队列关闭等待无限任务。未知出站结果保留审计及预留，不自动补发。有限预算、上游能力、身份、账户冲突及委托市场／行情／资金校验继续生效。

## 定向测试与构建

| 范围 | 命令与结果 |
| --- | --- |
| 共享契约 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/arena-live.test.ts`：7 项通过。 |
| 共享创建 | `pnpm --filter @thesis-ledger/api-client exec vitest run test/arena-live-optional-budgets.test.ts test/arena-live-optional-dates.test.ts`：17 项通过，含独立有限步骤／有限时限与旧日频截止。 |
| 执行控制与预算 | `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-research-control.test.ts test/model-arena/live-call-limits.test.ts`：14 项通过，其中 5 项为新增执行控制场景。 |
| 调度回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-optional-dates.test.ts`：6 项通过。 |
| Desktop 回归 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/arena-detail-refresh.ui.test.tsx test/arena-daily-navigation.test.ts test/arena-catalog-navigation.test.ts`：17 项通过。 |

执行控制使用虚拟时钟推进 20 分钟，证明持续续约而不触发旧五分钟或租约时长限制；这不是实际持续 20 分钟的模型调用。有限截止、取消／失效租约、数据库异常和 Worker 停止分别覆盖。

schemas／domain／api-client 构建，Server／Desktop／Mobile 类型检查及 Desktop 生产构建通过。定向 ESLint、边界、文件尺寸和 `git diff --check` 通过。文件尺寸存在 5 个既有文件警告，本任务没有修改这些文件；Node localStorage、React `act` 及 Vite 大包提示保留。

## 隔离数据库与受控模型

`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-appointments-postgres.integration.test.ts test/model-arena/live-orders-postgres.integration.test.ts test/model-arena/live-unlimited-budget-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`

维护入口创建专属临时 PostgreSQL，数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`，应用实际 51 个迁移，最终 5 文件、26 项通过并清理临时容器。关键新增证据：

- 无步骤／时限上限的受控研究完成 26 次模型请求、25 次工具调用后提交最终决策；领取时传入 100 毫秒后的会话边界，完整研究耗时约 2.4 秒，未被该边界截断。所有 SDK 请求均未设置总超时。
- 不设时限但步骤数为 1 时，按明确步骤上限终止。
- 实际数据库续约后，恢复扫描不误判；已丢失的租约和旧 attempt 不能复活任务。旧未出站有限恢复、出站未知不补发、委托及预算事务回归通过。
- Worker 停止向在途受控 SDK 请求传递中止信号，不提交决策、不重发。暂停在约 5 秒的心跳周期内中止在途受控请求，保留 `unknown_usage`／`arena_paused`。

模型为受控函数，未连接真实 Provider；此处证明参数、信号及持久化状态联动，不证明远端已停止计算或计费。

## 两端浏览器

维护脚本使用实际业务组件、受控 API，在 1440、1024、768、390 全部通过。Desktop 每宽度三组配置：同时无限、仅步骤有限、仅时限有限；创建请求及详情回显核对 `null` 与明确数值。Mobile 核对清空保存、默认值／不限制提示及账户显示，并回归实际图表文档、触摸、图例、指标切换和直接结束。无页面错误及横向溢出。

- Desktop：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_OPTIONAL_BUDGETS=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_QA_OUTPUT=/tmp/arena-unlimited-research-desktop node scripts/local-runtime/arena-optional-dates-browser.mjs`。
- Mobile：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_MOBILE_OPEN_SEASON=1 ARENA_MOBILE_UNLIMITED_BUDGET=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_QA_OUTPUT=/tmp/arena-unlimited-research-mobile node scripts/local-runtime/arena-live-mobile-browser.mjs`。

Mobile 为 RN Web 受控夹具，未改变原生依赖，不代表原生设备或宿主验收。真实比赛保持只读。

## 目标运行态

从 infra 仓库执行 `./scripts/sync-code.sh thesis-ledger`，兼容预检、Server／workspace 构建、传输、重启及健康检查全部成功，退出码 0。Server／Worker 均为 healthy，镜像保持 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`。快更更新容器可写层，不代表镜像发布。

Server 容器内只读契约探测确认：省略研究步骤、时限和兼容截止均为 `null`；纯受控租约读取器下，无业务截止的执行控制正常启动和关闭。未访问数据库或真实模型。以下产物宿主与 Server 容器 SHA-256 一致：

| 产物 | SHA-256 |
| --- | --- |
| `schemas/dist/arena-live-protocol.js` | `2a7f2318a54cd5bf739b00a167dd7595cbb56b2f4f8b58dc4647b9d081207e87` |
| `server/dist/src/model-arena/live/live-research-control.js` | `b9510b20027468cfde172d046b81c3480aaff51cdb5357cc688849a865892d6f` |
| `server/dist/src/model-arena/live/live-cycles.repository.js` | `1883ee849535fef0fce7e0c6a340945397965e95465638d487cacd8c963ceefd` |
| `server/dist/src/model-arena/live/live-research-call.js` | `004f43a58d3a8a367854bf08e9dd96a7e38ea4ee593b49e7f590928792a9bf8d` |
| `server/dist/src/model-arena/live/live-research-runner.js` | `31ff9231b3685836be92a7aad3fbf60b7f3f134bac88cbbd93de65850c085386` |

目标目录接口一次只读 GET 返回 200，5 场既有记录通过现行契约。未执行真实模型、来源及比赛状态写入。U01–U04 完成，父级原生宿主、真实来源及完整故障恢复验收不据此关闭。
