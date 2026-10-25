# 手机正式签名与发布准备实施记录

> 历史范围说明（2026-10-25）：本文正文和原始回执保留工具准备执行时的事实；后续用户已取消真机、正式签名/导出及渠道结果验收。正文中的相关未验状态不再构成当前阻塞，也不改写为通过；当前范围见[调整记录](2026-10-25-acceptance-scope.md)，当前任务以[迁移 Task](../../2026-10-22-web-mobile-feature-parity.md)为准。

对应[迁移 Task](../../2026-10-22-web-mobile-feature-parity.md)的 G6RA/G6RI/G6RC 和[签名准备规格](../../../specs/2026-10-22-web-mobile-feature-parity.md#正式签名与发布准备)。本轮用户授权模板、签名校验、接续脚本及无凭据流水线准备，暂不实际上传或分发；不将已有外部门禁改为通过。

## 基线与实施边界

原树 `main/da002744bd317b7754832c6ac41d169bcf005e27`，索引为空，1535 个已有未提交路径。Spec/Task 先行后保存本机 `apps/mobile/release/release-preparation-2026-10-25/实施前工作树.json`；保留既有 WIP，原树不暂存、不提交、不推送。

写集为 Android 构建签名/版本参数及示例、iOS Info.plist/工程版本及 App 签名参数绑定、手机发布配置/导出模板、专属 `scripts/mobile-release*`、新准备工作流、既有 CI 的定向测试入口、忽略规则及直接说明。不改变手机业务源码、实际默认版本/包标识、Server/Worker、数据库、来源/模型/通知配置；不创建长期密钥，不导入证书或登记设备。

原 `e8a258d6` 的 Native CI 属于修改前输入；本轮 Android Gradle、iOS Info.plist 与 Xcode 工程三份原生输入已变化，已按本轮输入分别编译。当前修改未推送，远端新 CI/准备工作流未执行，不使用旧 CI 替代本轮配置验收。M29b、G5A/G5I、完整 G6A/G6I、G7 继续未勾选。

## 交付与边界

- 配置、环境和导出模板位于 `apps/mobile/config/`，兼容 Android 空值 keystore 示例；模板无真实凭据，实际配置/密钥材料及产物被忽略。
- Android Release 无完整正式签名输入即停止，显式 unsigned 模式才允许无密钥候选；Debug 保持。版本参数由构建入口明确传入，包标识不变。
- `scripts/mobile-release.mjs` 分开提供 `plan`、`build --unsigned`、材料到位后的 `build --signed` 与 `verify`。输出目录必须是新目录，回执保存配置、实际命令、源输入及产物哈希；构建中源输入变化即失败。
- Android 使用真实 apksigner/aapt、证书固定指纹/有效期与 non-debuggable 检查；AAB 使用 JAR 签名、固定证书与 bundletool manifest，缺工具在签名前拒绝。
- iOS 校验设备平台/arm64、codesign、固定证书、Team、profile 用途/有效期/证书绑定和 entitlements；IPA 临时解包拒绝路径逃逸、链接、重复条目与过量输入。
- 本机 signed 接续先验 archive，再固定 `destination=export` 导出并验 IPA；没有上传或自动 provisioning 参数。
- iOS 版本/签名参数只绑定 App target，真实 Xcode 只读设置确认 Pods 没有被覆盖；相对签名材料路径在进入原生工具前固定为绝对路径。JSON 解析错误不回显输入片段，跨数据块日志隐藏密码。
- 新工作流默认只检查，显式手动选择才编译 unsigned 候选；无 Secrets、artifact 上传或分发步骤。原 CI 双平台 Native job 保留，并加入专属反例门禁；桌面发布行为不改。

操作步骤与材料条件见[接续说明](../../../guides/2026-10-25-mobile-release-preparation.md)。旧 `release:artifacts` 是通用文件/摘要检查，不能代替新手机正式签名校验。

## 本轮验证

| 项目 | 当前结果 | 证据 |
| --- | --- | --- |
| 定向配置/策略/CLI/安全解包与日志测试 | 16 项通过，包含相对材料路径与畸形配置反例 | `tests-result.json` |
| 严格规范 | 无未使用变量、禁止嵌套三元、复杂度≤20、函数≤220，通过 | `lint-result.json` |
| 依赖边界 | 通过 | `boundaries-result.json` |
| 静态/格式/文档与忽略规则 | 两份 YAML、plist/Xcode 工程、JS/Python、格式、文档路径/尾空白及私有材料忽略共 18 项通过 | `静态与文档复核.json` |
| 限定源码凭据扫描 | 包含两份 iOS 原生配置及环境模板，20/20 通过 | `限定源码凭据扫描.json` |
| Android 缺签名原生拒绝 | Gradle dry-run 因明确缺材料退出 1，预期拒绝通过 | `androidMissing-result.json`；原退出码不改写为 0 |
| Android Debug 原生编译 | arm64 通过，65 秒 | `androidDebug-result.json` |
| Android Release 未签名候选 | 最终入口 arm64 原生编译及接续通过；包名/版本、非 debuggable 与真实未签名状态通过；12:49:12～12:49:57 UTC | `android-unsigned-verified/result.json`，APK `837a4f62…` |
| iOS Simulator Debug 原生编译 | arm64 编译及默认 `0.1.0/1` 通过；12:43:27～12:47:04 UTC，无安装或运行 | `ios-debug-result.json` |
| iOS iPhoneOS Release 未签名 archive | 最终入口设备平台编译、包身份/版本、无 profile 与真实未签名核验通过；12:49:40～12:53:05 UTC | `ios-unsigned-verified/result.json`，目录清单 `563c93b8…` |
| iOS 参数作用域 | App 接受公开测试版本/签名元数据，Pods 未被覆盖 | `iOS版本与签名参数作用域核对.json` |
| 真实非正式产物拒绝 | 真实 SDK 已验证 debug APK 密码学签名有效，但正式策略拒绝；Simulator app 也被拒绝 | `真实非正式产物拒绝核对.json` |
| Android 受控签名校验正向 | 一天有效的临时测试证书：真实签名/固定指纹/版本通过，错指纹和篡改被拒绝；密钥/测试副本已删除 | `Android受控测试签名与校验.json`，正式签名状态仍为 false |
| 正式签名/真实证书与 profile 正向、本机 signed 导出、真机/渠道安装、远端 CI | 未验 | 条件未提供，继续保持未完成 |

最终双端未签名候选的源输入指纹均为 `90d55cb8b2f1e2a71e8f94825fac3c90d1022a27778bec1e76189f434a0ece49`，构建前后均一致。Android APK SHA-256 为 `837a4f6212cc13868353c496449c4a2dfce893dd3c111ce51203e7dfc6ad8d63`；iOS archive 的 60 个文件/链接清单摘要为 `563c93b8a0db1f20a1a1f42ca59e3c5a76d8aa6f7ba0d6c4696d58b3ebc9cb50`，这是目录清单摘要。Debug 原生配置/业务输入未再改变，相关通过证据按输入复用；新接续脚本冻结后两端 Release 均另生成新目录及回执，不覆盖旧候选。

首次 Gradle 配置检查发现版本表达式在 DSL 内求值为 null，已在外层明确求值；首次复杂度检查发现 APK/AAB 校验合并后复杂度 21，已按两种签名/元数据协议拆分。相对路径修复使 CLI 编译函数复杂度达到 22，已提取职责单一的构建环境配置函数，门禁恢复通过；没有提高阈值。原失败日志与后续通过记录分别保留。

iPhoneOS 首次原生 archive 编译成功，后续身份校验明确失败：Xcode 工程 `MARKETING_VERSION=1.0`，但 Info.plist 硬编码 `0.1.0`，使构建参数未真正进入产物。已将 Info.plist 绑定工程版本变量，并把工程默认值对齐既有实际 `0.1.0/1`，模板同步；再将版本/签名参数收敛为仅 App 消费的 `MOBILE_RELEASE_*`，避免全局覆盖 Pods。复用明确指定的原生缓存复验，不覆盖原失败 archive/回执；最终 unsigned 接续与 Simulator Debug 分别通过。原编译通过与接续失败仍独立记录。

首次限定扫描由于隐藏目录映射只扫描 15/17 个候选文件，且漏列环境模板；已修正为非隐藏映射、补齐模板与两份 iOS 配置并断言数量，最终 20/20 通过。文档检查器首次因平台命令路径错误产生假失败，改用文件系统路径核验后通过。原始摘要均保留，不以初次扫描退出 0 宣称覆盖完整。

## 工作树与未通过层级

原 HEAD 与空索引保持。截至 12:55:42 UTC，1529 个非本批已有路径中 1527 个哈希不变，两份研究 Spec/Task 发生并发变化；基线之外新增的研究审计记录包括 `2026-10-25-g3-request-parameter-audit.md` 和 `2026-10-25-g3-reasoning-off-control.md`，均位于 `docs/tasks/evidence/`，属于其他工作；本轮未写入、未回退。原始全树比较保持 `false`，不能称作所有 WIP 逐字节未变；范围及哈希保存在 `工作树与原生输入保护.json`。

G6RA/G6RI/G6RC 只核销本机准备范围。真实 Android keystore 正向、AAB/bundletool 正向、真实 Apple 证书/profile 与 signed archive/export、两端真机和实际读屏、渠道安装/分发、当前源码远端 CI 仍未通过；M29b/G5 的账号、来源、模型、预算、调度和外发条件沿原任务保持。没有自动获取凭据、启用能力或触发业务实源调用。

本机 `apps/mobile/release/release-preparation-2026-10-25/本轮验收结果.json` 汇总冻结源码、分平台结果与未验状态；同目录保留日志、候选和各次输入清单。不覆盖前六批验收包，不公开上传本轮源码、包或证据；本轮没有设备安装或运行验收，旧批次运行证据仍按原输入维护。
