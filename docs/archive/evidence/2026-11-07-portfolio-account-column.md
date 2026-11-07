# 持仓账户列与单项操作宽度验收

## 结果与范围

组合概览的持仓账户列采用 8rem 最小宽度，单个行情详情操作列通过现有组件的 className 组合采用 7rem。DOM、账户名称、未知账户回退、业务计算、请求、排序与原始精度保持；共享操作列及其他消费者沿用现有约定。

PortfolioPositionTable 只有 PortfolioDashboard 一个产品消费者。桌面端另一个账户表列位于交易周期，已有不换行样式；账户选择器、单账户页面和 Mobile 列表未发现同一列压缩问题，保留原实现。共享 TableContainer 已提供容器滚动，本轮只组合原子类。

## 基线与实际测量

基线生产资源位于 `/tmp/goal-portfolio-account-column-before-dist`，包含上一轮公共导航修复。两轮使用同一组经实际 Schema 校验的隔离业务响应，运行真实 App、Router、TanStack Query、API client 与生产资源。

| 屏宽 | 基线普通账户列 / 行数 / 行高 | 当前普通账户列 / 行数 / 行高 | 基线 → 当前操作列 |
| --- | --- | --- | --- |
| 1440 | 122.30px / 1 / 56.64px | 172.98px / 1 / 56.64px | 205.16px → 112px |
| 1024、768、390 | 48.52px / 5 / 116.5px | 128px / 1 / 56.64px | 160px → 112px |

普通账户、长中文、连续英文、未知账户完整回退、无持仓共 5 种情况乘四宽，每轮 20 场景。基线 29 项阅读宽度、折行及单项操作列检查不满足目标，当前 0 项。长文本保留全部原文，宽表在容器内部滚动，文档不横向溢出。

## 浏览器交互

维护入口 `apps/desktop/scripts/check-portfolio-account-column.cjs`，隔离响应归属 `apps/desktop/test/portfolio-account-column-fixtures.cjs`。每轮覆盖表头与单元格宽度一致、文字位于单元格内、操作按钮边界及滚动后固定列位置；普通账户额外检查市值排序双向切换、刷新期间保留原行和居中加载状态、请求结束后恢复、键盘 Enter 打开详情、详情失败与关闭后的原行保持。无持仓仅展示一次现有空状态，不出现详情按钮。

结果为 `/tmp/goal-portfolio-account-{baseline,current}-browser/results.json`，每轮 28 张实际截图。人工检查 1440 普通、1024 长中文、768 未知回退、390 普通和连续英文，以及窄屏详情与刷新截图；详情边界和截图等待其入场动画完成。

每轮 112 个受控业务 GET，以及详情负向场景中预设的 16 个 503 响应。写入、真实外部请求、未知响应和未捕获异常均为 0；预设失败只验证详情恢复边界，来源资格与真实行情仍按原任务独立验收。

## 最终验证

| 验证 | 结果 |
| --- | --- |
| 定向回归 | 4 文件、22 项通过，`/tmp/goal-portfolio-account-focused.json` |
| Node 24 定向 | 同一 4 文件、22 项通过，`/tmp/goal-portfolio-account-node24.json`；在完整包与构建结束后独立执行 |
| Desktop 完整包 | 254 文件、1620 项通过，`/tmp/goal-portfolio-account-full.json` |
| 生产构建 | 类型检查及 Vite 构建通过，`/tmp/goal-portfolio-account-build.log`；保留原有大 chunk 提示 |
| 静态检查 | 所改 PortfolioOverview 的 ESLint、三份源码/脚本格式、两个 CJS 的 Node 24 语法和触及 diff 空白检查通过 |
| 仓库门禁 | Node 24 boundaries、workspace dependencies、`GUARDRAIL_BASE_REF=HEAD` 尺寸门禁通过，6 个既有告警未增加 |
| 体积保护 | 入口静态闭包 1,215,702 字节，相对按需加载前基线减少 57.40%，`/tmp/goal-portfolio-account-bundle.json` |
| 稳定输入与复用 | 完整包前后 2000 个 Desktop 输入无增删或哈希变化；282 个 Mobile、2562 个 Server/Domain/共享输入与上一轮相同，复用 Domain 767、Mobile 222 项及对应构建，见[共享稳定证据](../../evidence/2026-11-07-fund-daily-decimal-display.md#最终验证) |

输入为 `/tmp/goal-portfolio-account-desktop-inputs-before.json` 与 `/tmp/goal-portfolio-account-desktop-inputs-after-browser.json`，复用清单 `/tmp/goal-portfolio-account-reuse.json`，独立维护脚本哈希 `/tmp/goal-portfolio-account-extra-inputs.json`。维护脚本补充等待详情动画后仅重跑浏览器两轮；产品、测试与构建输入保持一致。

本轮未执行 Docker、数据库、真实行情、模型、通知、提交、推送或发布；用户 5173 服务保持运行。整个工作区已有的其他修改继续保留，局部验收不等同于目标运行态或全部活动任务关闭。全线程 Goal 继续。

## 维护命令

定向回归由 Desktop 目录执行 `pnpm exec vitest run test/portfolio-table.test.tsx test/portfolio-closed-dashboard.test.tsx test/portfolio-account-filter.ui.test.tsx test/global-mode-account-journey.ui.test.tsx`；Node 24 使用相同 Vitest 入口和文件集。仓库根目录执行 `pnpm --filter @thesis-ledger/desktop exec vitest run`、`pnpm --filter @thesis-ledger/desktop build`。结果重定向到上述日志及 JSON。

浏览器命令为 `node apps/desktop/scripts/check-portfolio-account-column.cjs <本地生产资源URL> <baseline|current> <输出目录>`，通过 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 指定已安装运行时。仓库门禁分别执行 `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` 和 `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`，均使用 Node 24。
