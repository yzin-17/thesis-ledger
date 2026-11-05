# 标的名称原生端验收记录

## 初始现场

2026-11-04：Android `emulator-5554` 已运行且已安装 `io.github.yzin17.thesisledger.mobile`，应用 Debug 标记有效，最后更新时间为当天 14:02:07。指定 iPhone Air `23AB3E1A-4C30-462C-943C-B9CB5B894E96` 已启动，系统为 iOS 26.5，亦已安装同一 bundle identifier 的用户应用。本轮保留原应用、数据和设备状态。

## 最终结果

Android Emulator 与指定 iPhone Air 的实际原生应用分别通过以下八个业务页面的名称断言，并保存原生界面树和截图：

| 页面 | Android | iPhone Air |
| --- | --- | --- |
| 组合持仓 | “华夏成长混合 · 000001.OF” | 同左 |
| 账户持仓 | “华夏成长混合” | 同左 |
| 成交记录 | 名称、代码和原数量/价格正确 | 同左 |
| 账本审计 | 主响应目录名称正确 | 同左 |
| 复盘候选 | 当前目录名称正确 | 同左 |
| 当前定投计划 | 当前计划名称正确 | 同左 |
| 交易列表 | 目录名称正确 | 同左 |
| 交易详情 | 目录名称正确 | 同左 |

Android 通过本轮 UIAutomator 脚本完成八个页面和一个连接检查；九份 XML 均已重新核对断言文本。iOS 的六个核心/账户/定投页面复用 `ios-native-run3.xcresult` 中已通过的逐页断言与附件；该轮后续交易筛选因键盘遮挡失败，原失败保留。交易列表、详情和连接由独立 `testTradeNames` 验收，24.940 秒、1 项、0 失败，`ios-native-trades.xcresult` 为通过结果。没有把原失败的整条 XCTest 序列标为通过。

两端均保留现存 Debug 原生宿主，通过本轮启动的 Metro 加载当前业务 JavaScript。Metro 分别记录 iOS 1844 个模块、Android 1854 个模块的新 bundle；业务组件、名称映射、执行/审计/复盘页面以及依赖清单的 SHA-256 在验收前后保持一致，来源摘要见本轮原件。实际画面来自原生 UIKit/Android View，未使用 Web 渲染或 mock API。

Android 使用 SDK 绝对 ADB 路径，复用已有 ADB 服务与 `tcp:8081` reverse 配置，不改原映射。只执行导航、筛选和查询，没有点击业务写入动作。两端连接保持原值：Android 为 `http://10.0.2.2:3000/api/v1`，iPhone Air 为 `http://127.0.0.1:3000/api/v1`。

## 原生验收过程中的接缝修正

独立 XCTest 工程的现有 scheme 名称为 `ParityAcceptance`，首次入口核对后改用实际 scheme。iOS 第一轮已通过组合名称断言，随后发现测试批量键入让 React Native 受控输入丢字，测试改为逐字符等待准确回显。第二轮进入正确基金账户后遇到短时 HTTP 限流，动态列表快照身份也在页面切换期间失效；已改用稳定谓词查询并等待原限流窗口，不改服务端门禁。Android 已完成，不重复其已通过页面。

已安装 Android APK 与当前构建目录中的 APK 字节摘要不同，分别保留摘要；本轮复用的是设备中现存 Debug 原生宿主，通过新 Metro bundle 验证当前业务源码，不能宣称本轮重新构建了 Android 安装包。iOS 同样复用原应用，仅构建独立 XCTest runner。

## 命令与证据位置

- Metro：在 `apps/mobile` 使用本机已有 Node 26.13.0 执行 `CI=1 pnpm exec expo start --port 8081 --clear`。无安装、依赖升级、数据库升级或目标 Docker 状态变更。
- Android：`python3 .recovery-artifacts/instrument-display-native-20261104/android-ui.py`，退出码 0；脚本动作白名单只允许查询导航与筛选。
- iOS：使用独立的 `ParityAcceptance.xcodeproj`，scheme 为 `ParityAcceptance`，destination 固定指定 Air，`-parallel-testing-enabled NO`；保留六个页面已经通过的原生断言，再用 `-only-testing:ParityAcceptanceUITests/ParityAcceptance/testTradeNames test` 补齐余下页面，退出码 0。仅编译本轮独立 XCTest runner，没有重新构建产品 App 或修改原生工程。
- 原始来源、脚本、XCTest 工程/结果和保全摘要：`.recovery-artifacts/instrument-display-native-20261104/`，属于被忽略的验收产物，不纳入 Git。
- 截图、Android XML、iOS 界面树与结构化报告：`/Users/yzin/.codex/visualizations/2026/11/04/01a1a528-98ca-7b12-98e8-3a004d9f64fc/instrument-display-native/`。`android-report.json` 和 `ios-report.json` 分别持有两端逐页结果；截图与页面名同名。Android 组合、iOS 组合截图已视觉检查，标的名清晰可见。

## 数据保护与清理

七类整表的行数和确定顺序汇总摘要前后完全一致：Asset 4、LedgerEvent 138、Trade 20、JournalReviewSnapshot 4、RecurringFundInvestmentOccurrence 2、NotificationDelivery 2、AiRun 26。Android AsyncStorage 逻辑记录前后均为空，连接保持默认值；iOS 未执行连接保存，结束界面确认原地址。没有模型生成、通知投递、风险扫描、交易写入或数据回填。

本轮 Metro 已停止，独立 iOS 测试 runner 已移除，设备临时 XML 已清理。原 Android/iOS 用户应用保留，两台模拟器均保持最初的运行状态，ADB 及原 reverse 映射保持。产品源码与已有用户工作区修改保持，本轮仅追加验收文档和被忽略的验收原件；未暂存、提交、推送。
