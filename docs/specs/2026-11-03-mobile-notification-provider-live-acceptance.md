# 手机通知 Provider 真实投递验收

日期：2026-11-03。状态：本次验收完成，AC1～AC6 全部通过，见[验收与最终复核](../evidence/2026-11-03-mobile-notification-provider-live-acceptance.md)。对应[任务](../archive/tasks/2026-11-03-mobile-notification-provider-live-acceptance.md)。承接[手机迁移 AC12 的通知后续](2026-10-22-web-mobile-feature-parity.md#notification-provider-followup)，原迁移验收及其他后续范围继续独立维护。本规格保留本次验收合同，两次外发许可已用尽。

## 目标与授权

用户要求完成真实投递，并选择沿用上次定期入账验收的飞书测试群。Android 与指定 iPhone Air 各对应一条真实测试消息；总计最多两次外部 POST，每个平台最多一次，失败及结果未知均不自动重发。模型调用为 0，不启用正常自动通知路由。

仅从 `~/.zshrc` 的唯一字面量 `FEISHU_HOOK` 读取现有目标，复用既有解析和官方 Webhook 校验；不执行 Shell 配置、不复制其他凭证。凭证仅通过进程内存／标准输入传递，在现有服务端凭据入口加密保存于本次专用、停用的 Provider 配置，完成后精确移除该临时配置。手机、命令参数、日志和验收产物不保存明文凭证。

## 执行契约

复用目标服务中现有的 `NotificationService.deliver`、`FeishuWebhookProvider`、ProviderConfig 与健康记录能力，不增加产品接口或原生依赖。操作只经 infra 的[专用维护契约](2026-11-03-mobile-notification-acceptance.md)执行。

1. 每个平台独占验收命名空间，创建真实 NotificationDelivery 手动执行记录。执行中使用 `sending`，现行自动 dispatcher 只领取 pending/retrying，因此不能抢发本次记录；尝试数从 0 开始，不伪造历史尝试。
2. 显式调用现有单次投递能力并提供 `maxAttempts=1`。实际发送器使用已保存 Provider 的凭证，传输观察器仅记录本次出站的状态、业务码、时间及摘要，不修改 URL、请求头、正文或响应。
3. 飞书 HTTP 成功与明确的业务成功码 0、数据库 delivered／attemptCount=1 分别核对。失败或未知保留真实状态和已占用许可，不能以 HTTP 200 单独代收。
4. 消息只包含验收名称、平台、非敏感追踪标识和时间。接收目标仍为选定飞书群；接收确认与服务端回执独立记录。
5. Android 和 iPhone Air 分别通过真实 ThesisLedger API 在现有手机通知页面读取实际投递记录；宿主脚本或接口测试不能代替双端运行消费。沿用已验原生工程和对应编译证据，按实际输入决定是否需要重编译。

## 验收标准

- AC1：临时配置停用，正常路由保持原空集合；来源和业务保护基线建立，凭证未泄漏。
- AC2：Android 对应的一次真实 POST 有明确供应商业务成功回执，持久投递与健康记录一致，接收确认保留。
- AC3：iPhone Air 对应的一次真实 POST 满足同等条件；两端合计出站不超过两次。
- AC4：Android 现有通知页面实际展示对应 delivered 记录、渠道、一次尝试和关联标识，留存设备／应用／接口与画面证据。
- AC5：指定 iPhone Air 独立完成同等真实消费；不能由 Android、Web 或宿主读取替代。
- AC6：临时配置精确移除，真实投递／失败回执留存；原 Provider、路由、业务行、源码 WIP 和 Git 索引保全；最终一致性复核通过后归档任务，当前目录不保留占位文件。
