# 手机通知 Provider 真实投递验收与最终复核

日期：2026-11-03（北京时间）。对应[验收规格](../specs/2026-11-03-mobile-notification-provider-live-acceptance.md)、[验收任务](../archive/tasks/2026-11-03-mobile-notification-provider-live-acceptance.md)及 [infra 维护入口](../specs/2026-11-03-mobile-notification-acceptance.md)。

## 结论与授权

本次验收通过。用户指定沿用定期入账验收的飞书测试群，Android／指定 iPhone Air 各一条，总计两次真实 POST；两次均有飞书业务成功回执、持久投递终态、健康审计及用户收件确认。两个原生应用分别通过真实 API，在通知页面展示本轮记录、渠道和一次尝试。临时 Provider 已清理，正常路由保持空，目标服务健康，原业务行和三个仓库的既有源码／索引保全。

验收对象为现有飞书渠道的真实投递及双端页面消费。Android 运行于既有 AVD，iPhone Air 运行于指定模拟器；本轮没有实体手机或 APNs／FCM 系统推送验收结论。原手机迁移的受控通知证据与本次真实验收分开保留。

起点授权见 [authorization.json](../../.recovery-artifacts/mobile-notification-provider-live-20261103/authorization.json)。本轮标识为 `39483e21-2e11-4320-bb59-c02696b3a47d`。出站许可已使用 **2/2**，模型调用 **0**，自动重发 **0**；本文及已完成任务不提供后续发送许可。

## 真实回执与收件

| 平台标识 | 开始时间（北京时间） | NotificationDelivery ID | 实际结果 |
| --- | --- | --- | --- |
| Android | 16:24:25.871 | `a9d3bafc-ea79-4c5b-9cd2-f98f28313a9f` | HTTP 200，业务码 0，`delivered`，`attemptCount=1` |
| iPhone Air | 16:24:35.923 | `8fb18c0f-1002-4fd5-b00c-8d9458102f3c` | HTTP 200，业务码 0，`delivered`，`attemptCount=1` |

两次实际响应均为 `{"StatusCode":0,"StatusMessage":"success","code":0,"data":{},"msg":"success"}`。各产生一条真实 `source=delivery / state=healthy` 记录。供应商响应 SHA-256 均为 `89e94416fa02187e877112ac0b31f87d579d748dc6cd117b6a1e24b458415272`。

原始脱敏回执分别见 [Android](../../.recovery-artifacts/mobile-notification-provider-live-20261103/notification-android-eec6a07a-269e-4200-a0d2-1f22d1c1a5df.json)和 [iPhone Air](../../.recovery-artifacts/mobile-notification-provider-live-20261103/notification-ios-ea721ff8-6799-45a3-9971-8e4fb5255454.json)。用户针对标题「ThesisLedger Android 手机通知验收」「ThesisLedger iPhone Air 手机通知验收」明确回复“两条都已收到”，见[收件确认](../../.recovery-artifacts/mobile-notification-provider-live-20261103/recipient-confirmation.json)。这补齐指定群实际收件，不推断其他成员已读。

维护入口复用目标服务的 `NotificationService.deliver`、`FeishuWebhookProvider`、加密配置和健康记录。临时配置始终 `enabled=false`；本轮手动记录从 `sending` 开始，避免正常 dispatcher 领取；现有发送器以一次上限执行。出站观察器仅记录真实响应，不替换传输、请求或业务结果。首次外发前持久占用平台许可，未知结果不能释放；真实执行后未重发或注入外部故障。

## 双端真实页面消费

两端均使用实际模式，从「组合 → 风险事件 → 通知与路由状态」进入。宿主 `ThesisLedgerApiClient.risk.getNotifications()` 的真实解析结果另见 [SDK 反读](../../.recovery-artifacts/mobile-notification-provider-live-20261103/sdk-readback.json)，它只作为契约佐证。

| 验收项 | Android | iPhone Air |
| --- | --- | --- |
| 设备 | `Medium_Phone_API_37.0`，`emulator-5554` | iOS 26.5，`23AB3E1A-4C30-462C-943C-B9CB5B894E96` |
| API | `http://10.0.2.2:3000/api/v1` | `http://127.0.0.1:3000/api/v1` |
| 页面 | 同屏可见两条已送达记录；Android 关联标识完整可见 | 独立 UI 测试可见 iOS 关联标识、已送达、`feishu` 和尝试 1 次 |
| 结果 | UIAutomator 读取与截图检查通过 | `testNotificationReadback` 通过，1 项／0 失败，13.445 秒 |
| 连接保护 | API 原值未改 | API 原值未改 |

Android 的[画面](../../.recovery-artifacts/mobile-notification-provider-live-20261103/android-notifications.png)、[实际 UI 树](../../.recovery-artifacts/mobile-notification-provider-live-20261103/android-notifications.xml)、[断言记录](../../.recovery-artifacts/mobile-notification-provider-live-20261103/android-ui-readback.json)及[连接原值](../../.recovery-artifacts/mobile-notification-provider-live-20261103/android-connection-proof.json)已保留。iPhone Air 的[画面](../../.recovery-artifacts/mobile-notification-provider-live-20261103/ios-attachments/A73CE15E-0D45-42B0-BCCE-B7D22778C26D.png)、[UI 树](../../.recovery-artifacts/mobile-notification-provider-live-20261103/ios-attachments/FADA1CE2-4943-452E-B0CC-0E74FB632131.txt)、[测试日志](../../.recovery-artifacts/mobile-notification-provider-live-20261103/ios-notification.log)、[结果包](../../.recovery-artifacts/mobile-notification-provider-live-20261103/ios-notification.xcresult)及[断言记录](../../.recovery-artifacts/mobile-notification-provider-live-20261103/ios-ui-readback.json)已保留。

原生输入按实际摘要复用：Android 已验 APK SHA-256 为 `57b3e4ffe3ffe24892ad3790b5e352f9efe2e74d266bbeb965ad4b648beeb87d`，与既有验收清单一致；指定 Air 已安装应用的 59 个文件全部匹配原验收清单。见[原生产物核对](../../.recovery-artifacts/mobile-notification-provider-live-20261103/native-artifact-proof.json)。本轮没有改动原生依赖或工程配置；当前工作区 JS 由现有 Expo／Metro 加载，实际消费真实服务。没有重新编译产品原生工程或声明新增 CI 通过；本轮另建的 XCUITest 测试宿主编译通过。

## 本轮故障事实与资源清理

首次 `pnpm start` 意外触发软件源校验，已停止该进程，包清单和锁文件保持原值；随后使用已安装 Expo CLI。Metro 首次只监听 IPv6，调整本轮进程的 `--dns-result-order=ipv4first` 后使用 IPv4 回环连接，未修改持久网络配置。

Android SDK ADB 37.0.1 的 `libadbmdns_zero_config_driver` 线程在本机崩溃。核对崩溃栈后，本轮独立 ADB 服务使用 `ADB_MDNS=0`、端口 5041，恢复既有模拟器连接并完成页面验收。未替换全局 SDK 或重置模拟器数据；原失败日志与恢复日志均留存在本轮原件目录。

首次凭据扫描发现 Xcode 生成的一份构建环境快照夹带继承的 `FEISHU_HOOK`。已删除本轮精确生成的快照，保留原扫描结果、文件摘要及清理记录，未复制其明文。清理后对本轮原件、三个维护脚本及两仓说明文档再次扫描，实际 Webhook／令牌匹配数为 0。见[首轮扫描](../../.recovery-artifacts/mobile-notification-provider-live-20261103/credential-scan-initial.json)、[缓存清理](../../.recovery-artifacts/mobile-notification-provider-live-20261103/credential-cache-cleanup.json)和[最终扫描](../../.recovery-artifacts/mobile-notification-provider-live-20261103/credential-scan-final.json)。后续启动构建工具须过滤继承的通知凭据环境。

本轮启动的 Metro、独立 ADB 和 Android 模拟器已停止；Android 原先没有应用，已卸载本轮安装；仅移除本轮 iOS 测试宿主，保留原用户应用；指定 Air 恢复初始 Shutdown。连接配置未改。见[资源清理](../../.recovery-artifacts/mobile-notification-provider-live-20261103/native-resource-cleanup.json)和[最终运行态](../../.recovery-artifacts/mobile-notification-provider-live-20261103/target-resource-final.json)。

## 验证命令与数据保护

infra 工作目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。维护脚本的 10 项定向测试及两份语法检查通过，覆盖平台许可、未知不重发、真实业务成功判定、传输边界、清理所有权和脱敏。真实发送使用的运行器摘要冻结为 `d7bc13c4c3e786fb87a8819596d928d549d5131d4777b62d9667f47656e6de87`。发送后仅整理宿主入口的条件分支及未使用导入，执行版本另存[来源台账](../../.recovery-artifacts/mobile-notification-provider-live-20261103/executed-entry-provenance.json)；受影响的 10 项测试及语法检查再次通过，运行器未变。

```sh
rtk proxy node --test scripts/mobile-notification-acceptance.test.mjs
rtk proxy node --check scripts/mobile-notification-acceptance.mjs
rtk proxy node --check scripts/mobile-notification-acceptance.runtime.mjs
rtk proxy node scripts/mobile-notification-acceptance.mjs --phase=inspect --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/mobile-notification-provider-live-20261103
```

检查退出码均为 0。见[最终脚本检查](../../.recovery-artifacts/mobile-notification-provider-live-20261103/script-checks-final.json)及[只读最终检查](../../.recovery-artifacts/mobile-notification-provider-live-20261103/notification-inspect.json)。高成本产品构建和业务全量测试的输入未变，未重复执行。

目标仍为 `desktop-linux`／`thesis-ledger-dev-thesis-ledger-1`，镜像 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`，数据库／角色为 `thesis_ledger`／`thesis_ledger_app`。现有 23 张保护表的原行多重摘要全部保留，变化仅为两条本轮通知；5 条原 Provider 配置保持，临时配置剩余 0，正常路由 `[]`。两条投递及对应健康审计保留。

三仓原有 11,448 个受保护文件摘要全部一致，HEAD／index 均未变化，见[源码保护](../../.recovery-artifacts/mobile-notification-provider-live-20261103/source-protection-final.json)。实际新增源码仅为 infra 的 CLI、运行器和定向测试；主仓产品源码、数据库结构、镜像及依赖未改动。没有暂存、提交、推送或清理既有 WIP。

## 最终一致性复核

| 规格断言 | 实现与验收证据 | 结论 |
| --- | --- | --- |
| AC1 | 原路由空、两份停用临时配置、目标身份及保护基线；凭据扫描及缓存清理事实保留 | 通过 |
| AC2 | Android 一次真实 POST／业务码 0／delivered／一次尝试／真实健康审计／用户确认 | 通过 |
| AC3 | iPhone Air 同等独立真实投递；累计两次、无重发 | 通过 |
| AC4 | Android 实际 API、原生应用、对应关联标识与截图／UI 树 | 通过 |
| AC5 | 指定 Air 独立原生 UI 测试、对应关联标识及结果包 | 通过 |
| AC6 | 精确临时配置清理、真实审计保留、原行／源码／索引保护、运行态及文档核对 | 通过 |

最终复核覆盖本次规格、两仓实施写集、许可台账、失败事实、真实服务／收件／双端消费及数据保护。必要验收均已满足，无剩余阻塞或本任务持有的未完成义务，主仓与 infra Task 可以归档。原迁移历史与 Longbridge 等独立后续范围继续由各自入口维护。
