# iPhone Air Runtime 安装与报告消费验收

## 结果与范围

2026-10-30 用户明确允许下载、安装支持 iPhone Air 的 iOS Runtime，并继续 iOS 验收和手机迁移。安装成功后，指定 Air 的两项独立 XCUITest 均通过，核销[迁移 Task](../../../archive/tasks/2026-10-22-web-mobile-feature-parity.md)的 G5RPI。Android G5RPA 的结果独立保留，完整 G5A/G5I、G6A/G6I、G7 与最终 Review 继续未勾选。

本次只安装开发 Runtime、运行已验 App 的当前 JS 和读取既有真实结果。模型调用、来源探测、业务配置写入和通知发送均为 0；Air验收结束后，用户另行批准精确快照的公开推送及限定CI修复，最新进展由[当前源码CI](2026-10-30-current-source-ci.md)记录。[本轮接续](2026-10-30-resume.md)保留源码修复、Android、部署和剩余条件的完整记录。

## Runtime 与设备绑定

- 正式命令：`xcodebuild -downloadPlatform iOS -buildVersion 26.5 -architectureVariant arm64`，北京时间 12:35:57～12:51:00，退出 0。
- `simctl` 注册 iOS26.5、build `23F77`，可用且 supportedDeviceTypes 包含 iPhone Air；Xcode Components 显示 iOS26.5 Simulator 8.49GB。既有 iOS27.1 保留。
- 目标为 `iPhone Air`，UDID `23AB3E1A-4C30-462C-943C-B9CB5B894E96`。该默认设备由安装流程建立，验收前已存在且为 Shutdown；没有使用其他机型替代。
- App 使用既有 `acceptance-batch5-2026-10-25/ThesisLedger-ios-simulator.app` 归档。安装前目标无该 App；安装后 59 个文件逐一与归档一致，差异 0。App 原生输入未变，沿用已验编译事实；本次编译的是独立 XCUITest 工具，不是新的 App Native compile。
- 当前 iOS Bundle 返回 200，SHA256 `797c2d9afd4e89dcb2c902bfdb7b7507e9d666e554085a261625ebf53159bddf`，包含新报告审计接口和全部冻结材料入口。

## 独立原生验收

执行指定 Air 的 `ParityAcceptance` scheme，关闭并行测试、限定两个用例，使用 arm64、无签名的本机测试工具。`xcodebuild test` 退出 0，两个用例共 170.820 秒、失败 0；整个命令北京时间 12:52:46～12:55:56。

| 用例 | 实际断言 | 结果 |
| --- | --- | --- |
| `test40ReadSavedReport` | 初始 API/actual，切模拟、打开 D59、显式刷新、结论/实际模型/5数值、逐一打开11材料、工具审计、历史重开、实际范围不含该报告、恢复 API/actual | 通过，106.564秒 |
| `test41ReadConfigurationProof` | 重新启动后读取默认模型/用途证明，显式重读配置、目录和来源注册表，返回后核对 API/actual | 通过，64.255秒 |

读取同一 D59 run `e55cf8da-a0db-4617-80ff-350111e804e6`。实际模型为 `openrouter / nvidia/nemotron-3.5-super-vl:free`、研究修订7；结构化数值 1354、1330.75、1349.99、1356、1330.01 与持久化报告一致。11份材料全部可达并匹配各自工具调用ID；保留冻结材料中的覆盖不完整等限制信息。

当前默认为 `openrouter / openrouter/free`、修订7。research-generation-v2 的 ready/最近 passed 证明及配置指纹 `54af17d91e5d190f7dee514a10f9c42bc70b119356ee79a5965f829f399a7372` 可读。目录为 ready、第22代、35851个标的，两次状态读取一致；本轮没有启动同步或验证保存。

## 实际请求与数据保护

App 使用本机3351读取网关，原样转发到真实目标3000。网关限定已审阅的保存报告、账户列表、配置、目录状态及来源注册表的 GET；不提供替换响应。共记录34次请求：30次真实转发均200，4次App自动估值GET被409拦截，防止触发来源调用。没有业务写方法、外部主机或旧 `/ai/runs/:id/tool-calls` 请求。

正文三次读取的原始字节 SHA256 均为 `cb23232dbe59b97f873f197a97d5cf05c8c4e574af0b1ea1260e4b721fd7cbfe`，与 SDK 反读一致；11份材料的原始字节摘要逐一一致；新报告工具接口读取及历史重开均200。实际范围历史独立读取，原生界面确认不包含模拟报告。48份截图/状态树附件均绑定该 Air，代表性截图已人工目视核对。

验收前后使用只读事务核对11张表，数量全部保持，AiRun仍15、AiToolCall仍165、账户28、账本事件138。10张表的完整摘要保持；AutomationJob仍7行，动态调度字段导致完整摘要变化。另按既有算法核对原六任务稳定配置，摘要仍为 `6cb03b0826a181eb46f3ddd0eb3deeaa6f1e29402833e9ddd8018caa20234fcf`；独立测试任务仍停用，唯一成功历史仍为原run。五个容器的ID、镜像、环境和挂载，以及infra环境文件摘要保持。

准备期间，非手机责任方依据独立授权于12:43完成AI测试审计修复的正式快更，见[其目标证据](../2026-10-30-nonmobile-evidence-reconciliation.md#connection-target)。Air测试在其后执行；本轮再以只读方式核对Server/Worker各4个报告读取编译模块，与当前宿主均一致。该并发目标叶已通过，手机端未重复同步或模型调用。

本轮Metro/网关经PID、参数、目录和进程组核对后停止，8081/3351不再监听，真实API3000保留。Air恢复初始Shutdown状态，Runtime和App保留。三仓HEAD/索引及并发WIP按最终保护回执核对，不提交、推送或回退。

## 证据位置与验收边界

本机原始材料位于忽略目录 `apps/mobile/release/acceptance-air-2026-10-30/`，包括：

- `Runtime安装确认.json`、`runtime-download-result.json`、`iPhoneAir安装基线.json`：安装退出码、运行时支持、设备及59文件绑定。
- `iOS独立验收结果.json`、同名前缀日志及 `.xcresult`、`ios-air-evidence/manifest.json`：两个用例和48份独立原生附件。
- `iPhoneAir真实报告消费.json`、`iOS网关对照.json`、`iOS网关原始记录.json`、`真实报告读取.json`：界面断言、实际请求及逐材料摘要对照。
- `运行态-before.json`、`运行态-after.json`、`数据保护对照.json`、`自动化稳定配置核对.json`、`资源收尾.json`、`原树最终保护.json`：数据、运行环境、资源和工作区保护。
- `双角色代码绑定.json`、`CI待批输入对照.json`：并发快更后报告模块绑定，以及既有待批快照未变、当前增量仅文档的核对。

只核销 G5RPI 的报告与配置证明读取。AI配置验证保存、来源/账号探测、真实路由/目录写入、真实通知和当前源码CI的完成条件保持；旧授权、只读成功、Runtime安装及本机工具编译均不扩大这些条件。
