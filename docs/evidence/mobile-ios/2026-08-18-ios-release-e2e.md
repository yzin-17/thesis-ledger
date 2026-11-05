# iOS Simulator Release 运行证据

## 执行信息

- 日期：2026-08-01
- Xcode：`/Applications/Xcode.app` 26.3
- Simulator runtime：iOS 26.3.1（23D8133），`State=Ready`、`Signature=Verified`
- 设备：iPhone 16e，`59C4AC50-D189-4E80-B7E8-FAEB223C1F50`
- Bundle ID：`com.investmentos.mobile`
- 构建目标：`apps/mobile/ios/InvestmentOS.xcworkspace` / `InvestmentOS` / `Release` / `iphonesimulator`

## 构建与启动

使用 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 执行 workspace Release build，结果为 `** BUILD SUCCEEDED **`。构建产物为 `/private/tmp/investment-os-ios-simulator-derived-workspace/Build/Products/Release-iphonesimulator/InvestmentOS.app`，主二进制 SHA-256 为 `fc61e1d53f651fb5a59df45bd3b385f4939e5c54a49241b3c9899b7f3e879161`。

已使用 `xcrun simctl install` 和 `xcrun simctl launch` 安装、启动该 bundle；`simctl listapps` 返回 `com.investmentos.mobile`，Simulator 可访问性树显示真实 RN 页面 `INVESTMENT OS MOBILE`、Portfolio/Risk tabs、刷新控件和 API 状态。

## 运行态

- [ios-26.3.1-release-ready.jpeg](ios-26.3.1-release-ready.jpeg)：连接 `scripts/desktop-qa-fixture.mjs` 的 3000 端口后，Portfolio 显示 `¥178,000.00` 总市值、`¥160,000.00` 总成本、`¥18,000.00` 累计盈亏和 `600519.SH` 持仓，状态为“数据已更新”。
- [ios-26.3.1-release-error-state.jpeg](ios-26.3.1-release-error-state.jpeg)：API 未运行时，页面显示“读取失败”和可读的 fetch error；该截图用于验证错误状态，不冒充生产 API。

## 兼容性修复记录

- ExpoModulesJSI 57.0.4 通过 pnpm patch 使用 `Swift.abs` 消除 Xcode 26.3 的类型推断错误。
- ExpoModulesCore 57.0.8 通过显式弱引用 `@unchecked Sendable` wrapper 传递 emitter identity，消除 Swift 6 actor closure 的 data-race 编译错误。
- Podfile 对 ExpoModulesCore 保留 `SWIFT_STRICT_CONCURRENCY=minimal`，作为 SDK 57 在 Xcode 26.3 上的兼容配置。

该证据满足 T275 的本地 release build + Simulator 运行条件；TestFlight、真机签名和 App Store 发布仍属于 T294 的外部发布门禁。
