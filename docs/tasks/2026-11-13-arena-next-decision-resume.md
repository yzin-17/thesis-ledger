# 自主竞技场下一次决策与恢复观察：实施记录

- [x] 调查 existing wakeups、暂停恢复、模型调用周期、前端展示和数据库事务。
- [x] 服务端补充原子化立即预约，恢复时为可运行模型安排保底观察，沿用交易时段与回放游标。
- [x] 新增单模型手动触发 API 与共享客户端。
- [x] Desktop / Mobile 显示下次预约并提供显式手动触发。
- [x] 增加重复触发、暂停恢复、时间/事件显示定向测试；隔离数据库集成测试已补充，待具备测试环境时运行。
- [x] Domain / API client 构建成功，Desktop 类型检查通过；Domain 3 项与 Desktop 9 项定向测试通过。服务端 tsx 独立检查覆盖恢复、手动和重复预约。
- [ ] Server Vitest 目前在 Schema 循环初始化阶段失败，既有非竞技场测试同样失败；Server 类型检查还有复盘测试的已有错误，Mobile 类型检查有复盘 UI 的已有错误。需待无关修改稳定后重跑。
- [x] 2026-11-13 发现手动触发成功返回 HTTP 201、模型有到期预约，但市场未开放；前端缺少成功反馈。新增“已安排/已有预约”服务端回执，Desktop/Mobile 对应展示成功、失败与提交中状态。
- [x] 2026-11-13 反馈修复回归：Domain 4/4、Desktop 9/9，Domain/Schemas/API Client 构建、Desktop 类型检查、Server Nest 构建通过。
- [x] 2026-11-13 从 `thesis-ledger-infra` 执行 `PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0；正式兼容性预检通过，Server 与 backtest-worker 已重新启动且 healthy。容器中确认新版 `already_scheduled` 回执和 Schema；`/api/v1/health` 返回 200，桌面 Vite 源模块已更新。镜像未更新，数据未重建；Docker 可写层同步会在容器重建后消失。
- [ ] 未对真实账户发起手动模型决策或模拟成交验收（避免扣费）；后续由用户在开市后观察 `pending → researching → succeeded/failed`，并验证历史决策页面同步更新。保留其他未提交改动。

## 2026-11-13 研究与开市状态解耦

- [x] 调整实时预约扫描：盘前、休市、未知会话允许时间或成交事件唤醒，价格事件继续需要合格开市会话行情，赛期边界必须有效。
- [x] 调整任务投递和执行：研究独立于市场开盘，回放保持历史屏障；普通委托及成交保持原交易会话门禁。
- [x] 更新模型提示和 Desktop / Mobile 文案，向模型传入服务端市场状态，休市研究时要求 orders=[]，避免再称休市不能研究。
- [x] 增加开/闭市、未知日历、赛期边界和订单门禁的定向测试（Server 19、Desktop 9、Domain 6 项全部通过）；Server Nest 构建和 Desktop 类型检查通过。
- [x] Docker：从 `thesis-ledger-infra` 运行 `PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。正式预检、源码构建、Server/Worker 健康检查通过；容器内核对更新的 `canObservePrices`、`arenaDateAt` 和 `marketSession` 逻辑，`GET /api/v1/health`、`GET /api/v1/arena-matches` 均为 HTTP 200。仅更新容器可写层，不更新镜像、不变更数据库或 volume。
- [ ] 未执行实际付费模型的盘前研究端到端验收。运行中美股模型目前 `needs_attention / model_output_invalid`，最近失败周期发生在部署前；需用户显式点击「重新预约研究」才能在新规则下再次调用，避免静默产生额外费用。

## 2026-11-13 手动触发 409 竞态与双重报错

- [x] 查明前后端同时显示 trigger.error：顶层通用提醒与模型账户局部提醒重复；只在模型账户展示手动触发错误。
- [x] 核对运行时：重新预约研究 POST 201 后约 21 秒，手动触发 POST 409；数据库确认当时模型处于 researching，后续研究完成后回到 waiting。
- [x] 手动触发幂等化：研究中或已有 pending/running 周期返回 already_in_progress，不新增预约、不产生新的模型调用；暂停/失败需人工处理等非法状态仍按原规则拒绝。
- [x] Desktop/Mobile 处于 pending/running 时隐藏手动触发按钮，已进入研究中时不显示过期请求错误；成功回执解释已有决策无需重复预约。
- [x] 定向验证：Server 18 项、Domain 4 项、Desktop 9 项通过；Schemas/Domain/API Client 构建、Desktop 类型检查和 Server Nest 构建通过。Mobile 类型检查仍因未修改的 journal-ai 组件现有类型错误失败。
- [x] 从 `thesis-ledger-infra` 目录执行 `PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。正式兼容性预检、宿主构建通过，Server/Backtest Worker 均 healthy；容器内确认 `already_in_progress` 返回分支及 Schema/Domain 文案；`GET /api/v1/health` 与 `GET /api/v1/arena-matches` 均 HTTP 200。未对真实模型再次发送手动请求，不会增加研究费用；原 409 记录不修改。同步仅修改容器可写层，镜像/数据库/外部卷未改动，容器重建后需完整构建。
## 2026-11-14 到期预约仍显示手动触发按钮

- [x] 排查实际赛场：17:04 UTC 的预约已经触发并开始研究，17:05 UTC 研究成功且生成新的 17:30 UTC 时间预约；不存在持续积压的调度故障。
- [x] 将待调度条件抽取为共享领域函数 arenaHasDueTimeWakeup，使用未触发的 time wakeups 和正确的当前/回放时钟判定到期；已触发、未来时间及价格/成交事件不计入。
- [x] Desktop/Mobile：到期未消费的时间预约不再显示手动触发入口；pending/running 的现有限制保持，未来时间预约仍允许提前研究。
- [x] Domain 5 项、Desktop 9 项单测通过，Desktop 类型检查通过；未修改服务端调度、模型 Schema、资金/撮合规则。
- [x] 2026-11-14 从 `thesis-ledger-infra` 执行 `PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。兼容预检通过，运行中 Server 和 Backtest Worker healthy；容器内验证 Domain 新函数 `arenaHasDueTimeWakeup` 已生效，Vite 已返回新桌面源码，健康与竞技场查询均 HTTP 200。数据库只读确认原 17:04 UTC 研究周期已成功、当前没有活跃研究，未手动发起任何新的模型调用。镜像不变，无数据库/volume 操作；容器重建后代码同步会失效。