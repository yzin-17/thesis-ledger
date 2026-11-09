# 分钟行情自动刷新验证记录

日期：2026-11-09。对应[规格](../../specs/2026-11-09-minute-chart-auto-refresh.md)与[结案任务](../tasks/2026-11-09-minute-chart-auto-refresh.md)。

## 输入与写集

基线为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 的共享未提交工作区；该工作区已有大量其他任务修改。本轮没有提交、重置或回退其他修改。

本轮修改范围：

- 新增 `apps/desktop/src/features/market-detail/useMarketDetailQuery.ts`：负责页面可见性、服务端会话检查及详情查询调度；从原详情组件迁出查询配置，原组件净缩小。
- `MarketDetailDialog.tsx` 接入新查询 hook；`useMarketChartLatestRefresh.ts` 允许盘中请求限定能力；`useMarketChartLatestBoundary.ts` 在整窗刷新成功后清除旧的最新页，防止新数据被旧页遮蔽。保留这些文件已有的其他任务改动。
- 新增 `useMarketDetailQuery.test.tsx`；仅为新增查询调整 `MarketDetailDialog.latest.integration.test.tsx` 的 mock。
- 新增 `apps/desktop/test/minute-auto-refresh-fixture.ts`、`browser-minute-auto-refresh.tsx`、同名 HTML、`minute-auto-refresh.vite.config.mjs` 与 `apps/desktop/scripts/check-minute-auto-refresh.cjs`。浏览器样本只替换行情读取入口，使用实际详情组件、图表、TanStack Query 与刷新生命周期。
- 新增本主题 Spec、任务及本证据；规格导航增加入口。没有修改接口、数据库、来源路由、依赖、原生工程或业务数据。

## 定向验证

| 命令                                                                                 | 输入与结果                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`    | 48 个文件、224 项全部通过。覆盖新增 7 项真实 QueryClient 调度测试及已有详情、图表、手动最新检查和请求竞态回归。 |
| `pnpm --filter @thesis-ledger/desktop build`                                         | 类型检查与 Vite 构建通过。既有大分包提示保留，不作为失败。                                                      |
| `pnpm exec eslint` 后接本轮涉及的查询、详情、刷新 hook、行为测试及浏览器 TS/TSX 路径 | 通过。                                                                                                          |
| `pnpm exec node scripts/check-boundaries.mjs`                                        | 通过。无新的跨 feature 依赖或客户端日历旁路。                                                                   |
| `pnpm exec node scripts/check-workspace-dependencies.mjs`                            | 通过，8 个包。                                                                                                  |
| `pnpm exec node scripts/check-file-size-guardrails.mjs`                              | 通过；6 项既有其他文件尺寸警告，本轮详情组件缩小。                                                              |
| `pnpm exec prettier --write` 后接本轮新增源码、测试与浏览器脚本                      | 只格式化新增文件；文档通过格式检查。                                                                            |

新增调度测试实际覆盖：盘中 60 秒更新且携带 `refresh: true`；固定历史锚点、日线、后台、卸载暂停；分钟周期恢复；闭市/未知状态仅检查会话；服务端开盘后恢复；会话读取失败停更；行情失败保留旧值并恢复；自动刷新未完成时保留曲线与加载；切换标的后旧响应不提交；会话实际边界和有效期到期不沿用 `open`；旧的手动最新页不遮蔽更新。

最初新增测试样本的 `completionStatus` 和报价字段不完整，导致类型检查失败，已修正。测试中的同步 `act` 写法经 lint 检查后改为显式等待微任务；最终测试与 lint 通过。上述失败均属于本轮新增测试样本，未归因于其他任务。

## 受控浏览器

宿主目录 `apps/desktop` 执行：

```sh
pnpm exec vite --config test/minute-auto-refresh.vite.config.mjs
```

仓库根目录执行：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/apps/dsa-web/node_modules/playwright \
MINUTE_REFRESH_CHROMIUM_EXECUTABLE='/tmp/minute-refresh-chromium/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
pnpm exec node apps/desktop/scripts/check-minute-auto-refresh.cjs
```

结果：1440、1024、768、390 四种宽度全部通过。每种宽度均验证实际分钟请求计数增加、图表只有一个刷新圈、原 canvas 保留、完成后加载圈收起、休市暂停、未知暂停、开盘恢复、失败保留及下一周期恢复、日线暂停、切回分钟恢复、Escape 关闭及关闭后停止。弹窗与页面无横向溢出，四种宽度均无 `pageerror`。已人工查看 1440 加载态和 390 更新态截图。

受控时间从 2026-11-09 北京时间 10:30 开始，使用 Playwright clock 推进，浏览器请求由受控行情模块返回。截图与机器结果位于 `/tmp/minute-auto-refresh-qa/`；核心断言及结论由本记录长期保存，临时图片不作为唯一证据。

环境恢复：Playwright 缓存起初没有浏览器，安装下载完成后 JS 解压停滞。保留已下载 ZIP、终止本任务安装进程，使用系统 `ditto` 解压到独立临时目录，随后实际浏览器启动与验收成功。首次探测误拦截开发源码中的 `/src/shared/api/` 模块，已将脚本路由约束为 URL pathname 以 `/api/` 开头，最终四宽验证通过。未修改项目依赖。

## 本地目标运行态

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。入口与目标：`rtk proxy ./scripts/sync-code.sh thesis-ledger`；使用默认配置，没有新增环境覆盖。兼容性预检、宿主 Server 及 workspace 构建、可写层替换和目标重启均成功，退出 0。目标为 `thesis-ledger` 与其 `backtest-worker`，独立只读检查均为 healthy。未执行数据库结构或卷变更。

两项服务镜像 ID 均保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。该入口只同步 Server/workspace 构建产物，不负责 Desktop 静态托管；用户页面由宿主已有 `http://localhost:5173` Vite 服务直接读取当前源码。`http://localhost:3000` 是 API，不是前端站点；其根路径 404 属于实际托管边界。可写层更新不表示镜像更新或生产发布，重建容器后会消失。

独立真实页面验收：通过 `http://localhost:5173/watchlist` 打开招商银行 `600036.SH`，在独立浏览器上下文选择 `1m`，取得真实报价与分钟图。页面显示同花顺报价 `¥43.01`、休市快照；分钟行情来源为 AKShare / 新浪财经，最新分钟为 2026-11-09 15:00，北京时间。网络记录包含独立 `include=quote` 的会话检查与 `barsLimit=90&timeframe=1m&adjustment=none&refresh=1` 的首次详情请求。Escape 关闭成功。真实浏览器截图为 `/tmp/minute-auto-runtime-detail.png`。没有提交表单或改写业务数据。

本次真实核对发生在收盘后。自然盘中来源持续更新未实测；自动调度、停止及恢复由上述真实组件与受控响应验证，不能把它表述成外部 Provider 的盘中实时可用性认证。未运行无关 Server、Mobile 全量测试。

## 一致性审查

AC1–AC3 的调度、请求条件、数据保留和竞态由定向测试及真实组件浏览器验证支撑；AC4 的 Desktop 编译、四宽浏览器与真实休市页面均已核对。无本任务范围内未满足的门禁、未决设计或延期实现；保留自然盘中来源证据边界。当前产品合同继续由活动 Spec 持有。
