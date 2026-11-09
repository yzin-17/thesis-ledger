# 自选日内分时修复证据

规格：[AC11](../specs/2026-11-07-market-intraday-sources.md#自选日内分时修复)。状态：[W1、W2](../tasks/2026-11-07-market-intraday-sources.md#自选日内分时修复)。日期：2026-11-08。

## 根因与修复

截图入口为自选表格 `WatchlistTrend`，此前港美详情图表的验收没有覆盖此入口。510300.SH 的分钟路由仍为 efinance / eastmoney → yfinance / yfinance，策略 192。只读预检发现：Server 保存的应用投影仍将主源记为有效，但 DSA 实时有效投影已将主源标为 `eligible=false / upstream_failure`；备用仍有效。目录 `ready` 与运行资格不同，不能据目录推断读取成功。

`supportsBasicPriceFallback` 只支持日线，导致分钟能力预检返回不可用，选择器也无法在主源失败后使用既有备用。修复该公共判断，允许中港美股票和 ETF 的精确 1/5/15/30/60 分钟不复权交互价格整段回退；能力预检与真实选择器共用规则，返回实际备用来源。日线原有语义校验保留，来源数据不拼接。检查三个消费者：冻结窗口选择器仍在入口拒绝非日线，故未扩大冻结或回测边界。

生产代码仅修改 `apps/server/src/market/market-basic-price-fallback.ts`；新增定向回归 `apps/server/test/market/market-minute-fallback.test.ts`。不改 Desktop 渲染、DSA、配置、数据库结构或历史事实。

## 本地验证

- 四文件定向测试：33 项通过。新增 8 项覆盖五周期预检、目录/资格/口径拒绝、主源熔断与主源读取失败两种整段备用，以及错标的、周期、窗口、修订拒绝。最后补充窗口反例后单独重跑新文件，8 项通过。
- `pnpm --filter @thesis-ledger/server test`：510 文件通过，4048 项通过；91 文件、404 项按既有环境条件跳过，未将这些计为通过。
- `pnpm --filter @thesis-ledger/server build` 通过；修改文件 ESLint、`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs` 通过，尺寸检查保留 6 项既有警告。
- 修改未增加模块依赖；核查既有禁止按供应商名称决定备用的边界门禁仍适用，不新增名单或例外。最后仅添加测试反例，生产输入未变，未重复整包构建或完整测试。

原始日志位于 `/tmp/watchlist-fallback-tests.log`、`/tmp/watchlist-fallback-final.log`、`/tmp/watchlist-server-tests.log`、`/tmp/watchlist-server-build.log` 及 `/tmp/watchlist-{lint,boundaries,dependencies,sizes}.log`。临时文件可能随系统清理，必要结果在本文保留。

## 目标运行与真实读取

从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，退出 0；Server、Worker 通过健康检查，独立检查容器编译模块包含原生分钟判断。镜像 ID 保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。这是容器可写层代码同步，容器重建后恢复镜像内容，未声称新镜像发布。

更新后 `GET /api/market/510300.SH/chart-options?timeframe=1m` 返回不复权可用、`availableVia=backup`。

随后只进行一次与自选列相同的真实业务请求：

```text
GET /api/market/510300.SH/detail?include=bars&timeframe=1m&adjustment=none&chartContractVersion=3&barsLimit=400&navLimit=20
```

结果约 4.21 秒，`sections.bars.status=ready`；标的 510300.SH、ETF、1m、不复权，来源 yfinance / yfinance、`routeIndex=1`、策略 192、非缓存。返回 400 点，默认回看 7 天并按上限截取：11 月 5 日 161 点、11 月 6 日 239 点。最近日从 09:30 至 14:57，末点原始收盘价 `4.124000072479248`，原始精度保留；不补造收盘集合竞价或缺失分钟，不声称全天完整。

响应输入摘要 `4db205e142cbd805ae66a9f466a6dd879167dc7344412f3f4e1655b3203b1a61`；响应文件 SHA-256 `1f2755ae8bc992bf1adc83912de4dda95f9cfdd03cfebd769577f31013629073`。请求与响应在 `/tmp/watchlist-intraday-fix/detail.json`。本轮没有重新请求 efinance 或富途，没有改策略主备顺序、购买服务或新增费用。efinance 仍有熔断条件，本次成功仅证明 Yahoo 备用读取。

同步前后只读比较 31 张账户、资产、成交、账本、策略、日志及自选相关表，共 4118 行，数量与内容摘要一致；策略仍为 192，全部路由逐项相同。

## 实际页面验收

使用当前 `http://127.0.0.1:5173/watchlist` 的实际 Vite 页面与真实自选条目，浏览器为 Microsoft Edge，时区 Asia/Shanghai。通过浏览器受控响应复用上面的真实分钟响应；未替换页面或自选组件，没有新增 Provider 读取。其他价格、日线及账户请求主动阻断，因此截图中的报价/日线网络错误属于隔离验收条件，不作为这些功能的新结论。

- 先复用更新前不可用的能力响应，确认未绘制分时；切换到更新后真实能力响应，点击「刷新自选」，分时恢复。
- 在同一页面缩放至 1440、1024、768、390；均为真实 `WatchlistTable` / `WatchlistTrend`，显示最近交易日 239 点、2 条包含线段的 SVG 路径，午休断开，未补造中间点。
- 来源显示为现有映射的 `yfinance`，截止时间 `2026/11/06 14:57`；旧不可用提示消失。页面无横向溢出，窄屏曲线有效宽度 330 像素。
- 点击分时打开详情，URL 选中原自选条目，Esc 关闭恢复。页面无脚本异常。

记录与四宽截图在 `/tmp/watchlist-intraday-fix/browser.json`、`browser.log`、`watchlist-{1440,1024,768,390}.png`。浏览器仅消费已取得响应；详情导航不代表重新验证详情行情，周末历史样本不证明盘中连续刷新、所有证券或所有来源可用。

## 最终审查

AC11、W1 和 W2 的代码、定向反例、目标模块、真实业务请求及自选页面一致。原 efinance 超时与熔断事实保留；本轮未重跑此前港美 20 份来源数据，未更改账本或自选业务记录，未提交 Git。用户可点击「刷新自选」清除旧能力缓存并显示分时。
