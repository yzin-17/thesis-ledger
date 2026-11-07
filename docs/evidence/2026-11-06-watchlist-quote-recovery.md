# 自选名称交互与 ETF 报价恢复

## 本次修改

`apps/desktop/src/features/watchlist/WatchlistTable.tsx` 中标的详情按钮由现有 `link` 变体改为 `ghost`。名称和代码不再出现悬停下划线，保留原 DOM、点击逻辑、指针、悬停底色和键盘焦点环；共享 Button、其他链接、Mobile 和收益趋势文件未修改。该文件原本即为工作区未跟踪文件，本次只修改这一处变体。

## 根因与正式配置

2026-11-06 的目标 Server `http://127.0.0.1:3000` 策略修订 188 已应用。CN / ETF / REALTIME_QUOTE 只选择 `hithink / fund-market-snapshot`，有效目标为 `eligible=false, reason=upstream_failure`。DSA 控制层对来源健康记录中的开放熔断器返回该原因；缓存控制将无合格来源映射为 `not_eligible`，自选因此显示横线和“行情来源不符合条件”。不是标的代码错误或列表丢失已有价格。

只读核对正式来源目录及 Provider 配置：`tencent / tencent` 的同一精确报价能力为 ready，Provider 已配置、已启用、不需要凭据。经标准 `PUT /api/market-data/policy` 增量增加腾讯备用目标，同花顺仍为首选；使用 `expectedRevision=188`，新修订为 189，保存及回读均为 applied。逐项比较其余路由和全局 enabled 均未变化。有效投影仍拒绝同花顺，腾讯为 eligible=true。本次没有更新凭据、购买权益、重置熔断、放宽质量校验或执行受限来源探测。

配置请求及前后回读保存在本机 `/tmp/watchlist-policy-change.json`、`/tmp/watchlist-policy-after.json`。这是当前开发配置变更，无 Server/DSA 源码、数据库结构或 Docker 运行态更新；未构建或发布镜像。

## 真实数据与页面

使用现有自选条目调用 `POST /api/v1/watchlist/prices`，返回 `kind=quote`：

| 字段 | 实际结果 |
| --- | --- |
| 标的 | 沪深300ETF华泰柏瑞 / 510300.SH |
| 价格 / 前收 | 4.124 / 4.195 CNY |
| 页面涨跌幅 | -1.69% |
| 来源 | tencent / tencent |
| 来源时间 | 2026-11-06T08:14:52Z（北京时间 16:14:52） |
| 首次抓取时间 | 2026-11-06T16:16:57.202665Z |
| 状态 | stale=true，fallbackUsed=true，servedFromCache=false |
| 量额 | null，单位 unknown |

原始接口响应在 `/tmp/watchlist-real-prices.json`。陈旧状态和来源时间原样保留，页面显示“行情陈旧”。后续浏览器从正式自选接口读取，未用受控价格替换。

隔离无头 Chromium 访问现有 Vite `http://127.0.0.1:5173/watchlist`，覆盖 1440、1024、768、390 宽度；四张截图均已人工查看。名称和代码在悬停时的 text-decoration 都为 none，指针为 pointer；键盘焦点环可见，报价和涨跌幅可见，无整页横向溢出。390 宽度按 Enter 打开详情、Escape 关闭，详情位于视口内，关闭后 item 查询参数清除。为避免附带受限来源调用，验收拦截详情额外行情请求和业务写入；详情内容的数据加载不计入本次验收。

浏览器脚本、结构化结果及截图在 `/tmp/watchlist-fix-browser.cjs`、`/tmp/watchlist-fix-browser.json`、`/tmp/watchlist-fix-{1440,1024,768,390}.png`。它们为本机临时验收产物，不跟踪生成图片。

## 本地验证边界

- 在 `apps/desktop` 执行 `pnpm exec vitest run test/watchlist.ui.test.tsx`：3 项通过（包含既有 React act 提示），日志 `/tmp/watchlist-fix-targeted.log`。
- 在 `apps/desktop` 执行 `pnpm exec tsc -p tsconfig.json --noEmit`：退出 0，日志 `/tmp/watchlist-fix-typecheck.log`。
- 本次局部 diff 空白检查通过。
- 首次误用 `pnpm --filter @thesis-ledger/desktop test -- test/watchlist.ui.test.tsx`，Vitest 将分隔符后参数忽略而运行全包：218 文件 / 1258 项通过、9 文件 / 50 项失败；日志 `/tmp/watchlist-fix-tests.log`。失败包含 Node 26 环境的 localStorage 不可用及其衍生断言；工作区同时有独立任务处理 Node 版本与全包测试。本次未修改相关文件、未重复运行全包、未把此结果归因于单行样式修复，也未宣称完整构建或整仓门禁通过。
- 使用 shadcn skill 核对锁定 CLI、现有 Base UI Button 变体和[官方按钮文档](https://ui.shadcn.com/docs/components/base/button)。未新增依赖或组件、未提交。

## 分组栏长分隔线补充修复

用户补充要求移除“全部 / 未分组”下方横贯整栏的浅灰线，保留选中态短下划线。对照 `MarketDataSectionTabs`、`StrategyCenterLayout` 和共享 Tabs 后，仅从 `WatchlistPage.tsx` 分组栏外层删除 `border-b`，共享组件与原 Tabs 语义保留。

`pnpm exec vitest run test/watchlist.ui.test.tsx` 再次 3 项通过，日志 `/tmp/watchlist-divider-test.log`。实际 Vite 页面在 1440、1024、768、390 宽度检查外层 border-bottom 为 0px、选中态伪元素高度 2px / opacity=1，无页面横向溢出；方向键与 Enter 切组、焦点环正常。截图等待切组加载和动画完成，四张均人工查看。浏览器本轮复用上次真实报价响应作为受控样本，不新增来源实读、不写业务数据。脚本、结果和截图为 `/tmp/watchlist-divider-browser.cjs`、`/tmp/watchlist-divider-browser.json`、`/tmp/watchlist-divider-{1440,1024,768,390}.png`。局部差异空白检查通过。
