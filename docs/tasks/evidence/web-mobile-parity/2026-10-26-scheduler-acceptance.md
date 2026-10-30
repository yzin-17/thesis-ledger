# 独立单次 Scheduler 与双端消费验收

对应[迁移 Task](../../2026-10-22-web-mobile-feature-parity.md)的 G5SA/G5SI。本轮用户明确允许新建独立测试任务、自然调度一次后停用，禁止修改既有任务、调用模型/行情或发送通知；iOS 指定 iPhone Air。其他业务实源条件和父门禁保持原状态。

## 授权范围与输入

原树基线保存在 `apps/mobile/release/acceptance-scheduler-2026-10-26/原树基线.json`。沿用已通过 CI 的生产、原生及锁文件输入，只新增本机验收工具及中文状态文档，不重置、暂存或提交原树。

处理器选择 `daily-digest`：当前实现只读取已有 actual 风险事件并构造摘要，不调用模型、行情客户端或成功通知。正常调度不经过失败通知路径；异常路径的 `NotificationService.enqueue` 在无路由时直接返回空数组。因此启用前、等待期间及结束后均要求通知路由为 0，出现路由即停用本轮任务，不改变通知配置。

请求守卫只允许新 UUID 的创建与启停，以及健康、通知路由、任务列表和本 UUID 历史读取；拒绝其他任务写入、`/run`、模型、目录同步及通知投递。五个禁止动作的守卫自检通过，未发出网络请求。创建与启用不自动重试；不确定时找回同一 UUID，不另建或手动补跑。

## 服务端自然调度结果

| 项目 | 实际结果 |
| --- | --- |
| 任务 | `bae2b62e-fa16-494f-97be-5247c578bc31`，手机迁移验收-G5单次调度-20261026 |
| 创建/启用 | 先停用创建，`maxAttempts=1`、`lockTtlMs=30000`，核对计划后仅启用该 UUID |
| cron / 时区 | `53 02 26 10 *` / `Asia/Shanghai`；独立日期和分钟，不是每分钟循环 |
| 计划时刻 | 北京时间 2026-10-26 02:53:00，对应 `2026-10-25T18:53:00.000Z` |
| 唯一运行 | `c0da3b3d-502d-4ba9-af25-1efcb64dd491`，`trigger=scheduled` |
| 执行时刻 | 开始 `2026-10-25T18:53:13.199Z`，结束 `2026-10-25T18:53:13.218Z` |
| 领取/终态 | `executionAttempt=1`、`attempt=1`、`succeeded`、`leaseUntil=null` |
| 历史总数 | 1；API 与持久化 run ID 一致，无手动运行请求 |
| 最终任务状态 | 已停用；双端验收后再次读取仍为停用、仅 1 条成功历史 |
| 既有任务 | 原六个任务配置摘要保持一致，包括上轮始终停用的手动测试任务；未调用其写入接口 |
| 模型/行情/通知 | 测试处理器及接续请求无模型/行情调用；通知路由始终为 0，本 run 对应通知记录为 0，无投递请求 |

测试 cron 的下一次日期虽在下一年，任务已明确停用；不依赖日期间隔作为停止措施，不删除留存审计对象。

只读事务对已确认的 API/PostgreSQL 关联目标执行 `AutomationRunLease/AutomationRun/AutomationJob` 联查及本 run 的通知计数，`transaction_read_only=on`。十四项检查全部通过，含当前容器启动后执行、单次领取、终态、租约释放、停用及零通知。SQL 未选择业务 output 或配置/凭据列；容器连接参数只在进程内确认目标，未输出或保存。证据为 `单次调度持久化证明.json`。

既有任务保护比较 name/type/cron/timezone/enabled/managed/systemKey/retryPolicy/lockTtlMs 等配置字段，不把原 Scheduler 正常推进的 `nextRunAt` 当作人为配置变更。最终纯 GET 复核为原六任务配置摘要不变、唯一新任务停用、历史总数 1、通知路由 0。

## Android 与 iPhone Air 独立结果

| 平台 | App 原生编译/安装适用性 | 本轮运行 |
| --- | --- | --- |
| Android | 生产/原生/锁文件输入未变，复用 `feea66c1` 的 Native CI 与原 Debug 安装适用性；未重新编译 App | `thesis-ledger-ui-api35` UIAutomator 独立读取新任务停用状态、同一 run ID、成功及总数 1；API `http://10.0.2.2:3000/api/v1`、shadow 前后相同，通过 |
| iOS | 使用已启动 iPhone Air `F5C441F8-F758-435E-A436-8A2E3B0697A5`；初始未安装，安装已有 arm64 Simulator Debug，59 文件逐一与已验产物一致，复用同提交 Native CI；XCUITest runner 编译另记 | Air XCUITest 独立读取停用状态、同一任务/run ID、成功及总数 1；API `http://127.0.0.1:3000/api/v1`、actual 前后相同，通过 |

Air 的新安装初始范围为 actual，Android 原有范围为 shadow；自动化是全局对象，两端使用同一任务/run 身份，未切换账户范围或操作业务账本。Air 原生附件的 device ID/name 全部核对为指定设备，未借用旧 iPhone 17 Pro 证据。其他场景的历史设备记录继续按其原输入和设备解释。

## 保留的失败和本机工具修正

Android 首次未定位到新任务，本地工具随后改用列表中部滚动并显式 GET 重新读取自动化，独立消费通过。首轮 JSON、失败截图/状态树和动作日志保留；没有为了补界面证据再次调度任务。

Air 前两次运行因新设备缺少开发脚本地址失败。首次尝试通过 CLI `defaults` 设置 `RCT_jsLocation`，命令回读成功，但检查 App 沙盒后确认只写入模拟器全局域，未让 App 加载成功；该新增全局键已按原缺失状态删除。随后使用 XCUITest 的进程启动参数 `-RCT_jsLocation 127.0.0.1:8081 -RCT_packager_scheme http` 连接已运行的 Metro，第三次独立用例通过。没有修改生产源码或持久化业务配置；原失败日志、`.xcresult`、截图、命令回执及清理证明均保留，不把命令成功当成运行成功。

## 当前核销与接续

G5SA、G5SI 仅核销这次真实单次正常调度、持久化事实和分平台历史消费。M29b、G5A/G5I 其他模型/来源、路由/目录写入与真实通知条件继续保留，完整 G6A/G6I、G7 和最终 Review 仍未通过。实际源码、原树保护、链接/中文及勾选状态由本机最终复核回执记录；输入不变的高成本构建与 CI 按已有证据复用。

本机原始目录为 `apps/mobile/release/acceptance-scheduler-2026-10-26/`，主要回执包括 `单次调度执行.json`、`单次调度持久化证明.json`、`Android调度消费.json`、`iPhoneAir调度消费.json` 和 `调度结束状态复核.json`。产物留在本机，不上传或分发。
