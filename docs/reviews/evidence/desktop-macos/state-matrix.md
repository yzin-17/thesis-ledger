# Desktop release 状态矩阵

## 执行信息

- 日期：2026-08-01
- 产物：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`
- DMG SHA-256：`b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`
- API：`scripts/desktop-qa-fixture.mjs`，只读隔离 fixture，运行在 `127.0.0.1:3000`
- 记录方式：macOS release 窗口的 Computer Use accessibility tree；截图与导航记录位于同目录
- 证据边界：Portfolio、Risk、Import、AI 的状态切换使用当前 DMG；Market 详情五类状态也使用当前重新构建的 DMG，并由 fixture 的 `empty-market`、`error-market`、`stale-market`、`loading-market` 模式逐一注入。

## Desktop 页面状态

| 页面        | ready                                                           | empty                                                         | error                                                                     | stale                                                               | loading                                                       |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Portfolio   | 通过，显示 `¥178,000.00`                                        | 通过，显示 onboarding                                         | 通过，显示“暂时无法读取投资组合”                                          | 通过，显示“数据可能陈旧”和持仓“陈旧”                                | 通过，刷新请求保持 pending 时显示加载骨架                     |
| Market 详情 | 通过，显示实时价、K 线、指标和筹码；`market-release-ready.jpeg` | 通过，显示“暂无数据”和无行情提示；`market-release-empty.jpeg` | 通过，显示“数据读取失败”、错误说明和重试入口；`market-release-error.jpeg` | 通过，quote `stale` 显示“数据可能陈旧”；`market-release-stale.jpeg` | 通过，显示“正在加载”和详情骨架；`market-release-loading.jpeg` |
| Risk        | 直接通过，规则 v2 和测试事件                                    | 直接通过，显示“暂无数据”                                      | 无旧数据起始显示 error；已有数据刷新失败转为 stale                        | 直接通过，已有规则后刷新失败显示“数据可能陈旧”                      | 直接通过，pending 请求时显示“正在加载”                        |
| Import      | 直接通过，显示 pending 草稿                                     | 直接通过，显示“暂无数据”                                      | 无旧数据起始显示 error；已有草稿刷新失败转为 stale                        | 直接通过，已有草稿后刷新失败显示“数据可能陈旧”                      | 直接通过，pending 请求时显示“正在加载”                        |
| AI          | 直接通过，显示研究历史                                          | 直接通过，显示“暂无数据”                                      | 无旧历史起始显示 error；已有历史刷新失败转为 stale                        | 直接通过，已有历史后刷新失败显示“数据可能陈旧”                      | 直接通过，pending 请求时显示“正在加载”                        |

状态切换使用 `/__mode?mode=ready|empty|error|stale|loading`，行情详情额外使用 `empty-market|error-market|stale-market|loading-market`；`error` 切换后点击页面新增的刷新入口，验证已有数据不会被伪装成正常最新值。Market empty/loading/error/stale 的当前 DMG 截图均已归档，详情错误态提供重试入口。

## Android 对照

Android API 35 的 Portfolio/Risk 五类状态与 1080×2400、600×1000 小屏证据仍归档在 `docs/reviews/evidence/mobile-android/`；同一隔离 `fixture-account` 的 Desktop/Mobile 数值和 Risk 事件对照见 `desktop-mobile-fixture-comparison.md`。

该矩阵证明客户端状态组件和注入路径可复核；它不替代真实 Compose、生产数据源、Windows/iOS 目标环境或签名发布门禁。
