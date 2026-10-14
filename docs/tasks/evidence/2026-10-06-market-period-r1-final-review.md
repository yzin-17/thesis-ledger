# 行情图表周期聚合 R1 最终一致性 Review

日期：2026-10-06。结论：AC1–AC11 通过，T1–T6、G1、P1、R1 均满足本任务完成条件，无未解决的 Blocking 问题。唯一完成清单保留在[已完成 Task](../../archive/tasks/2026-09-16-market-chart-period-aggregation.md)；[Spec](../../specs/2026-09-16-market-chart-period-aggregation.md)继续维护现行契约。

## 验收断言与实现证据

| 断言 | 实现核对 | 验证与证据边界 |
| --- | --- | --- |
| AC1 四周期确定性聚合 | Domain 的 `market-period-aggregation`、calendar、input、plan 明确接收评估时刻、完整交易日历、规则版本及 5d 锚点；完整桶同时要求结束和覆盖，不填造停牌价格 | 当前 35 项定向 golden/边界测试及 Domain 386 项全包测试；缺日历、冲突事实、未来可得证据与未知覆盖均拒绝或保持未完成 |
| AC2 能力与派生来源 | Server Reader 只读真实 1d 来源；view 绑定基础事实 refs、来源、日历与上下文指纹；公开周期合同独立于 Provider 原生 1m/1d | Server 能力/来源测试与[目标真实来源验收](2026-10-05-market-period-runtime-closure.md)；没有新增派生事实表或扩展 Provider 原生枚举 |
| AC3 兼容与错误 | 原生日线合同保留；Controller 默认 1d，参数、能力和预算失败使用结构化 400/422/503；服务端不静默换周期 | 当前 Server 165 项定向测试、784 项受影响范围测试；Desktop 的明确提示回退由[G1](2026-10-06-market-period-g1-browser-acceptance.md)验证 |
| AC4 周期指标与预热 | Server 取完整计算桶和预热，DSA 仅消费 provided-points；计算输入与展示结果分离，时间戳采用桶终交易日；年线历史不足分别降级 | T1.3/T4 跨仓夹具、DSA 62 项历史有效门禁、真实 DSA/Redis 288 日线→61 周线计算点→2 展示点；当前年线实际页面保持指标不可用提示 |
| AC5 窗口与覆盖 | `barsLimit` 计周期点；daily fetch 与 calculation 各有 3650 上限；边界按日历完整桶换算，`hasMoreBefore` 不按原始行数直接推断 | 当前窗口、范围、缓存及详情测试；目标 21 项 HTTP 指纹/窗口/降级矩阵支持当前装配 |
| AC6 周期、区间与偏好 | Toolbar 消费实际能力；周期独立于区间；全局周期偏好跨标的复用，兼容读取旧标的键；能力失效时提示并回退 | 当前 Desktop 23 项定向交互及 112 项行情回归，G1 真实跨标的与能力检查 |
| AC7 非图表语义与交互 | 详情 quote/持仓/成本/PnL 仍走原分段读取；图表消费周期桶，保留读数、右轴、涨跌幅、区间、拖动、重置和分页 | G1 真实图表、实际持仓 3 单位/成本 10 的不变检查；在线 Quote 未配置，只验错误/不可用状态，不声明正向 Quote Provider 成功 |
| AC8 来源披露与基金 | 周期中文、派生标签与实际来源可见；基金只走 NAV 合同，不显示证券派生周期组 | G1 真实基金及证券页面，当前 Desktop 基金/空数据测试；不把未配置的股票路由或 NAV Provider 声称为正向来源验收 |
| AC9 请求键与页隔离 | 协调器键含周期、标的、复权、窗口和参数，取消最后消费者；Dialog 随标的/周期重建视口及页，异周期响应不能合并 | 当前 SDK 75 项与 Desktop 行情 112 项；G1 的陈旧响应/空响应为明确标记的受控注入，与真实来源场景分开 |
| AC10 工程与运行态 | 契约生成、包导出、依赖方向、预算、缓存键与失效逻辑一致；共享传输变动后补做当前消费者验证 | 下述当前检查及 T6 有效未变输入；目标容器编译产物逐字节核对，真实 HTTP、DSA/Redis 故障与浏览器证据各自保留 |
| AC11 性能与请求形态 | 当前生产图表组件以 500 价格点及三组 500 指标点切换四周期；实际页面读取选定周期窗口 | 当前 40 次采样未记录 ≥50ms 长任务，第二帧 25.2–52.2ms；四周期真实详情/能力请求完整捕获，无客户端全量日线聚合调用。见[原始记录](2026-10-06-market-period-r1-runtime-samples.json) |

## 当前输入与分层检查

主仓 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，DSA HEAD 为 `d40549602d187da7bdd0e8bebb59d2a0fc271919`。验收包含尚未提交的当前工作树，不能只用 HEAD 代表实现。R1 没有修改功能源码；并发会话修改的 SDK 错误对象/429 等待与 Desktop 共享传输层已纳入当前类型、构建、行情回归和生产采样，其他策略业务行为不由本 Review 承接。既有修改未 reset、stage、commit 或 push。

原始记录保存采样时各包输入数量与 SHA-256。摘要算法：各包 `src/test/tests` 下全部文件及存在的根 `package.json/tsconfig.json/vitest.config.ts/vite.config.ts`，按包内 UTF-8 相对路径排序，依次散列路径字节与文件字节，不加入分隔符；构建后及采样完成时重复计算一致。归档期间并发会话随后补了 `Retry-After` 空值处理和策略 UI 测试，并重建 Desktop；下段记录该后续输入，采样摘要仍指向实际加载版本，不替换为后来的 bundle。

后续 SDK 输入摘要为 `9af1fd584d249a2f8566c66dc45099809a344ad8988ec3790bc3e098e07e3d25`（22 文件），Desktop 为 `36143a27b6c18b9962194ead03a67649b6cce72b97d170c8a7563b4831f38032`（478 文件）。该后续 SDK 75 项测试、SDK/Desktop typecheck、4 文件传输 lint 再次通过，见 `/private/tmp/tl-r1-sdk-final-package.log`、`/private/tmp/tl-r1-final-consumer-types.log`。变化不涉及图表组件、周期合同或聚合/指标计算，因此四周期和性能结论按已记录的功能输入使用；并发生成的 `index-CoENErCi.js`（SHA-256 `63c7c42f266c949a2d775c4a68f33aac7e11e77efa5b9fd511deb4aad54c4eb0`）未重新做性能采样，不声称其整包经过本次浏览器验收。

| 检查层级 | 当前结果 | 命令与本地日志 |
| --- | --- | --- |
| 定向测试 | Domain 35；Server 165；SDK 15；Desktop 23，全通过 | 各包 `pnpm exec vitest run` 指定周期相关文件；`/private/tmp/tl-r1-{domain,server,sdk,desktop}-directed.log` |
| Domain 全包 | 43 文件、386 项通过 | `pnpm --filter @thesis-ledger/domain test`；`/private/tmp/tl-r1-domain-package.log` |
| Server 受影响范围 | 63 文件通过、5 文件跳过；784 项通过、27 项条件跳过 | Server 目录 `pnpm exec vitest run test/market test/integration/dsa-market-calendar.test.ts test/integration/dsa-period-indicators.test.ts test/integration/dsa.client.test.ts --maxWorkers=2`；`/private/tmp/tl-r1-server-affected.log`。跳过项不计为通过 |
| SDK 全包与 Desktop 行情 | SDK 12 文件/75 项；Desktop 24 文件/112 项通过 | SDK 全包测试、Desktop `test/market`；`/private/tmp/tl-r1-sdk-package.log`、`/private/tmp/tl-r1-desktop-market.log` |
| 类型与构建 | Domain、Server、SDK、Desktop typecheck/build 通过；性能基准生产 build 通过 | 对应包 `pnpm --filter <package> typecheck/build`；`/private/tmp/tl-r1-types.log`、`tl-r1-builds.log`、`tl-r1-consumer-types.log`、`tl-r1-sdk-build.log`、`tl-r1-desktop-build.log`、`tl-r1-benchmark-build.log`。Desktop 保留既有大 chunk 告警 |
| 工程门禁 | boundaries、workspace dependencies、尺寸 ratchet、共享夹具生成与 diff 检查通过 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs`、`pnpm exec tsx scripts/print-market-period-indicator-fixture.mjs`、`git diff --check`。尺寸检查有 9 项未增长/已缩减的存量告警 |
| 当前共享传输 | 4 文件定向 ESLint 通过；429 等待期间取消的受控请求不继续投递 | `pnpm exec eslint packages/api-client/src/api-error.ts packages/api-client/src/index.ts apps/desktop/src/shared/api/client.ts apps/desktop/src/shared/api/rate-limited-fetch.ts --max-warnings=0`；本地 fake fetch 烟测，无外部 HTTP |

[T6](2026-10-05-market-period-t6-engineering-gates.md) 的全工作区分组 lint、结构打包和 DSA/Schema 门禁是历史执行证据，未改变的输入继续适用。T6 中 Domain/Server 的聚合摘要无法按其文字算法重现，因此本次重新执行这两个包的定向/受影响测试、类型与 build，并建立可重复的当前摘要；不修改历史记录，也不把旧摘要当成当前一致性的依据。根 manifest/lock/ESLint 配置未变，Schema 摘要与 T6 一致。跨仓指标/能力夹具逐字节相同，当前指标生成器输出也与夹具相同。

共享传输中的 `delay` 使用实际安装的 `es-toolkit@1.51.0` 根导出；声明及实现支持 `AbortSignal`，本地核对了预取消和等待中取消行为，与[官方 delay 文档](https://es-toolkit.dev/reference/promise/delay.html)一致。

## 目标运行态与当前浏览器复核

只读检查确认 `thesis-ledger-dev-thesis-ledger-1` 和 `thesis-ledger-dev-dsa-1` 均运行且健康。Server/DSA 健康接口均返回 200；Server 版本 `0.1.0`，当前 SchemaVersion 为 `20261005143000_authoring_analysis_application`。本周期任务没有数据库结构升级义务，健康标记本身不代替完整结构验收。

- Server 镜像：`sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4`；14 个周期 JS、部署 Schema 200 个与 Domain 128 个 JS/d.ts 均与宿主当前编译文件对应字节一致。
- DSA 镜像：`sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`；provided-points 合同、calendar 合同、trading calendar 及腾讯长窗口四项关键源码与目标一致。
- 目标真实腾讯来源、缓存失效及实际 Redis/DSA 连接故障由[运行态闭合证据](2026-10-05-market-period-runtime-closure.md)承接；本次不改变容器状态，不重复构建镜像。

共享传输层变化后重建 Desktop 与性能夹具并重新采样，实际采样 bundle 摘要见原始记录；旧 G1/P1 构建摘要仅描述其当时输入。采样页面分别为 `http://127.0.0.1:4175/market-data` 和 `http://127.0.0.1:4174/test/market-period-benchmark.html`，请求代理连接真实目标 Server。实际 `159516.SZ` 按周→月→年→5 日切换，详情请求 `barsLimit` 为 90/90/2/90，返回 90/39/2/90 点且周期匹配；每次另有能力元数据请求，两类接口全部 200，捕获无截断、无遗漏标记、无失败。年线指标历史不足保持显式降级；浏览器 warn/error 日志为空。

性能采样使用 Apple M2、16 GiB、macOS 27.0.1（26A434）、8 核、1280×720、DPR 2、Chromium UA 154，无主动 CPU/网络限速。MACD/RSI 各 20 次，全量视区固定 500 价格点与三组 500 指标点；点击后两个 `requestAnimationFrame` 记录第二帧时间，再观察 1000ms 并获取 long-task 条目。40 次均支持观察且页面可见，无 ≥50ms 长任务条目，满足 >200ms 门禁；25.2–52.2ms 是第二帧代理指标，不是端到端网络延迟。截图：`/private/tmp/tl-r1-500-points-full.jpg`，摘要随原始记录保存。

## 文档对账与完成边界

Spec 已对齐当前接口 `/api/market/:symbol/detail`、展示联合枚举/原生来源枚举、桶终时间戳、默认窗口、详情与独立入口不同上限、独立 daily/calculation 预算、T3/T4 预热职责及全局跨标的偏好。早期未装配/未部署记录保留为历史阶段；Task 的当前结论由 R1 收口。Canonical 架构补充周期概念所有权与单向消费，TODO 的既有分页条目更新当前接口。

分钟线及既有通用分页锚点后续工作继续由原 TODO/Task 承接，不增加本次四周期聚合的验收义务。Provider 正向 Quote、严格 PIT、发布镜像、Electron 安装包及其他模块原生验收由各自任务管理；本次浏览器、真实来源、受控故障和性能证据按上述边界使用。

已完成 Task 归档至 `docs/archive/tasks/`，原路径只保留兼容链接，当前 Spec 和文档导航直接指向归档正文。本次不提交、不推送；不把 writable-layer 运行态一致当成新镜像或生产发布证据。
