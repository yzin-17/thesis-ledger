# 手机通知 Provider 真实投递验收任务

对应[规格](../../specs/2026-11-03-mobile-notification-provider-live-acceptance.md)。状态：已完成，2026-11-03 最终复核通过。真实飞书投递、用户收件确认和 Android／指定 iPhone Air 页面消费全部通过；总许可两次均已使用。详见[验收与最终复核](../../tasks/evidence/2026-11-03-mobile-notification-provider-live-acceptance.md)。

## 执行清单

- [x] N0 确认真实范围与目标。用户选择沿用定期入账验收的飞书测试群；只读核对当前通知 Provider 数量 0、路由空。Android AVD 为 `Medium_Phone_API_37.0`；指定 iPhone Air 为 iOS 26.5、`23AB3E1A-4C30-462C-943C-B9CB5B894E96`，两端初始均未启动。
- [x] N1 准备与有界执行入口。infra 专用脚本的 10 项定向及语法检查通过；原路由空，临时配置停用，凭据通过原入口加密，原记录摘要和两次许可台账已冻结。
- [x] N2 真实投递。两次真实 POST 均 HTTP 200／飞书业务码 0，两个真实 NotificationDelivery 均 delivered／attemptCount=1，健康记录一致。用户明确确认两条均收到；原始回执与接收确认保留，总许可已使用 2/2。临时配置已精确清理，原业务保护核对通过。
- [x] N3 Android 真实消费。现有 `Medium_Phone_API_37.0` 实际读取对应关联标识、已送达、飞书渠道和一次尝试；截图、UI 树及 API 原值已留证。ADB mDNS 崩溃与本轮独立恢复事实保留。
- [x] N4 iPhone Air 真实消费。指定 `23AB3E1A-4C30-462C-943C-B9CB5B894E96` 独立 UI 测试通过，1 项／0 失败，画面及真实 API 反读已留证，原连接未改。
- [x] N5 保护核对与收口。临时 Provider 已精确移除，真实通知和健康审计保留；23 表原行、三仓 11,448 文件及 HEAD／index 保护通过。生成缓存的凭据夹带已清理并复扫通过；本轮开发资源已恢复，最终文档与归档引用核对通过。

## 接续与边界

N1 工具责任见 [infra Task](../../../../thesis-ledger-infra/docs/archive/tasks/2026-11-03-mobile-notification-acceptance.md)。每个叶完成后回到本清单接续；设备准备可与不依赖真实投递的入口实施推进。源事实、真实 Provider、持久状态、收件确认与双端 UI 分层记录。

原件与保护台账位于 `.recovery-artifacts/mobile-notification-provider-live-20261103/`，起点授权见 `authorization.json`，原源码／索引见 `source-before.json`。本轮标识为 `39483e21-2e11-4320-bb59-c02696b3a47d`；出站与收件、双端 UI、清理及原行保护已逐层对账。本次验收不提供后续外发许可。原手机迁移保持已完成归档状态，其他后续项由原入口维护。

## 最终一致性复核

结论：通过，覆盖本次 Spec AC1～AC6 和 infra I1～I4。原生输入按实际摘要复用，当前 JS／真实 API 双端消费通过；本轮没有产品依赖或原生配置变化。失败事实、临时凭据清理和资源恢复均留证，无未完成义务或阻塞项。完整命令、来源摘要及分层结果见[验收与最终复核](../../tasks/evidence/2026-11-03-mobile-notification-provider-live-acceptance.md)。
