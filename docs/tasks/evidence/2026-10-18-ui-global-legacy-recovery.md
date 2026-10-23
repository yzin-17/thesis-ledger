# 全局控件与兼容 JSON 浮层验收

日期：2026-10-18。对应[全站 UI Task](../2026-09-08-ui-interaction-consistency.md) 的 T6.R1、T6.R2、T4.R2；仍由原 Task 维护当前状态。本记录只覆盖这些入口，不代替 T1–T6/T8 的全量矩阵。

## 输入与运行环境

- 基线为 `main@da002744` 加现有未提交修改。新增产品修复仅涉及 `JournalLegacyJsonReview.tsx`；同批成交验证状态修复见[独立记录](2026-10-18-trade-rule-verification.md)。
- 内部浏览器访问本机 `5174`，API 使用既有 Docker Server `3000`。最终验收使用 Desktop 生产构建 `assets/index-BGHtuTvb.js`，SHA256 为 `6a368ff04befaafac2881f89055b0a1f5282e18cc2e45f3428ea2bdd54d540b0`。
- 本轮没有修改 Server/Worker 生产源码、依赖、数据库或 Docker 配置，因此未重复更新 Docker；本机预览不表示已更新安装版。原数据、凭证、默认模型和数据源政策未通过本轮操作写入。
- 完整原始回执与截图位于 `.recovery-artifacts/ui-global-2026-10-18/`。视口截图使用浏览器原生截图接口，六张 `legacy-layout-*.jpg` 的像素尺寸分别与对应视口一致。

## 已核对的行为

| 入口 | 验收与结果 | 原始证据 |
| --- | --- | --- |
| 全局导航 | `1024×768` 下 Enter 折叠/展开，`aria-expanded` 与按钮中文名称同步；Tab 进入首个导航，反向返回按钮。生产构建在 `1440×900` 再核对折叠与焦点。 | `global-controls.json` |
| 窄屏导航 | `390×844` 按现行合同使用底部横向导航，折叠按钮不适用。连续 Tab 到末项会自动滚动导航，末项位于视口内；反向 Tab 回到投资组合，页面无横向溢出。 | `global-controls.json`、`navigation-keyboard-390.png` |
| 主题与涨跌配色 | 分别通过侧栏和窄屏内容区的可见触发器切换主题，当前页面与账户参数保留。配色选项的选中状态更新，Esc/触发器关闭后焦点返回；窄屏菜单边界完整。最终恢复深色、红涨绿跌。 | `global-controls.json`、`color-menu-light-390.png` |
| 兼容 JSON 本地校验 | 无效 JSON 显示错误，未发分析请求，提交锁释放后可以更正输入。当前兼容入口仍挂载，不与已替代的旧证据编辑器混淆。 | `legacy-browser.json` |
| 兼容 JSON 在途保护 | 提交时冻结文本快照；输入与分析按钮禁用，Esc 与关闭按钮不关闭浮层。原 `pnl: 1` 不因输入事件变成另一份在途请求。 | `legacy-browser.json`、挂载回归 |
| 兼容 JSON 失败与重试 | 请求在浏览器截留并返回 503，输入保留、控件恢复；再次分析的请求体与原请求一致。随后返回受控 200，不访问业务分析服务。 | `legacy-browser.json`、`production-network.json` |
| 长结果与关闭 | 受控结果为 5205 字符。浅深主题分别检查 `390×844`、`1024×768`、`1440×900`，六组均无页面横向溢出，分析与关闭按钮在视口内。结果独立滚动到底；关闭后焦点返回“高级 JSON 兼容分析”。已查看浅深窄屏原图。 | `legacy-layouts.json`、`legacy-layout-*.jpg` |

## 缺陷、修复与验证

原组件允许在请求在途时编辑文本，并在 `onChange` 调用 `analysis.reset()`。这会使按钮重新可用，但原请求仍在途。浏览器受控请求已复现；修改前的挂载回归也复现了重复提交与在途关闭。

修复仅在该组件内增加立即提交锁，mutation 接收提交时的文本快照；请求结束才释放锁。保留原 Schema、旧 number 口径、接口、按钮文案与正常关闭行为，没有增加全局工具或样式。

| 检查 | 结果 |
| --- | --- |
| `rtk pnpm --dir apps/desktop exec vitest run test/journal-legacy-json-interaction.ui.test.tsx` | 2 项通过，覆盖在途竞态、无效输入零请求及失败重试 |
| `rtk pnpm --dir apps/desktop test` | 150 文件、896 项通过；既有研究交互的 `act` 警告保留，没有失败 |
| `rtk pnpm --dir apps/desktop build` | 类型检查与生产构建通过；保留既有大 chunk 提示 |
| 修改源码/测试的定向 ESLint | 通过 |
| `rtk pnpm accessibility:check` | 13 项静态检查通过，不表示全站可访问性实测完成 |
| `rtk proxy node scripts/check-boundaries.mjs` | 通过 |
| `rtk proxy node scripts/check-file-size-guardrails.mjs` | 退出 0，九项既有超限警告；未提供有效基线，不能据此声称证明全仓尺寸无增长。本轮修改的两个产品文件未超限，成交 helper 缩小 |

测试只在 API 边界使用延迟 Promise，调用实际 Query mutation。JSDOM 的共享 Sheet 焦点恢复不稳定，未作为通过证据；该断言由上述实际浏览器结果补足。

首次开发预览仍返回旧 helper 代码，使成交状态的首次浏览器回执与源码不一致；该回执没有计入通过。停止本轮自建 Vite 服务后，统一构建并改用新产物预览，重新确认提交状态与源码一致。最终截图使用浏览器视口控制与原生截图，替换本轮尺寸不匹配的矩阵截图，没有改动历史证据。

## 复用边界与剩余覆盖

| 已有证据组 | 本轮处理 |
| --- | --- |
| 九页 54 组加载完成态、20 个页签 | 保留[原记录](2026-10-17-ui-runtime-closeout.md)，不重拍整站首屏 |
| 账户、交易/现金、基金客户端、持仓、手动策略、普通回测设置、自动化与当前复盘恢复 | 复用原 Task 的 T2.R1–R8、T5.R1、T4.R1，不重复提交 |
| 市场凭证/资料、实验客户端、风险应用受控恢复 | 复用[原记录](2026-10-18-market-strategy-recovery.md)，不重新写配置、执行实验或启用规则 |
| 本轮全局控件与兼容 JSON 入口 | 按上表新增证据；这是部分入口与状态的对应表，不是所有嵌套页面、浮层和状态的穷尽清单 |

正式构建阶段的 Network 回执包含 11 个 API 请求，3 个 POST 的 network ID 均匹配本轮 Fetch 拦截：一个成交更正返回受控 503，两个兼容分析分别返回受控 503/200。真实 AI 生成请求为零，记录未截断。没有修改来源路由或触发故障切换，也没有真实通知、基金 NAV 或外部来源验收。

原始 Task 的全量入口清单、未覆盖结果与异常组合仍开放；真实 AI、通知、来源资格及基金 NAV 按各业务 Task 继续保留。没有新增 TODO 或归档这些义务。验收结束已清除拦截、恢复默认浏览器视口与原主题/配色、关闭本轮标签页，并停止自建预览服务；未提交、未推送。

最终一致性核对：两处产品源码的 SHA256 与构建后记录相同；113 个相关 Markdown 相对文件链接均存在，`git diff --check` 通过，新增和本轮修改的测试/源码及三份记录的 Prettier 检查通过。现行 Task 仍为 12 份正文加两个冻结路径跳转，未把本轮五个局部完成项提升为整份 Task 完成。
