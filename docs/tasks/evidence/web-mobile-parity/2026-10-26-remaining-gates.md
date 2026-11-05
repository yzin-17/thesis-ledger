# 手机迁移剩余门禁逐项核对

对应[迁移 Task](../../../archive/tasks/2026-10-22-web-mobile-feature-parity.md)当前范围的 G5A/G5I、完整 G6A/G6I 与 G7。本次依据当前源码、目标 API、既有持久化元数据及 Android/iOS 独立原生读取更新状态。原树既有未提交修改保留，未通过项不勾选。

后续接续更新：用户已授权独立测试任务自然调度一次，G5SA/G5SI 的服务端事实、Android 和 iPhone Air 消费现已通过，任务已停用、通知 0，见[Scheduler 验收](2026-10-26-scheduler-acceptance.md)。下方既有 scheduled 记录不足的检查保留其先前采样时点；正常单次 Scheduler 已不属于当前剩余阻塞。其他外部条件不变。

Scheduler 后续盘点（2026-10-26）：本次重新核对任务勾选、Scheduler 回执、原行情/研究任务及模拟器清单；iOS 后续运行固定使用 iPhone Air（`F5C441F8-F758-435E-A436-8A2E3B0697A5`，iOS 26.5）。本次没有重新探测外部来源或刷新模型配置；下方运行态数值仍对应各自原采样时点，D36 失败后余 2 次冻结仍有效。当前范围按 Spec 与 Task 的最新确认执行；优先级见文末，剩余父门禁和最终 Review 保持未勾选。


2026-10-31最新状态：G5A/G5I和CI4通过，双端业务/保护/资源收尾完成。CI5已按4539文件精确授权公开2c64d888，四项首次全部成功、artifact为0，无追加修复，9路径与目标绑定通过。审批等待期间另有4路径风险账户约束已部署，[CI6](2026-10-31-ci6-current-inputs.md)4541文件/指纹ba27d441…精确快照及21项定向/类型/边界/两模块目标绑定已准备，公开许可已请求。完整G6/G7与Review未过，不重复模型/来源/六项写入，已关闭额度不恢复；下方10月26日采样只保留历史，不产生当前预算。

2026-10-30后续范围更新：用户明确“暂时不需要验证通知provider”，通知Provider真实投递、回执及双端实源消费按[迁移Spec](../../../specs/2026-10-22-web-mobile-feature-parity.md#notification-provider-followup)延期，后续记录见[独立验收](../../../archive/tasks/2026-11-03-mobile-notification-provider-live-acceptance.md)，当时未通过，迁移父门禁不依赖此项。通知诊断与已交付受控交互仍保留；当轮外发0。

2026-11-03 通知后续已独立通过真实飞书两条投递、用户收件确认及 Android／指定 iPhone Air 页面消费，见[最终证据](../2026-11-03-mobile-notification-provider-live-acceptance.md)。原始迁移采样和当时未验事实继续保留。

## 本次自动推进结果

本机证据目录为 `apps/mobile/release/acceptance-remaining-gates-2026-10-26/`。API 状态采样于北京时间 2026-10-26 02:10:44，后续持久化、原生及源码核对各自保留时间戳，不能外推为之后持续不变。

| 已执行项 | Android | iOS | 结论范围 |
| --- | --- | --- | --- |
| 现有真实目录读取与显式重新读取 | UIAutomator 通过 | XCUITest 通过 | 状态 ready、代次 18、标的 35459，与目标 API 一致；只读，不触发同步或标的确认 |
| API 与模式保持 | `10.0.2.2:3000/api/v1`、shadow 前后相同 | `127.0.0.1:3000/api/v1`、shadow 前后相同 | 未更改连接、主题、涨跌色或账户范围；没有确认放弃既有表单 |
| 原生编译适用性 | 复用 `feea66c1` 的 Android Native 成功 | 复用同提交 iOS Native 成功 | 本次生产、原生、锁文件输入未改，不重编译 App；新 XCUITest runner 的编译只属于验收工具 |

目录 API 回执另存 checksum `11897515…`、同步时间及 readiness；原生页面对照其实际显示的状态、代次和数量，不声称界面显示了 checksum。G5CA/G5CI 只核销读取子断言，目录同步提交、任务终态和标的确认的实源验收仍独立保留。

共享 SDK/TanStack Query 的八组纯读取通过：服务健康、AI Provider 摘要、研究默认设置、研究 capabilities、行情 registry、目录状态、自动化列表和通知路由。请求守卫的四个拒绝反例通过：写请求、策略 GET、OAuth current GET、外部主机均被阻止，守卫检查无网络请求。

按处理器实际行为避开两个 GET：`GET /api/market-data/policy` 在 pending 时会自动重试应用配置，首次还可能 seed；OAuth current/get 会过期化现有会话。本次未调用它们，不把 HTTP GET 一概当成无副作用。

## 10月26日历史事实与依赖

- AI：默认仍是 `openrouter/free`。OpenRouter 的研究 V2 路由 ready，保存过配置验证证明；业务 `research.canCreate=false`。原[研究任务](../../2026-10-18-research-evidence-evolution.md)D36 的正式请求失败于 `research_schema_invalid`，没有成功报告，余 2 次冻结。本地 lmstudio 的旧研究证明是 V1；bigmodel 仍停用，其当前研究 V2 路由 blocked，不能用这些状态替代本轮业务正向结果。
- 行情：registry 共 30 个来源；Tushare 已启用并配置凭据，TickFlow、Alpha Vantage、Finnhub 有凭据但停用。原任务已接受的范围按匹配输入复用；不要求全部来源启用，不为验收改变既有启停或扩展权限。
- 目录：已就绪，generation=18、instrumentCount=35459，无在途目录任务、无最近错误；两端已核对现有目录读取。它不能证明本轮从手机触发了新的实源同步。
- 自动化：现有 6 个任务，5 个启用；上轮自建 `daily-digest` 仍停用，已验手动执行与双端历史消费保留。最近 20 条公开历史均成功，但 API 字段不含 trigger/领取身份，traceId 是随机 UUID，不能据此推断 scheduled。
- 通知：当前可投递路由 0 条。查看失败通知、受控接收端和旧日志不等于真实外发成功。

Scheduler 进一步使用只读事务联查 `AutomationRunLease/AutomationRun/AutomationJob`，核对 API 与数据库同项目、同网络及数据库名，`transaction_read_only=on`；未选择业务 output 或配置/凭据列。用于确认目标的容器连接参数只在进程内处理，未打印或保存。既有 scheduled 成功记录确实存在，最近记录为 `dbd87df0…`，executionAttempt=1、leaseUntil=null；但发生在当前 API 容器启动之前。以当前容器启动时刻 `2026-10-25T16:29:40.283Z` 为界，未找到已领取成功的 scheduled 记录。原始 SQL、身份及时间保存在 `Scheduler持久化只读核对.json`，没有为取证新建、启用、执行或修改任务。

## 当前门禁关闭记录

2026-10-31最终核对：当前约定范围无剩余阻塞；35项/193子动作完整，139映射及875客户端相关输入无漂移。CI6四项首次成功、artifact为0，10模块匹配Server/Worker；G6A/G6I、G7与七项Review均已关闭，Task归档。

| 门禁 | 结论 | 输入与边界 |
| --- | --- | --- |
| CI6 | 通过 | a75d6e5d/树ea8c2f95…绑定4541文件，四项首次成功、零artifact，无追加修复 |
| G6A/G6I | 分平台通过 | 新增Android/Air业务差集独立，历史资源专项按匹配输入复用并保留原设备身份 |
| G7与Review | 通过 | AC01～AC15、35项/193动作、当前候选、文档与保护一致，完成Task归档 |

Longbridge与通知Provider实源按用户明确决定保留TODO未验。两目录job的efinance不可用明细保留，合并成功不表示全部Provider健康。执行额度关闭，CI未追加模型/来源/业务写入；独立研究/AI手动工具按逐文件边界保留WIP，原始全仓严格比较不改写。最终状态见[审查](../../../reviews/2026-10-30-web-mobile-parity-final-review.md)，上方旧采样只保留历史。
