# 行情周期 G1 运行态与浏览器验收

日期：2026-10-06，Asia/Shanghai；现场观察从 UTC 2026-10-05 16:00 延续至 16:33。对应原 Task 的 G1，覆盖 AC2、AC3、AC6、AC7、AC8、AC10。G1 完成；P1、R1 保持开放。

## 运行基线与边界

- Git 基线：`514abeebfe57bac0c16271439d8b777ff3b02a9f`，当前未提交工作区。保留已有修改，本轮未提交、推送或清理。
- 页面：`http://localhost:5173/market-data`，当前 Vite 源码；代理目标 `http://localhost:3000`。使用 Codex 内置浏览器及真实图表，默认截图为 1280×720；没有读取浏览器账号、Cookie 或本地存储内容。
- Server：`thesis-ledger-dev-thesis-ledger-1`，镜像 `sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4`。
- DSA：`thesis-ledger-dev-dsa-1`，镜像 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`。
- 两服务健康入口均返回 200。只读查询实际 `SchemaVersion` 为 `20261005143000_authoring_analysis_application`，与当前源码 head 一致；这只是标记核对，不冒称完整数据库结构验收。
- 展示合同 `contractVersion=3`，能力合同 `market-period-options-v1`，规则 `market-period-aggregation-v1`；共享指标合同沿用 T1/T6 的 `market-period-indicator-v1`。
- 目标 Server 的 14 个 `src/market/market-period-*.js` 与宿主 build 一致；Schema/Domain 目标现有 200/128 个 JS/声明文件全部与宿主同名文件一致，关键 index/周期文件一致。宿主额外存在 12/10 个旧 build 残留文件，未把它们计入部署输入证明，未清理工作区。
- DSA 的周期指标合同、日历合同、交易日历和腾讯分页源码四个文件与宿主逐字节一致。

本轮无需更新目标运行态，没有调用更新脚本或执行任何 Docker 状态变更；只读容器检查及 SELECT 不包含迁移。图表是当前源码开发页面，不能据此宣称部署静态资源、不可变镜像或 Electron 安装包已更新。

## 真实来源与交互矩阵

正常行情没有响应替换，实际基础来源为腾讯。浏览器对详情请求直接携带选定 `timeframe`，服务端返回派生序列；没有观察到该切换动作请求全量日线供客户端聚合。

| 项目 | 现场结果 |
| --- | --- |
| `159516.SZ` 四周期 | `5d/1w/1mo` 请求 90 点，`1y` 请求 2 点，全部 HTTP 200；响应身份与当前周期一致 |
| 来源及口径 | 分段与图表底部均显示服务端派生、基础来源 tencent、前复权；原生来源能力没有被改成原生派生周期 |
| 周期与区间正交 | 保持 1 月区间切四周期；改为全部已加载后切周期、关闭重开仍保持独立偏好 |
| 跨标的复用 | `159516.SZ` 选择周线，经过 `159516.OF` 后打开 `159001.SZ`，真实周线成功，周线按钮选中；基金没有覆盖共享周期 |
| 五日线读数 | 最新 OHLC 为 0.715/0.722/0.649/0.651，量 17,183,248,800；MA5/20/60 为 0.68/0.7181/0.4957；与响应舍入值一致 |
| 悬停读数 | 五日线悬停 2026/9/8，OHLC 0.683/0.696/0.65/0.67，量 19,676,070,800，与实际桶一致 |
| 周线读数 | 最新 OHLC 0.695/0.704/0.649/0.651，量 11,112,230,100；RSI12 48.5205，MACD DIF/DEA/柱为 0.041/0.061/-0.04 |
| 月线不足 | 真实历史仅 39 桶；MA60 为 `null`，界面为 `—`；MA5/20 与 MACD 保留实际结果 |
| 涨跌幅 | 1 月区间：五日线 -6.47%、周线 -0.91%、月线 -9.96%；月线全部历史 +160.40%，按可视首尾收盘价独立计算一致 |
| 右轴及区间末值 | 最新收盘 0.651，右轴按价格精度显示 0.65；拖动到周线历史窗口后右轴 0.45 对应窗口末值 0.447，底部仍保留最新行情 0.651，区间涨跌幅 +120.20% |
| 五日线分页 | 实际向右拖动触发 `barsLimit=180&timeframe=5d`，返回 155 桶；原 90 桶的时间、OHLC、量全部一致，不重复拼接；悬停 2025/11/6 在响应前后保持同一日期及价格 |
| 周线分页 | 实际拖动触发 `barsLimit=180&timeframe=1w`，返回 164 个唯一日期；原 90 桶时间和收盘一致，悬停 2025/11/21 保持稳定 |
| 周期页集合隔离 | 分页后切回月线只显示月线 39 桶，不带入五日线/周线历史页；没有跨周期旧响应拼接 |
| 历史边界 | 月线、年线 `hasMoreBefore=false`；分别实际拖动，没有新增详情请求或更早加载提示。此次逐动作事件读取未截断 |
| 年线空值 | 2 桶中当前年度 `incomplete`；界面显示“本周期尚未结束”，MA/MACD/RSI 均为 `—`，不可得副图按钮禁用，另有指标不可得说明 |
| 年线时间含义 | 2026/12/31 是年度桶轴日期，当前桶尚未结束；它不是未来行情取得的证据 |
| 实时概览 | 腾讯 ETF 实时 quote 当前未配置，四周期都保留“暂时不可用”；未用派生收盘替代实时 quote |
| 无路由股票与持仓 | `600519.SH` 四派生能力均 `route_not_configured`；继承的周线明确回退日线并显示中文提示，详情失败仍保留原有数量、成本和未知盈亏。没有补造股票成功或数值盈亏 |
| 基金 | `159516.OF` 无价格周期组，无周期能力请求；只请求 `fund-nav,fund-nav-history`，当前路由不可用以净值分段解释，不改为价格图 |

股票成功行情、基金净值来源成功、实时 quote 来源成功均不在本轮观测结果中；它们的当前不可用状态如实保留。主矩阵的四周期成功及跨标的成功来自实际 ETF 请求，不由受控响应替代。

## Network 请求标识与响应摘要

共同入口 `/api/market/159516.SZ/detail`；共同参数为 `chartContractVersion=3&navLimit=90&adjustment=qfq&refresh=1`，指标参数 `fast=12,slow=26,signal=9,short=6,mid=12,long=24`。

| 请求标识 | timeframe / barsLimit | HTTP / 实际桶数 | `JSON.stringify` 响应 SHA-256 |
| --- | --- | --- | --- |
| `35385.639` | 5d / 90 | 200 / 90 | `583a59ed997a44db9d3f72396a054e6722edd2cb08d74728f20bf03d44efd4b9` |
| `35385.642` | 1w / 90 | 200 / 90 | `e5aa7642b2dbd09984a019c977d9b198bffde2a5733fd0637688777411bf038d` |
| `35385.645` | 1mo / 90 | 200 / 39 | `88ae454c645794a34887d588457c164cd08d87d29af485e508bcf62c653bf42e` |
| `35385.648` | 1y / 2 | 200 / 2 | `69d4be123a43212e3c98da8e994aaec574138b3d94feaadea3ef363a9d16bfb9` |
| `35385.653` | 5d / 180 | 200 / 155 | `65e85e5bab9b927492343b9b3b3852b3656377e6f1931198f45764c1de181bbf` |
| `35385.668` | 1w / 180 | 200 / 164 | `1cc66aee9d7f1b0fefe9d760b7b34880f4fdb2f37cc8a8b00e3a23c0a75d4927` |

能力请求为同标的 `/period-options?adjustment=qfq&barsLimit=90` 与独立的 `barsLimit=2`，均返回 200。基金实际请求包含 `include=fund-nav%2Cfund-nav-history`。这些详情响应在对应动作后现场读取并核对；长会话的部分背景事件发生 CDP 缓存淘汰，本记录不是完整无损 HAR，也不把事件缺失当作请求不存在的证明。

## 受控状态与发现的问题

受控测试仅拦截当前标签页中已观察到的详情 Fetch 响应，限定 URL 和非 Document 类型；使用真实月线响应副本，先通过展示 Schema，再替换分段状态。没有更改 Server、DSA、Provider、队列、数据库或业务缓存配置。测试结束已清空拦截规则并重新加载，恢复实际来源页面。

- 陈旧：仅把 bars 状态改成 `stale`，保留真实响应数据。页面显示“行情详情可能陈旧”和“陈旧”，图表继续可读，可主动重新加载。
- 空：移除根显示序列，bars 为 `empty,data=[]`，指标为有诊断的不可得状态。最终月线请求 `interception-job-8267.0` 验证“行情数据 / 暂无数据 / 当前没有可用行情”，没有图表、零值、刷新失败或渲染异常。
- 在空态链路中发现并修复 SDK 对空数组读取 `identity`，以及页面在状态判断前把空数组转换为价格序列的问题。补充省略数据、`null`、空数组三种合法空形态的回归；SDK 同时覆盖日线与派生周期。
- 按 AC6 修复周期偏好按标的分别保存的问题。当前写入共享 `thesis-ledger:market-period-preference`；共享记录不存在时兼容读取原有标的记录。能力回退仍持久化，基金不覆盖，查询失败不冒充确定不可用。
- 回退提示移入详情通知位置，图表不能显示时仍可见；不依赖图表工具栏承载提示。
- 历史加载/最新检查改用“行情”，空或不可得分段标题使用“行情数据”，避免错误宣称是日线。

故障注入早期的空数组渲染曾产生控制台 TypeError，已记录并修复。最终观察窗口始于 `2026-10-05T16:26:52.767Z`；再次完成月/年度边界、最终月线空态、重新加载及真实五日线恢复后，控制台新增 error/warn 为 0。不能把整个会话冒称为从未出现错误。

## 最终检查

检查在相应源码最后修改后执行；源码稳定后才运行最终 Desktop build。

| 命令与执行目录 | 结果 / 日志 |
| --- | --- |
| SDK：`pnpm exec vitest run test/market-period-detail.test.ts test/market-period-transport.test.ts --maxWorkers=2` | 2 文件 15 项通过；`/private/tmp/tl-g1-sdk-directed.log` |
| SDK：`pnpm exec vitest run --maxWorkers=2` | 12 文件 75 项通过；`/private/tmp/tl-g1-sdk-package.log` |
| 主仓：`pnpm --filter @thesis-ledger/api-client build` | 退出 0；`/private/tmp/tl-g1-sdk-build.log` |
| 主仓：`pnpm --filter @thesis-ledger/api-client --filter @thesis-ledger/desktop typecheck` | 退出 0；`/private/tmp/tl-g1-consumer-types-final.log` |
| Desktop：周期、空态、详情四文件定向回归 | 25 项通过；`/private/tmp/tl-g1-acceptance-directed.log` |
| Desktop：`pnpm exec vitest run src/features/market-detail --maxWorkers=2` | 最终 24 文件 112 项通过；`/private/tmp/tl-g1-desktop-final.log` |
| 主仓：`pnpm --filter @thesis-ledger/desktop typecheck` | 最终退出 0；`/private/tmp/tl-g1-desktop-types-complete.log` |
| 主仓：`pnpm --filter @thesis-ledger/desktop build` | 最终退出 0；`/private/tmp/tl-g1-desktop-build-complete.log`；既有大于 500 kB chunk 告警保留 |
| 主仓：8 个改动源码/测试文件 `pnpm exec eslint <文件...> --max-warnings=0` | 退出 0；`/private/tmp/tl-g1-final-lint.log` |
| 主仓：`node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` | 退出 0，依赖图 8 包 |
| 主仓：`GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs` | 退出 0，9 项旧债告警、ratchet 通过；`/private/tmp/tl-g1-size-final.log` |
| 主仓：`git diff --check` | 通过；文档写入后另行复验 |

根 manifest、锁文件和 ESLint 配置摘要与 T6 一致。没有提高阈值、忽略失败、修改 migration、运行全量生产镜像构建或重跑无输入变化的 Server/DSA 全套测试。SDK/Desktop 新输入由上述检查覆盖，T6 历史记录仍按其执行时点保留。

## 最终输入与截图

| 输入文件 | SHA-256 |
| --- | --- |
| `packages/api-client/src/market-display-client.ts` | `778d56a3a7ff5771ea1ca1cc2413bdae8c000559b164a305256deeaf0a922e09` |
| `packages/api-client/test/market-period-detail.test.ts` | `7b0346f8ae208d9d36f51bd5164aaea744d33509ffe3c7a2dd4c920f79f24229` |
| `MarketPeriodSelection.tsx` | `2c8e53754009fff6ee8eb4f70c8937c4cfe43d1cdb716ea3bc6d1c3defb618c9` |
| `MarketPeriodSelection.interaction.test.tsx` | `e80b0ffaa7946680cd8d58561a7ebde04ce2e2d13bb3411c80dae807cb0b1250` |
| `MarketDetailDialog.tsx` | `d830c8b5035353ed125734de8cba55d5dc8f8a5d4bba74b3e09216fe3f9ca1f0` |
| `MarketDetailSections.tsx` | `fb01fc02e55c286564f92d847d45c41c569d6d30be73969a1b434e78f5a40502` |
| `MarketDetailSections.empty.test.tsx` | `f4e5f78c6884a014d09f8286149a98c8f8f2ec547af167a989784447f95df93d` |
| `MarketPriceLightweightChart.tsx` | `4f35bb745e1b9a71e25ed0e05a4dac8c7478e003e9707d99ba57b5284df66933` |

未写全路径的源码位于 `apps/desktop/src/features/market-detail/`。

截图均保存在本机 `/private/tmp/`，未作为源码或安装包加入 Git；本记录提供位置与摘要，临时文件日后可能被系统清理。

| 截图文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `tl-g1-final-real.jpg` | 最终真实五日线、右轴、读数及 -6.47% | `ea008756db806b6c4a0bc7fa84ec07926ffaed167c690c5123ada8c9a040b6f4` |
| `tl-g1-week.jpg` | 真实周线与 MACD | `81f776d3a6679fa8524fd1abf9abad00e6cc6884251e7fc9b7a3de70fed8bc72` |
| `tl-g1-month.jpg` | 月线 MA60 空值与全区间 | `477ed6f10f4504c578a7c43482ec347542796a2248b6c331fb191a38240c9fa3` |
| `tl-g1-year-final.jpg` | 年线指标空值及当前年度未结束 | `c02b000fd28e7e8574c33217e0c365bdb005f15dd016850595771ff491379f54` |
| `tl-g1-week-pagination.jpg` | 拖动分页后窗口末值与 RSI | `b4772cd5ad5b70df23cbe778cfdbaeecd7cd4b5e904e6e54478d50818c5584c2` |
| `tl-g1-cross-symbol.jpg` | 另一 ETF 继承周线 | `b4511f187acd58bb45b2262052f8d328d37dfd687092f6f82a11065df05c6eef` |
| `tl-g1-fund.jpg` | 基金仅有净值分段 | `4330649871dcd4695680610ca3840c8f601de9e91030c82bbc44f7a35367ac74` |
| `tl-g1-stock-fallback-final.jpg` | 无路由股票回退与持仓上下文 | `060f21d2d7423c024f1507c4f76c6ef93f9226e16a1f743beefd1039f32f3505` |
| `tl-g1-stale-controlled.jpg` | 受控陈旧提示 | `0edd5ac3e5e7a547ca95c3c29a3d7536111d6aa54e24d2c4285eceb844bd35a6` |
| `tl-g1-empty-complete.jpg` | 最终受控空态，无误标日线或异常 | `f482d2aa83269b0b0760bfc8b8215ab010ec042015cb2c6b72e2738d158c0aeb` |

最终页面已恢复真实响应，选中五日线、1 月区间和 MACD；保留可查看的浏览器标签页。500 点长任务采样属于 P1，本轮未执行；最终全 Spec 一致性 Review 属于 R1，本轮未关闭。
