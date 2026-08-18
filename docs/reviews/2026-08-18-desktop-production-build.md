# Desktop 生产构建 Review

## 已完成

- `apps/desktop/electron/main.cjs` 提供 Electron BrowserWindow、生产静态资源服务和 `/api` 代理；`INVESTMENT_OS_API_URL` 用于环境切换，默认值仅用于本机开发。
- `apps/desktop/package.json` 增加 `package:mac`、`package:mac:dir` 和 `package:win`，Electron 与 electron-builder 版本固定在 lockfile，并通过 workspace override 固定 `@electron/get` 版本。
- `pnpm --filter @investment-os/desktop package:mac` 成功生成未签名 `apps/desktop/release/Investment OS-0.1.0-arm64.dmg`；`hdiutil verify` 校验通过。
- `pnpm --filter @investment-os/desktop package:win` 成功生成 `apps/desktop/release/Investment OS Setup 0.1.0.exe` 和对应 blockmap；构建时曾生成 x64 `win-unpacked` 目录，收尾阶段为释放 Docker 宿主机空间已删除该中间目录，最终安装包保留。
- 最新产物 SHA-256：DMG `b76d8236dccd70ed30ccc65c2b7c0d8905e23b857cdcb7282fc1cffe7b1474df`；EXE `de892f6c5d4ad7e279e102a17c0e7b7390462752dc7c6a073d31758eaa974927`。
- `pnpm release:artifacts` 会重复核对上述 DMG/EXE 与 Mobile APK/AAB 的文件大小、SHA-256、Android JS bundle 和 arm64 单架构内容；该脚本不替代签名或目标平台安装。
- 2026-08-01 已挂载 DMG 并直接启动 `Investment OS.app`；Electron 本地静态服务返回 `127.0.0.1:64131/`，通过本地 mock API 完成首次启动、创建账户、录入 `600519.SH`、Portfolio 估值显示和 8 个主导航页面核对。该次烟测证明 macOS 包可安装启动，但 API 为 mock，且 Windows 目标平台仍未安装启动。
- 2026-08-01 后续使用同一隔离 `fixture-account` 重新启动 DMG，真实窗口通过桌面控制观察到 Portfolio：总市值 `¥178,000.00`、总成本 `¥160,000.00`、累计浮盈亏 `¥18,000.00`、`600519.SH` 数量 100；切换 Risk 后观察到 `warning`、规则 v2、测试风险事件和市场时间。切换 fixture 到 `partial=true`/`stale=true` 与 503 后分别观察到 stale 和 error 状态，截图已归档至 `docs/reviews/evidence/desktop-macos/`。
- 2026-08-01 再次将 release DMG 的 `/api` 代理指向运行中的 Docker Compose Server，完成 Portfolio、Import 草稿/提交、Risk 规则、Strategy/Backtest、Journal、AI 和 Provider/Automation 页面烟测；真实 API、窗口尺寸和操作记录见 `docs/reviews/evidence/desktop-macos/2026-08-18-compose-release-e2e.md`。
- `.github/workflows/ci.yml` 已增加手动或 `v*` tag 触发的 macOS/Windows Desktop installer job：分别在 `macos-14` 和 `windows-2025` runner 执行 package script、校验 DMG/NSIS SHA-256 并上传完整 release 目录；签名和 notarization 通过 `DESKTOP_CSC_*`、`APPLE_*` secrets 注入，不提供 secrets 时仍明确产出未签名验收包。

## 仍需发布门禁

当前环境没有 Developer ID/Windows 证书，产物未签名；也没有在 Windows 主机安装 NSIS 产物或在 macOS Finder 中完成安装启动 smoke。T272 的配置和双平台产物已经可复现，但跨平台安装/启动和签名验收仍交由 Release owner 在目标平台完成，不能用本机交叉打包替代。

生产启动需要为 Electron 进程设置 `INVESTMENT_OS_API_URL`，例如 `https://investment-os.example.com`；API 代理只转发 `/api/*`，不会让客户端直连 DSA。
