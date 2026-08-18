# V1 Mobile UI E2E 清单

## 执行前提

- Android 真机/模拟器或 iOS 真机/模拟器至少可用一套；记录设备型号、系统版本、屏幕尺寸和构建 SHA-256。
- `EXPO_PUBLIC_API_BASE_URL` 指向隔离的 Investment OS Server，使用与 Desktop 相同的测试账户。
- 测试账号只读；不得把真实凭证或生产数据写入截图和日志。

## 主路径

| 编号 | 操作                                    | 预期结果                                                 | 证据                    |
| ---- | --------------------------------------- | -------------------------------------------------------- | ----------------------- |
| M1   | 冷启动 App                              | 显示 loading，随后读取 Investment OS API，不直接请求 DSA | 网络日志/截图           |
| M2   | 打开 Portfolio                          | 总市值、总成本、累计盈亏和持仓数量与 Desktop 一致        | Desktop/Mobile 对照截图 |
| M3   | 查看持仓                                | 代码、数量、成本、市值、盈亏和 stale 标识可读            | 截图                    |
| M4   | 切换 Risk                               | RiskEvent 的级别、规则版本、消息和市场时间可见           | 截图                    |
| M5   | 点击重新读取                            | 显示 loading；新响应覆盖旧响应，不出现旧数据回写         | 网络日志/录屏           |
| M6   | 注入空组合                              | 显示 empty 提示，不显示伪造的零持仓                      | 截图                    |
| M7   | 让 API 返回 503                         | 显示 error 与可操作的重试入口，既有数据不伪装为最新值    | 截图                    |
| M8   | 返回 `partial=true` 或持仓 `stale=true` | 显示 stale 提示并保留陈旧标记                            | API 响应/截图           |
| M9   | 旋转或使用小屏宽度                      | Tab、状态提示、指标卡和持仓内容不遮挡，必要时可滚动      | 两种尺寸截图            |

## 2026-08-01 Android 执行记录

- 设备：`Android ATD built for arm64`，Android 15 / API 35，1080×2400、420 dpi；M9 另以 600×1000 小屏运行并完成滚动检查。
- 构建：`apps/mobile/release/investment-os-0.1.0-arm64.apk`，SHA-256：`cf4f81ddf9bb46355cc6e68b0e5b6b5a19e30558b3dc232c659215af5576da1e`；AAB SHA-256：`90567f3a84f10f6706cf7b3f073fa2c4f14f2c95a6ee0b95264183f614d6316a`。
- API：临时隔离 fixture 只读账户 `fixture-account`，Android fallback 使用 `http://10.0.2.2:3000/api/v1`；fixture 仅提供测试数据，不含真实凭证或生产数据。
- M1：通过。冷启动先显示“正在加载”，随后显示“数据已更新”，未直接访问 DSA。
- M2：通过。macOS Desktop release 与 Android release 使用同一隔离 `fixture-account`，总市值 `CN¥178,000.00`、总成本 `CN¥160,000.00`、累计盈亏 `CN¥18,000.00`、`600519.SH` 数量 100 和 Risk warning 事件均一致；对照报告见 `docs/reviews/evidence/mobile-android/2026-08-18-desktop-mobile-fixture-comparison.md`。
- M3：通过。持仓代码、数量 100、成本、市值、盈亏和“已估值”均可读。
- M4：通过。Risk 显示 `warning`、规则 v2、测试消息和市场时间。
- M5：通过。slow fixture 下点击“重新读取”可观察 loading，再由新响应覆盖为 ready。
- M6：通过。空组合显示“暂无持仓”，不显示伪造的零持仓卡片。
- M7：通过。503 fixture 显示“读取失败”和“重新读取”入口，并保留此前内容而不伪装为最新值。
- M8：通过。`partial=true`/`stale=true` 显示“数据可能陈旧”，持仓显示“行情陈旧”。
- M9：通过。600×1000 下 Tab、状态提示和指标卡未横向遮挡；向上滚动可访问持仓和刷新控件。
- XML 与 PNG 证据已归档至 `docs/reviews/evidence/mobile-android/`，文件名按状态区分。

## 归档规则

- 至少完成 Android 或 iOS 一套 M1～M9；每个状态注入保存 API 响应和界面截图。
- 记录失败步骤、设备日志、构建版本和重试结果；没有设备或模拟器时不得用 Expo Web 结果替代。
- 只有 checklist 执行完成并能与 Desktop 对照时，才能勾选 T065、T066、T274、T284；本轮四项均有隔离 fixture 对照证据，生产 Compose API 仍由发布门禁单独负责。
