# Desktop 与 Mobile 隔离测试账户对照

## 执行信息

- 日期：2026-08-01
- 测试账户：`fixture-account`（只读隔离 fixture，不含真实凭证或生产数据）
- API：同一台主机上的 `Investment OS API` 兼容测试端点；Desktop release 通过 `127.0.0.1:3000`，Android release 通过 emulator 映射地址 `10.0.2.2:3000`。
- Desktop 构建：`apps/desktop/release/Investment OS-0.1.0-arm64.dmg`，SHA-256 `b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`。
- Mobile 构建：`apps/mobile/release/investment-os-0.1.0-arm64.apk`，SHA-256 `cf4f81ddf9bb46355cc6e68b0e5b6b5a19e30558b3dc232c659215af5576da1e`。

## 对照结果

| 字段     | Desktop release                                                       | Android release                                                       | 结果 |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ---- |
| 总市值   | `CN¥178,000.00`                                                       | `CN¥178,000.00`                                                       | 一致 |
| 总成本   | `CN¥160,000.00`                                                       | `CN¥160,000.00`                                                       | 一致 |
| 累计盈亏 | `CN¥18,000.00`                                                        | `CN¥18,000.00`                                                        | 一致 |
| 持仓     | `600519.SH`，数量 100，成本 `CN¥1,600.00`                             | `600519.SH`，数量 100，成本 `CN¥1,600.00`                             | 一致 |
| Risk     | `warning`、规则 v2、测试风险事件、市场时间 `2026-08-01T00:00:00.000Z` | `warning`、规则 v2、测试风险事件、市场时间 `2026-08-01T00:00:00.000Z` | 一致 |

## 状态对照

- Desktop release：切换 fixture 为 `partial=true`/`stale=true` 后显示“数据可能陈旧”和持仓“陈旧”；503 后显示“暂时无法读取投资组合”及“重新加载”。
- Android release：同一 fixture 注入后显示“数据可能陈旧”和“行情陈旧”；503 后显示“读取失败”和“重新读取”。
- ready、stale、error 的 Desktop 截图见 `docs/reviews/evidence/desktop-macos/`；Mobile XML/PNG 见本目录中的 `investment-os-mobile-ready.*`、`investment-os-mobile-stale-final.*` 和 `investment-os-mobile-error-final.*`。

该报告证明同一隔离测试账户在两个 release 客户端的字段、数值和状态契约一致；不替代真实 Compose API、生产凭证、签名和 Windows/iOS 目标环境验收。
