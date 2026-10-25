# Android 与 iOS 构建及校验工具

本文记录 G6RA/G6RI/G6RC 已交付的构建、校验和可选签名/导出工具。迁移验收按 Spec AC14 使用原生编译、Android Emulator/iOS Simulator、当前源码 CI 和业务实源证据；可选签名/导出操作不构成当前迁移任务或前置条件。当前状态以[迁移 Task](../tasks/2026-10-22-web-mobile-feature-parity.md)为准。

## 模板与入口

- 配置：`apps/mobile/config/release.example.json`。复制到已忽略的 `apps/mobile/config/release.local.json` 后填写目标 API、平台版本、公开证书指纹和 iOS Team/身份信息。
- 环境变量说明：`apps/mobile/config/signing.env.example`。真实密码、私钥不进入 JSON、源码或命令参数；由既有安全环境注入。
- Android 兼容文件模板：`apps/mobile/android/keystore.properties.example`。值全部留空，直接复制不会构成有效签名输入。完整 `ANDROID_*` 环境变量优先于文件配置；统一接续脚本采用环境变量，直接 Gradle 仍支持该文件。
- iOS 导出示例：`apps/mobile/config/ExportOptions.example.plist`。脚本会根据已校验 profile 生成真正的本机导出文件，不能直接把空模板当作已配置。
- 统一入口：`node scripts/mobile-release.mjs`，只有 `plan`、`build`、`verify`，没有上传/分发命令。

两端包标识固定为 `io.github.yzin17.thesisledger.mobile`。模板保留两端实际 `0.1.0/1`；两个版本字段分别管理，接续构建将显式传入版本，校验时须与产物一致。iOS Info.plist 绑定工程版本变量，修正原工程 `1.0` 与实际包 `0.1.0` 不一致的设置，默认实际版本保持。正式签名要求目标部署的真实 HTTPS `/api/v1`，拒绝示例域名、带凭据 URL 和模拟器地址。

iOS 的 `MOBILE_RELEASE_*` 参数只在 App target 绑定版本、Team、身份和 profile，不覆盖 Pods 的版本或签名设置；本机 Xcode 只读设置检查已确认作用域。`ANDROID_KEYSTORE_FILE`、`BUNDLETOOL_JAR`、`IOS_PROVISIONING_PROFILE` 的相对路径以启动命令时的工作目录为基准，进入原生工具前固定为绝对路径，避免 Gradle 切换目录后读错材料。

## 无凭据检查与原生候选

在仓库根目录执行：

```sh
node --test scripts/mobile-release/*.test.mjs
node scripts/mobile-release.mjs plan android --config apps/mobile/config/release.example.json
node scripts/mobile-release.mjs plan ios --config apps/mobile/config/release.example.json
```

`plan` 不读取私钥或编译，只列出缺失输入；字段存在不代表 preflight 或正式签名通过。

显式未签名编译：

```sh
node scripts/mobile-release.mjs build android --unsigned \
  --config apps/mobile/config/release.example.json \
  --out apps/mobile/release/android-unsigned-candidate

node scripts/mobile-release.mjs build ios --unsigned \
  --config apps/mobile/config/release.example.json \
  --out apps/mobile/release/ios-unsigned-candidate
```

输出必须是不存在的新目录；不会覆盖旧包。脚本先构建手机共享依赖，再调用原生工具。Android 未签名准备仅构建 arm64 APK，并核对真实未签名状态、包名、版本及非 debuggable；iOS 使用 `Release/iphoneos` archive 和 `CODE_SIGNING_ALLOWED=NO`，核对设备平台、版本、无 profile 与实际未签名状态。二者都不进行安装。

iOS 可额外传入 `--derived-data` 指向已有本机编译缓存，避免重复编译；新输出目录与旧 archive/回执仍分别保存。该选项只复用明确指定的构建缓存，不是签名材料或安装入口。

Android 需要 SDK、Build Tools、JDK 和 `ANDROID_HOME`/`JAVA_HOME`。iOS 需要 macOS/Xcode 及锁定安装的 Pods；首次在受控构建环境运行 `pod install --deployment`，不要更新锁文件。iOS 使用本地 Xcode 支持的 `release-testing` 或 `app-store-connect` 导出方式。

每次构建生成 `result.json`、日志和候选产物；回执包含实际命令、配置哈希、源文件指纹及产物哈希。构建过程中输入变化即失败。未签名候选中的示例 API 仅用于编译，不代表服务可用。脚本不执行上传；回执中的 `devicePassed`、`signingVerified`、`distributionPassed` 保留实际记录值，当前必需门禁以 Spec/Task 为准。

## Android 可选签名操作

条件：真实 API、JSON 中预先核对的发布证书 SHA-256、完整的 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。脚本通过 `keytool` 只导出公开证书，先检查固定指纹、有效期与非 debug 身份；密码用环境名称传给工具，不放在参数中。

```sh
node scripts/mobile-release.mjs build android --signed \
  --config apps/mobile/config/release.local.json \
  --out apps/mobile/release/android-signed-candidate

node scripts/mobile-release.mjs verify android \
  --config apps/mobile/config/release.local.json \
  --artifact apps/mobile/release/android-signed-candidate/ThesisLedger-signed.apk
```

签名构建默认使用工程配置的架构集合；本轮 arm64 未签名编译不代替所有正式架构验收。APK 通过 `apksigner` 验证密码学签名和唯一签名者，通过 `aapt` 读取包身份/版本与调试标志，并核对证书有效期与固定 SHA-256。

若配置 `android.format=aab`，正式接续还需提供 `BUNDLETOOL_JAR` 指向可信的 bundletool；以 `jarsigner`、公开证书与 bundletool manifest 核验内容覆盖、签名和身份。未签名准备模式只接受 APK，不能以未验证 AAB 替代。无材料的直接 `assembleRelease`/`bundleRelease` 会失败；仅编译时须显式使用 `-PmobileReleaseUnsigned=true`。

该校验只记录本机 APK/AAB 的身份、版本与签名状态；业务运行在 Android Emulator 留证。工具依据[Android 官方签名](https://developer.android.com/studio/publish/app-signing)与[apksigner 文档](https://developer.android.com/tools/apksigner)。

## iOS 可选签名与导出操作

条件：真实 API、Team ID、分发证书 SHA-256、对应的签名身份 SHA-1、钥匙串中有效分发身份，以及 `IOS_PROVISIONING_PROFILE` 指向已在受控环境安装的描述文件。脚本不导入证书、不安装 profile、不登录账号，也不使用 `-allowProvisioningUpdates`。

```sh
node scripts/mobile-release.mjs build ios --signed \
  --config apps/mobile/config/release.local.json \
  --out apps/mobile/release/ios-signed-candidate

node scripts/mobile-release.mjs verify ios \
  --config apps/mobile/config/release.local.json \
  --artifact apps/mobile/release/ios-signed-candidate/ThesisLedger.xcarchive
```

预检绑定 Team、App ID、profile 的 iOS 平台/有效期/证书、分发用途以及钥匙串身份；先生成并检查 signed archive，再本地导出 IPA 并再次校验。导出固定 `destination=export`、`uploadSymbols=false`，不自动更新版本或注册设备。

Ad Hoc 对应 `distribution=ad-hoc` 和 `release-testing`，需要已登记设备的 profile；App Store/TestFlight 对应 `distribution=app-store` 和 `app-store-connect`，profile 不应带 Ad Hoc 设备集合。两者均拒绝 `get-task-allow=true`、企业 profile、错 Team、错包名、过期 profile/证书和错证书指纹。

校验接受 `.app`、`.xcarchive` 或 `.ipa`；要求实际 iPhoneOS/arm64、`codesign --verify --deep --strict`、分发证书、Team 和 entitlements 一致。IPA 只在独立临时目录解包，拒绝路径逃逸、链接、重复条目与过量数据，结束后清理本次临时目录。该结果只描述实际执行的可选操作，业务运行在 iOS Simulator 留证。

材料和渠道条件依据[Apple Ad Hoc 描述文件](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)及本机 `xcodebuild -help`。TestFlight 上传和邀请不包含在此接续脚本中。

## 流水线与当前迁移门禁

`.github/workflows/mobile-release-prepare.yml` 在相关 PR 及隔离分支 `codex/mobile-parity-ci-20261023` 的 push 执行配置/拒绝反例；手动运行默认也只检查，只有显式选择 `prepare_unsigned=true` 才进行对应平台的未签名编译。隔离分支的检查触发按[GitHub 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore)配置。工作流没有 Secret、artifact 上传、应用商店发布或分发步骤。原 CI 增加专属反例测试，Android/iOS 原生 job 保留。

本轮不推送分支或触发远端运行；本机等价命令结果与远端状态分别记录。原 `.github/workflows/release.yml` 的桌面发布行为保持；本说明中的本机工具不执行渠道上传或分发。

G6RA/G6RI/G6RC 保存已交付工具的本机结果。当前迁移仍需补齐远端 CI、M29b/G5A/G5I 业务实源、G6A/G6I 模拟器集成与 G7 最终核对；实际状态以[迁移 Task](../tasks/2026-10-22-web-mobile-feature-parity.md)为准，[当次工具记录](../tasks/evidence/web-mobile-parity/2026-10-25-release-preparation.md)保留历史输入与结果。
