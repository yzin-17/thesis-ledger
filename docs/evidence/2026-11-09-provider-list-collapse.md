# 数据源列表折叠与边界清理验收

## 结果与范围

`MarketProviderPanel.tsx` 移除外层 Card 及重复“数据源”标题，保留来源统计、凭证提示和共享刷新区域；条目之间保留分隔线。

`MarketProviderRow.tsx` 沿用项目已有原生 `details/summary` 模式。每个来源的上游和完整能力明细默认折叠，名称、配置来源、健康状态、能力数量及启用/凭证/检查/移除操作继续可见。点击摘要独立展开，键盘可折叠；能力标签在窄屏按可用宽度换行。没有新增依赖、传统 CSS、接口或数据写入。

## 验证

执行目录：`apps/desktop`，使用当前含其他任务改动的工作区；本次仅修改上述两个业务文件与本报告。

- `pnpm exec vitest run test/market-data-provider-ui.test.tsx test/market-provider-capabilities.test.tsx test/market-local-history.test.tsx test/market-provider-enabled.test.ts test/market-experiment-recovery.ui.test.tsx`：5 个文件、30 项通过。
- `pnpm build`：TypeScript 和 Vite build 通过，存在既有大包体积提示。
- 本任务业务文件 `git diff --check`：通过。

实际浏览器使用 Playwright 与本机 Microsoft Edge，访问 `http://127.0.0.1:5173/market-data`，后端为当前 Docker 服务。1440、1024、768、390 四种宽度全部确认：29 个来源初始均折叠；没有外层 Card 或重复标题；AKShare 可独立展开显示完整上游和能力；Space 可收起；凭证弹窗可打开并用 Escape 取消；整页横向溢出均为 0。

首次浏览器复核发现 390 宽度展开标签造成 46px 横向溢出；为能力 Badge 组合 `h-auto max-w-full whitespace-normal wrap-anywhere` 后，四种宽度复核及最终测试/build 通过。临时截图在 `/tmp/provider-collapse-{width}.png` 与 `/tmp/provider-expanded-{width}.png`，已检查桌面折叠及窄屏展开效果。

未点击启用、检查、移除或提交凭证，真实业务数据未改。本次验收针对宿主 Vite 页面，未同步 Docker、重建镜像或打包原生客户端；代码未提交。
