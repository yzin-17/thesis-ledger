# 移动端运行时 Review

## 已完成

- `apps/mobile` 已切换为 Expo/React Native 目标，包含 `app.json`、Metro/Babel 配置、Android/iOS native 目录和 EAS production profile。
- `src/App.tsx` 提供只读 Portfolio/Risk 页面、Investment OS API 配置、统一 loading/empty/error/stale 状态、陈旧行情标识和可访问 tab/刷新控件。
- `EXPO_PUBLIC_API_BASE_URL` 是唯一 API 地址入口；默认值只用于本机开发，客户端不直接调用 DSA；平台 fallback 由 `resolveMobileApiBaseUrl` 统一解析并由 Mobile 测试覆盖。
- 开发 fallback 会在 Android emulator 使用 `10.0.2.2` 访问宿主机，iOS simulator/Web 使用 `127.0.0.1`；真机和所有 release 构建仍必须显式配置 `EXPO_PUBLIC_API_BASE_URL`，不把 fallback 当作生产地址。
- Expo SDK 57 依赖已对齐到 `react@19.2.3`、`react-dom@19.2.3`、`react-native@0.86.2`、`react-native-web@0.21.2`；`expo install --check` 已通过。
- `pnpm --filter @investment-os/mobile typecheck`、`build`、`test` 和 `export:web` 已通过；Expo web bundle 已输出到本地 `dist`。状态与运行时配置测试现为 6 项，覆盖平台 API 地址解析、loading/empty/ready/stale/error 与并发刷新旧响应保护。
- Android 原生 release 已实际完成：使用临时 Adoptium JDK 17、官方 NDK `27.0.12077973`、单一 `arm64-v8a` 目标生成 APK/AAB；最新产物为 `apps/mobile/release/investment-os-0.1.0-arm64.apk`（SHA-256：`cf4f81ddf9bb46355cc6e68b0e5b6b5a19e30558b3dc232c659215af5576da1e`）和 `apps/mobile/release/investment-os-0.1.0.aab`（SHA-256：`90567f3a84f10f6706cf7b3f073fa2c4f14f2c95a6ee0b95264183f614d6316a`）。`aapt2 dump badging` 核对了包名 `com.investmentos.mobile`、版本 `0.1.0`、compile/target SDK 36、min SDK 24；该 release 仍使用本地 debug signing，已安装到 API 35 ATD 模拟器并完成隔离 fixture smoke。
- Android signing 配置已改为支持 `apps/mobile/android/keystore.properties` 或 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`；缺少真实密钥时才显式回退 debug key，示例见 `apps/mobile/android/keystore.properties.example`。本轮用临时 JDK 17 执行 `:app:assembleRelease` 已通过 Gradle 配置与 `validateSigningRelease`，随后在 native 合并阶段因宿主机 `No space left on device` 失败，未把失败产物当作 release 验收证据。
- 随后把 ABI 限制为 `arm64-v8a`、将 Gradle/Android/Kotlin 用户目录移到临时目录重试，构建仍在 D8 `mergeExtDexRelease` 阶段因 `No space left on device` 失败；本轮临时目录和 Android build 输出已清理，已有 APK/AAB 保留不变。
- 2026-08-01 重新使用 Android Studio 内置 JDK 17 完成当前源码的 `:app:assembleRelease :app:bundleRelease -PreactNativeArchitectures=arm64-v8a`；release APK/AAB 已通过 `pnpm release:artifacts`，最新 SHA-256 分别为 `cf4f81ddf9bb46355cc6e68b0e5b6b5a19e30558b3dc232c659215af5576da1e` 和 `90567f3a84f10f6706cf7b3f073fa2c4f14f2c95a6ee0b95264183f614d6316a`。
- 为支持仅本机开发 fallback 的 Android emulator HTTP 访问，主 manifest 增加 network security config，仅允许 `10.0.2.2`、`127.0.0.1` 和 `localhost` 明文；其他域名仍需 HTTPS，生产构建仍应显式设置 `EXPO_PUBLIC_API_BASE_URL`。

## 设备门禁

- `expo run:android -- --no-install` 已完成 native prebuild，但本机没有连接 Android 设备或可启动的 emulator。
- 为解除设备门禁曾临时安装 Android 35/30 default 与 Android 30 AOSP ATD arm64 系统镜像并创建 AVD；Android 35 emulator 需要约 7.3 GiB userdata，Android 30 default/ATD 镜像本身均约 3.1 GiB，均因宿主机空间不足无法启动。所有本轮新装镜像均已移除，NDK 已从临时归档恢复，SDK 当前未留下临时 AVD 或系统镜像。
- `expo run:ios -- --no-install` 已完成 native prebuild；临时 CocoaPods 1.15.2 已成功执行 `pod install`，生成 `apps/mobile/ios/Podfile.lock` 和完整 Pods 集成。全局 `xcode-select` 仍指向 CommandLineTools，因此所有 Xcode 命令显式使用 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`。
- 2026-08-01 已按授权删除旧的 iOS 26.0.1 runtime，并使用官方 `xcodebuild -downloadPlatform iOS` 安装 iOS 26.3.1（23D8133）；`simctl runtime list -v` 显示 State=Ready、Signature=Verified，iPhone 16e `59C4AC50-D189-4E80-B7E8-FAEB223C1F50` 可 Boot。此前 `.xcodeproj` 直构建因未加载 Pods module map 失败，改用 `.xcworkspace` 后已进入完整 native 编译。
- Xcode 26.3 将 ExpoModulesCore 编译为 Swift 6，Expo SDK 57 的 EventEmitter 捕获在 `sending 'emitter' risks causing data races` 处失败；已通过 `patches/expo-modules-jsi@57.0.4.patch` 修复 `Swift.abs` 推断，并在 `apps/mobile/ios/Podfile` 对 ExpoModulesCore 设置 `SWIFT_STRICT_CONCURRENCY=minimal`，再通过 `patches/expo-modules-core@57.0.8.patch` 使用显式弱引用 `@unchecked Sendable` wrapper 消除 actor closure 检查。workspace Release build 已成功，产物主二进制 SHA-256 为 `fc61e1d53f651fb5a59df45bd3b385f4939e5c54a49241b3c9899b7f3e879161`；已安装并启动 `com.investmentos.mobile` 到 iPhone 16e，连接 fixture API 后 Portfolio ready 页面显示总市值 `¥178,000.00`、总成本 `¥160,000.00`、累计盈亏 `¥18,000.00`。ready/error 截图与完整命令证据见 `docs/reviews/evidence/mobile-ios/2026-08-18-ios-release-e2e.md`。
- 服务端已增加 `CORS_ORIGINS` 配置并纳入 Compose/.env.example；Docker Desktop 重启后已重新完成 `/health`、`/integrity`、数据库/Redis 集成、DSA failover、V1 核心 E2E 和灾备恢复 smoke。跨源浏览器验收仍需目标环境复核；已有 Desktop Vite `/api` 代理可作为本地开发替代，但不等同于生产 CORS 验收。
- 2026-08-01 Android 运行态已恢复：设备为 `Android ATD built for arm64`、Android 15/API 35、1080×2400、420 dpi。通过 `adb install` 安装最新 release APK 后，冷启动成功读取 `http://10.0.2.2:3000/api/v1` fixture；Portfolio 显示总市值 `CN¥178,000.00`、总成本 `CN¥160,000.00`、累计盈亏 `CN¥18,000.00` 和 `600519.SH`，Risk 显示 `warning`、规则 v2、测试消息及市场时间。macOS Desktop release 同时读取同一 `fixture-account`，完成了跨端字段和状态对照。
- 同一只读 fixture 注入并归档了 loading、empty、503 error、`partial=true`/`stale=true` 及 600×1000 小屏滚动证据；证据文件位于 `docs/reviews/evidence/mobile-android/`。小屏下 Tab、状态提示、指标卡和持仓仍可通过滚动访问；Desktop/Mobile 使用同一真实测试账户的最终 UI 对照仍是 T066 的剩余门禁。

因此 T065、T066、T274、T275 和 T284 的隔离测试账户及 Android/Desktop/iOS 运行态门禁已有可复核证据；真实 Compose/生产账户、真机签名和 TestFlight 仍不替代发布验收。
