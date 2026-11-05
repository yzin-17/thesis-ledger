# 手机双端 AI 配置原值保存验收

## 当前状态与授权

用户明确批准“最多6次及双端原值保存”后，已按[迁移Task](../../../archive/tasks/2026-10-22-web-mobile-feature-parity.md)顺序通过G5AVA、G5AVI。[当前源码CI](2026-10-30-current-source-ci.md)继续按未变功能输入复用。Android与指定iPhone Air各完成一次真实原生保存，本轮新增模型请求为0，没有分配或恢复剩余调用额度。完整G5A/G5I、G6A/G6I和G7仍未通过。

Android从真实原生界面对现有OpenRouter/free执行一次验证并保存；仅研究和策略分析两个用途，合计最多6次实际模型请求、费用上限0 USD，每次最多8192输出Token、总期限600秒，关闭文本回退，整次失败不再提交。成功后，iPhone Air只有在最新计划pending为空、maxCalls为0时才原值保存一次，模型请求固定0。两次保存均保留现有凭证、模型、参数、用途、启停及默认引用值。

## 输入与并发责任

获准前最近计划为当前openrouter配置修订 `2026-10-29T17:31:31.285Z`，输入指纹 `bf000b7d346aa5eaa34ce9f23581c76bf01d639d3947804cd32008101f12d6c7`，计划指纹 `53a1149a1747e0c11f8e7014cae7923138f0c5425ade387b0e8717f7283bd0f2`。待验用途为strategy_authoring_analysis及research，均为auto，maxCalls为6、费用估算0 USD；执行前再次核对实际返回，不把估算当成调用结果。

[原配置范围准备](../2026-10-30-ai-config-next-acceptance-scope.md)的同配置操作随后在执行。首次只读数据库基线发现当前pending请求，本轮尚未派发即停在守卫；待该次操作完成后复用其两条匹配记录，没有重复启动用途验证。其operationId为 `2eec9969-af8e-4b33-9d75-b007ec56b231`，strategy_authoring_analysis与research均以native_schema通过，两个请求分别报告668/3221、243/497输入/输出Token，各为provider_reported的0 USD。它们不计入手机本次新增调用，也不由手机Task代收原责任叶的完整验收。

重新核对时，配置修订为 `2026-10-30T06:33:11.629Z`，计划指纹 `97efb5b2efb143a10ff5b7f516bd513df6e7381bc2bed9501f378d8f2d6ae4c8`，pending为空、maxCalls为0。业务输入、凭证、模型和默认引用与获准原值一致；auto策略的解析mode属于验证结果。网关因此进一步限定为零调用保存，拒绝test-and-save、连接检查、模型目录、默认设置写入和来源等端点，分别要求两端先取得自己的零调用计划，再各放行一次原值POST；转发真实字节，没有fixture或请求内容替换。

## 双端真实结果

| 平台 | 独立结果 | 持久化修订 |
| --- | --- | --- |
| Android API37 | 安装APK与已验归档匹配；原生编辑页一次保存、成功反馈、两用途指纹/ready/passed、默认和API/actual保持通过 | `2026-10-30T06:53:48.691Z` |
| iPhone Air | UDID `23AB3E1A-4C30-462C-943C-B9CB5B894E96`，iOS26.5/23F77；已装59文件匹配；独立XCUITest一项通过，168.959秒，14份附件均绑定该Air | `2026-10-30T07:12:43.798Z` |

两端均实际显示“配置已保存。用途就绪与实时验证结果请返回列表查看。”，截图已目视核对。最终SDK反读与Air保存响应一致，研究默认仍为openrouter/free、修订7，两个用途均ready/passed。网关共23个真实转发请求，其中两次配置保存，其余为许可的读取和零副作用计划；两次自动估值GET被409拦截，模型端点派发0，来源探测/路由目录/任务/通知写入均0。

Android初轮工具已完成保存和成功反馈，后续错误地用界面未展示的research-generation-v2定位，读取断言失败。改按实际用途指纹进行只读接续后通过，没有再次保存。Air没有复制Android结果，也没有因工具问题重发配置请求。

## 数据保护与比较边界

以下表数量统计限定于本机数据库-before.json至数据库-after-ios.json的保存窗口，后续既有后台运行不并入该窗口。

84表的严格比较并非全部相等：AccountValuationPoint新增44行，AutomationRun与AutomationRunLease各新增22行，均关联既有valuation-intraday-sample的scheduled窗口。三表原有1528/855/855行的数量及完整摘要逐一保持；原六任务稳定配置摘要仍为 `6cb03b0826a181eb46f3ddd0eb3deeaa6f1e29402833e9ddd8018caa20234fcf`。测试任务仍停用且只有原成功历史，未重建或执行。

旧612条健康审计逐行保持；新增一条为DSA既有scheduled健康检查，新AI验证记录为0。其他非动态表完整摘要保持。五个项目容器身份、镜像、环境、挂载及infra环境摘要保持；没有部署或重启服务。

五份配置的密文摘要和业务列全部保持。Android保存新增modelDefaults={}和modelReasoning={}两个空映射，因此存储settings严格摘要不等；公开参数相同，按既有默认解析语义只将这两个空映射视为缺省后，其余存储字段摘要与原值精确一致。原严格失败及等值核对均保留，没有宣称原始JSON逐字节不变。Air保存前后该存储投影未再变化。

## 保护与证据边界

只允许本次配置原值保存及其用途验证、操作/健康审计和用量记录；业务、旧报告/材料、默认引用值及密文保持。来源请求、行情路由/目录、任务和通知未获扩展授权。原树不提交或推送，不重复已过CI、原生编译、Scheduler或D59报告消费。

本机原始材料保存在忽略目录 `apps/mobile/release/acceptance-ai-save-2026-10-30/`，包括预算与写集授权、首次并发观察、前后公共配置/84表基线、两次真实保存请求与响应、Android原生树/截图、Air的xcresult/14附件、双端保存最终证据、空映射差异核对、后台变化与旧数据核对、自动化稳定配置核对和资源收尾。

Android原生工具曾因ADB37.0.1的libadbmdns线程崩溃而无法连接；本机CrashReport定位后，以仅当前进程的ADB_MDNS=0启动成功，SDK二进制、系统及Shell配置均未修改。相关启动条件见[AOSP源码](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/client/main.cpp)，37.0.1后端变更见[官方说明](https://developer.android.com/tools/releases/platform-tools)。本轮只停止自有Android只读副本、恢复Air的初始Shutdown并停止自有Metro/网关；真实API保留，ADB全局服务保留。

应用源码和原生输入未改，已验CI/编译按输入复用，原树不提交或推送。G5AVA/G5AVI只核销当前同值保存及证明消费；来源/账号、真实路由/目录写入和真实通知仍需各自范围、权限、预算或渠道条件，父门禁与最终Review继续未勾选。本次6次上限没有消耗，授权随这两个保存动作结束，不转用于其他动作。
