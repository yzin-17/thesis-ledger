# DSA Notification 能力审计

上游包含飞书及多种通知 Sender，飞书底层发送实现带重试和幂等 UUID。通知噪声模块支持 severity、dedup、cooldown 和跨午夜 quiet hours；Alert Worker 还保存触发、通知和数据库 cooldown 状态，并区分可重试错误。

Investment OS 可以复用经过 Contract Test 的飞书底层 Sender，但事件到通知的编排、severity 路由、静默策略、Daily Digest 和最终 Delivery Result 必须由主仓拥有。V0.1 的 `NotificationService` 已将 RiskEvent 与 Delivery 解耦。

## 运行验证（2026-08-01）

在 Fork 镜像中配置 `FEISHU_WEBHOOK_URL` 指向隔离 HTTP 接收器，并设置 `NOTIFICATION_ALERT_CHANNELS=feishu`、`NOTIFICATION_DEDUP_TTL_SECONDS=600`、`NOTIFICATION_COOLDOWN_SECONDS=600`，连续调用 `NotificationService.send_with_results`：

- 第一次接收器返回 HTTP 500，DSA 返回 `all_failed`，并将失败标记为可重试。
- 第二次接收器返回飞书格式 `{"code":0}`，DSA 返回 `sent`。
- 第三次使用相同 `dedup_key/cooldown_key`，未发出 HTTP 请求，返回 `noise_suppressed`，原因是去重 TTL。

实际捕获到 3 个请求：第一次的 interactive card、失败后的 text fallback，以及第二次的 interactive card。由此确认 Feishu Webhook、失败回退、可重试语义和 dedup/cooldown 状态机均在真实 Fork 运行态生效。Investment OS 仍保留 Delivery Result 和重试编排的主仓边界。因此 T015 的审计与运行验证已完成。
