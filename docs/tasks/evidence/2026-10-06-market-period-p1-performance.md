# 行情周期 P1 性能验收证据

验收日期：2026-10-06（Asia/Shanghai）；记录时间：01:24:50。对应[原 Task](../2026-09-16-market-chart-period-aggregation.md) 的 P1 与[完整 Spec](../../specs/2026-09-16-market-chart-period-aggregation.md) 的 AC11。

## 结论

P1 通过。生产构建的真实图表组件在 500 点负载下完成 40 次周期切换，全部采样均未观察到 `longtask` 条目（该接口报告 50ms 及以上任务），因此没有观察到 >200ms 主线程长任务。真实 Desktop 生产页面的四次派生周期切换分别只请求对应周期的详情窗口；额外能力元数据请求不含行情点，没有客户端拉取全量日线的调用。

500 点性能实验与真实 API 请求实验独立进行。前者使用受控展示夹具，后者消费实际目标 Server/DSA 返回的 `159516.SZ` 数据，不能把夹具写成 Provider 来源事实。原始精度、采样范围、请求标识与参数保存在[原始采样数据](2026-10-06-market-period-p1-samples.json)。R1 仍待执行。

## 设备、浏览器与构建

| 项目 | 实际记录 |
| --- | --- |
| 设备 | `Mac14,3`，Apple M2，8 个逻辑核心，16 GiB 内存 |
| 系统 | macOS 27.0.1，构建 `26A434` |
| 浏览器 | Codex In-app Browser；页面 UA 为 `Chrome/154.0.0.0`，使用 Chromium 引擎 |
| 视口 | 1280 × 720，`devicePixelRatio=2`，`hardwareConcurrency=8` |
| 执行条件 | 所有正式样本的 `document.visibilityState=visible`；未配置 CPU 或网络限速 |
| Git HEAD | `514abeebfe57bac0c16271439d8b777ff3b02a9f`；保留当前未提交工作，HEAD 不能单独标识构建 |
| 负载页面 | `http://127.0.0.1:4174/test/market-period-benchmark.html`，Vite 生产构建 |
| 真实请求页面 | `http://127.0.0.1:4175/market-data`，复用 G1 最终 Desktop 生产构建 |
| 请求目标 | Vite preview 继承现有 `/api` 代理至本地 Server；Server 消费目标 DSA |

UA 中的 Intel 与旧 macOS 字样是浏览器报告值，设备与操作系统以宿主机 `sysctl` / `sw_vers` 实测为准。预览代理继承关系经已安装 Vite 的 `resolvePreviewOptions` 实现核对。

| 输入或产物 | SHA-256 |
| --- | --- |
| `test/market-period-benchmark.tsx` | `96f92bdeed0a9bda9cc4a69270aaa5f58a32a54c1c0bae6318ed5f140f46336a` |
| `test/tsconfig.market-period-benchmark.json` | `ee4b57b79429a4a0651f8d6dd764742f8f0dbb4cb6379d9d5414e91657b9b887` |
| `scripts/build-market-period-benchmark.mjs` | `80fd7db589e538042e36d1e60809f15e2262a4f5eaa3270adc99561ffcc10275` |
| `src/features/market-detail/MarketDetailCharts.tsx` | `9529e601f453f17ddd27cb637e75652bc91b56affdd4bd320e40868090139a13` |
| `src/features/market-detail/MarketPriceLightweightChart.tsx` | `4f35bb745e1b9a71e25ed0e05a4dac8c7478e003e9707d99ba57b5284df66933` |
| `src/features/market-detail/MarketPeriodSelection.tsx` | `2c8e53754009fff6ee8eb4f70c8937c4cfe43d1cdb716ea3bc6d1c3defb618c9` |
| `src/features/market-detail/market-chart-model.ts` | `9cc61aafff505bf07004fae16ae7ed7257097c282aad1f3355c39f31e585d99e` |
| `src/features/market-detail/market-chart-preferences.ts` | `0ec6fb9607add31c5f6de14e3ca34a039561fb202583a13305180b3f7363f144` |
| `src/features/market-detail/MarketDetailSections.tsx` | `fb01fc02e55c286564f92d847d45c41c569d6d30be73969a1b434e78f5a40502` |
| `src/features/market-detail/MarketDetailDialog.tsx` | `d830c8b5035353ed125734de8cba55d5dc8f8a5d4bba74b3e09216fe3f9ca1f0` |
| `packages/api-client/src/market-display-client.ts` | `778d56a3a7ff5771ea1ca1cc2413bdae8c000559b164a305256deeaf0a922e09` |
| 基准 HTML | `ce810d17a7eac69eb0fc04f4943423c906971b0fe21e7932ba5a2b3c59eeb064` |
| 基准 `market-period-benchmark-Cmuvqf37.js` | `0d240cc502715e5316f5a81e1993b1760c9ea9d000cb2ceb4fd217c302f1cb27` |
| 基准 `market-period-benchmark-DCM7UX_n.css` | `65ce79f221eb97ef48b8e996f320e617bd9e7bcadd2a9c2046d413b8c398bd27` |
| 生产 `dist/index.html` | `3a7ed1d38fd058d80bf5afc492b9034aa6db07d8ecb7eac5d7d0bf8410acd5dd` |
| 生产 `index-BUBdPcJH.js` | `18cb48258b6203e977a7a266e3f4ffe60f77c1155060402a953b06275c4d8bdc` |
| 生产 `index-BbfpC90L.css` | `5ca9d9a8b295ad71a3cd81e3807a159963597ac566ae43d520cf767cda14a045` |

源码路径除单独标明的 SDK 外均相对 `apps/desktop/`。基准产物位于 `/private/tmp/thesis-ledger-market-period-benchmark/`。浏览器 DOM 中的实际脚本路径分别为 `/assets/market-period-benchmark-Cmuvqf37.js` 与 `/assets/index-BUBdPcJH.js`；页面使用生产 bundle，未使用开发 HMR 脚本。消费组件与 SDK 输入摘要仍匹配[G1 最终记录](2026-10-06-market-period-g1-browser-acceptance.md)。

## 500 点受控采样

基准复用 `MarketPeriodSelection`、`MarketPriceChart`、`LightweightMarketChart` 及其实际控件。每次切换重新生成 500 个价格点与 MA、MACD、RSI 各 500 个展示点，并经过实际图表模型与绘图路径。数据使用虚构标的 `PERIOD_BENCHMARK.SZ` 与人工日期、数值，只用于展示负载。能力缓存预置且一小时内保持新鲜，避免向业务 API 请求虚构标的。

先通过 UI 选择「全部已加载」，确认日期范围覆盖全部 500 点；所有正式样本的 `visibleRange=0`。按 `5d → 1w → 1mo → 1y` 循环五轮，MACD 与 RSI 副图各采 20 次。每次都经 UI 点击周期按钮；采样从捕获阶段的 `pointerdown` 开始，第二次 `requestAnimationFrame` 后继续观察 1000ms，完成前通过 `PerformanceObserver.takeRecords()` 排空未派发的长任务条目。以起止时间与任务区间是否重叠筛选条目，保留原始浮点精度进行 >200ms 判定。

初始页面加载样本 0 不属于周期切换，单独排除：其第二帧时间 211ms、最长长任务 138ms，且当时尚未选择全量视区。正式样本编号 1–40 完整连续，无丢失；每个样本均为 500 个价格点、三组 500 个指标点、可见页面、支持 `longtask`。

| 副图 | 周期 | 五次第二帧时间（ms，展示到 0.1） | 50ms 及以上长任务数 |
| --- | --- | --- | --- |
| MACD | 5d | 43.7 / 33.6 / 28.8 / 26.8 / 28.7 | 0 |
| MACD | 1w | 91.5 / 32.5 / 27.7 / 31.5 / 29.0 | 0 |
| MACD | 1mo | 34.0 / 27.3 / 29.7 / 32.8 / 28.7 | 0 |
| MACD | 1y | 29.6 / 32.5 / 33.3 / 29.9 / 29.1 | 0 |
| RSI | 5d | 40.2 / 31.3 / 28.6 / 31.9 / 36.7 | 0 |
| RSI | 1w | 30.1 / 33.1 / 31.5 / 29.4 / 28.4 | 0 |
| RSI | 1mo | 33.3 / 30.2 / 34.7 / 28.5 / 29.0 | 0 |
| RSI | 1y | 31.1 / 29.3 / 28.7 / 28.4 / 27.8 | 0 |

第二帧时间范围 26.8–91.5ms，按最近秩方法得到 P50 29.9ms、P95 40.2ms。该时间是帧回调代理指标，不是网络延迟、实际屏幕呈现时间或端到端交互指标。没有长任务条目不能表述为主线程耗时 0ms；本门禁结论限于所记录设备、负载、交互及约一秒的每次观察窗口。

夹具页面在正式切换范围内的 Network 请求数为 0，事件未截断；这一结果只用于证明负载实验没有请求真实虚构标的，API 请求门禁以以下真实页面实验为依据。

## 真实生产页面请求

生产页面从实际标的目录打开 `159516.SZ`，选择前复权。初始日线详情是独立基线请求，不计入派生周期切换。四次切换使用 CDP `Network.requestWillBeSent / responseReceived / loadingFailed` 逐段捕获，游标范围均完整，`truncated=false`、`hasMore=false`，无失败请求。未进行响应拦截或夹具注入。

| 选择周期 | 详情 requestId | 请求 timeframe / barsLimit | HTTP | 响应周期 / 点数 |
| --- | --- | --- | --- | --- |
| 5 日线 | `87275.27` | `5d / 90` | 200 | `5d / 90` |
| 周线 | `87275.29` | `1w / 90` | 200 | `1w / 90` |
| 月线 | `87275.31` | `1mo / 90` | 200 | `1mo / 39` |
| 年线 | `87275.33` | `1y / 2` | 200 | `1y / 2` |

详情端点均为 `/api/market/159516.SZ/detail`，`chartContractVersion=3`、`adjustment=qfq`、`navLimit=90`、`refresh=1`。指标参数为 `fast=12, slow=26, signal=9, short=6, mid=12, long=24`。响应 `barSeries.contractVersion=3`；页面显示「服务端派生 · 基础来源 tencent」。月线与年线实际可得点数少于 500，不将其写成 500 点真实 Provider 性能实验。

每次切换另有一条 `/api/market/159516.SZ/chart-options` 请求：标识依次为 `87275.26 / .28 / .30 / .32`，HTTP 均为 200，前三次 `barsLimit=90`、年线 `barsLimit=2`。该响应顶层为 `contractVersion / symbol / mode / window / options / plan`，没有 `barSeries / points / bars`，属于能力元数据，不是日线数据拉取。四次切换共有 8 条请求，其中 4 条详情请求均为新周期窗口，无 `timeframe=1d` 或缺省日线的追加详情请求，无全量日线请求。

实时行情的路由不可用、年度指标空值与降级提示仍按实际能力显示，未将这些分段记为来源成功。目标运行态的部署与契约基线沿用 G1，本轮仅启动宿主机生产预览，没有 Docker、数据库或路由状态变更。

## 验证与留存

| 输入范围 | 最终命令（Shell 使用 `rtk proxy` 包装） | 结果 |
| --- | --- | --- |
| Desktop 源码 | `pnpm --filter @thesis-ledger/desktop typecheck` | exit 0 |
| 基准及其消费闭包 | `pnpm --filter @thesis-ledger/desktop exec tsc -p test/tsconfig.market-period-benchmark.json --noEmit` | exit 0 |
| 基准生产产物 | `pnpm --filter @thesis-ledger/desktop exec node scripts/build-market-period-benchmark.mjs` | exit 0；最终 2.88s |
| 基准源码 | `pnpm exec eslint apps/desktop/test/market-period-benchmark.tsx` | exit 0 |
| 文件尺寸 | `GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs` | exit 0，9 项未增长的既有告警 |
| 局部 diff | `git diff --check -- apps/desktop/test/market-period-benchmark.tsx apps/desktop/test/tsconfig.market-period-benchmark.json docs/tasks/2026-09-16-market-chart-period-aggregation.md docs/tasks/evidence/2026-10-06-market-period-p1-performance.md docs/tasks/evidence/2026-10-06-market-period-p1-samples.json` | exit 0 |
| 两个浏览器页面 | `tab.dev.logs({levels:['warn','error']})` | 均为空 |

原 Desktop tsconfig 的输入仅为 `src`，新增独立基准 tsconfig，使 `test/market-period-benchmark.tsx` 也接受类型检查。首次独立检查发现夹具来源字段可为 `undefined`，已通过明确的 `BenchmarkBar` 类型收紧；运行逻辑未改变。最终重建的 JavaScript 与实测时逐字节同 SHA-256，40 次采样仍对应最终执行产物。构建保留既有 >500kB chunk 提示，未调整阈值或忽略规则。

预览命令分别为 `pnpm --filter @thesis-ledger/desktop exec vite preview --host 127.0.0.1 --port 4175 --strictPort` 与追加 `--outDir /private/tmp/thesis-ledger-market-period-benchmark --port 4174` 的基准预览。日志为 `/private/tmp/tl-p1-types.log`、`tl-p1-benchmark-types-complete.log`、`tl-p1-benchmark-build-complete.log`、`tl-p1-size-final.log` 及两个 preview 日志。临时文件可能被系统清理，核心数值、方法与请求已归档到本证据及 JSON。

| 截图 | SHA-256 |
| --- | --- |
| [500 点完整图表](/private/tmp/tl-p1-500-points-full.jpg) | `95a695e5f3750cc70a3396cffdbb40e06a5fa8e28b1cd324693349893e4df89d` |
| [生产页面窗口](/private/tmp/tl-p1-production-window.jpg) | `78ae46f01dfbbc7b65f965382d555d048daa0e4459e47d5dac810d57d8dbfe8a` |

本轮改动仅补强性能基准、增加其类型检查配置并更新证据与 P1 状态。Electron 安装包、设备与正式发布验收仍按各自任务管理；没有提交或推送。最终一致性 Review 由 R1 继续负责。
