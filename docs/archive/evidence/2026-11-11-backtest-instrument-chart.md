# 回测标的走势验收记录

日期：2026-11-11。对应[规格](../../specs/2026-11-11-backtest-instrument-chart.md)与[归档任务](../tasks/2026-11-11-backtest-instrument-chart.md)。

## 实现与核对范围

新增只读 `GET /api/v1/backtests/runs/:id/instrument-series`。Backtest 先执行既有冻结身份及结果读取门禁，再读取该任务的 `execution/bars.parquet`；复用产物大小与内容哈希校验，并检查逐行来源、口径、可见时间和请求区间。缺失、损坏、重复时点、无效时间及受限读取均有独立验证。没有新增 Provider 调用或数据写入。

Schemas 保留原始十进制价格和带时区时间；API Client 解析合同、校验任务身份并传递取消信号。Desktop 使用 TanStack Query，在原权益图区增加独立左轴的标的收盘价，权益保留右轴、回撤保留下方区域。日线仅在来源时区的同日期价格与权益均唯一时对齐绘图位置，保留原始时间，不推断交易会话。非日线、多点、缺口、跨日期及错误快照不补造数据。

价格线、权益和回撤共用缩放、平移、锁定时点与键盘查看；原买卖点及权益导出含义保留。价格轴出现和同范围刷新保留可见时间区间。冻结原值用于读数，数值转换只用于绘图。

## 本地检查

| 检查 | 输入与结果 |
| --- | --- |
| Schemas | `pnpm --filter @thesis-ledger/schemas exec vitest run src/backtest-instrument-series.test.ts`：2 项通过 |
| API Client | `pnpm --filter @thesis-ledger/api-client exec vitest run test/backtest-instrument-series.test.ts`：2 项通过 |
| Server | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-instrument-series.test.ts`：10 项通过 |
| Desktop | `unified-backtest-ratio-chart.ui.test.tsx`、`backtest-instrument-chart.test.ts`、`strategy-backtest-chart.test.ts`、`strategy-backtest-detail.test.ts`、`strategy-router-compatibility.test.tsx`、`market-experiment-recovery.ui.test.tsx` 共 6 文件 43 项通过；最后的范围保持修改另复验前两文件 12 项通过 |
| 构建 | Schemas、API Client、Server、Desktop 包构建通过；最终快更再次构建当前输入 |
| 边界 | `pnpm exec node scripts/check-boundaries.mjs` 通过；新增冻结读取器禁止依赖远程行情适配层的检查 |
| 文件尺寸 | `pnpm exec node scripts/check-file-size-guardrails.mjs` 通过，保留 6 项既有无基线警告，没有提高阈值 |
| 差异卫生 | `git diff --check` 通过 |

检查由低成本定向测试推进至构建和真实运行态，没有运行全仓测试或原生构建。Desktop 构建仍报告既有大分块提示。并发工作曾产生的其他文件类型错误在其源码修正后消失，本任务没有改写这些文件。

## 正式运行态

使用 infra 正式入口 `./scripts/sync-code.sh thesis-ledger`，最终执行记录 `/tmp/backtest-instrument-sync-final.log`，退出 0。Server 与 Backtest Worker 健康，镜像身份保持不变；这是容器可写层代码同步，容器重建后需重新同步或更新镜像。没有数据库结构、卷或原生依赖变更。

真实只读样本：

| 任务 | 冻结来源与结果 |
| --- | --- |
| `c740afea-31e9-484a-87a8-5d03b4b359f5` | `00700.HK`，`futu/futu`，后复权，HKD，Asia/Hong_Kong；区间 2025-11-11 至 2026-11-11，返回 247 点 |
| `8db8879d-e27d-4d8b-8df2-96eba083fee6` | `510300.SH`，`tencent/tencent`，不复权，CNY，Asia/Shanghai；区间 2025-05-15 至 2025-06-25，返回 29 点 |

港股样本快照 `6f74f79eaeeab08b4445b86d72da859b27aeff8b27a15615fb229d05c73cce9c`，执行产物哈希 `94ae3dc3c553957f582f53f4a878a3a5b0866da8900b8b4695aa36922e155115`。首末价格原值为 `3625.202740439` 与 `2349.945273012`，接口保留完整十进制。

部署前后该任务 `resultChecksum` 均为 `063d7efa406cfea8`，`JSON.stringify(result)` 的 SHA-256 均为 `11ee8025b8d588f19dfe5f49653da5dd5d9cbc641b6db799d1ae2be7d098bc4b`。没有重跑、补写或修改原回测结果。

## 浏览器验收

Playwright 使用本机 Edge，页面为 `http://127.0.0.1:5173/strategy/jobs/<任务 ID>`，读取已同步的本地 Server。1440、1024、768、390 四种宽度均检查真实港股样本：图例、左右轴、价格/权益/回撤读数、缩放、平移、重置和买卖点开关可用，浏览器运行错误为 0，文档宽度均等于视口宽度。

按“全部 → 近 1 月 → 放大 → 向前平移 → 重置”操作后，第一个可读时点依次为 `2025/11/11 16:00`、`2026/10/12 16:00`、`2026/10/14 16:00`、`2026/10/08 16:00`、`2025/11/11 16:00`。价格和权益在同一天同时读出；内地样本也读出 `2025/05/15 15:00` 的 `4.011 CNY` 与组合权益。

受控请求仅在浏览器拦截读取响应，没有写入共享业务数据：

- 通过页面统一刷新入口，同时延迟任务与价格请求。曲线画布、图例及锁定读数保留，图区只有一个加载圈；价格先返回时仍显示，任务最后返回才收起。1440 宽样本加载圈中心为 `(844, 785)`，对应可见图区中心。
- 390 宽返回冻结文件缺失，1440 宽返回 HTTP 503，均显示具体提示并保留可查看的权益与回撤，没有横向溢出。

截图：[1440 宽](/tmp/backtest-instrument-chart-1440.png)、[1024 宽](/tmp/backtest-instrument-chart-1024.png)、[768 宽](/tmp/backtest-instrument-chart-768.png)、[390 宽](/tmp/backtest-instrument-chart-390.png)。这些是本机临时验收产物，不纳入源码。

## 最终一致性结论

AC1 至 AC4 均有对应验证。读取只消费本次冻结执行行情，没有将当前行情写入历史；日期对齐只影响绘图位置，原始结果、价格和时间精度保留。独立基金 NAV 结果页及其他工作区任务保持原范围。

## 同日补充：标的线上的买卖点与颜色

按用户后续要求，买卖点插件绑定到标的价格序列，锁定时点也使用标的价格定位。日线成交按来源时区匹配同日期唯一有效价格，非日线保留同日期成交之后首点的匹配规则；缺失或歧义点位不绘制，并说明未显示笔数。标的线及图例使用紫色，买卖方向沿用既有配色。成交时间、数量和成交价格仍保留原值。

本次只修改 Desktop 绘图、展示投影和说明，不修改 Server、冻结行情、成交或回测结果。规格已同步更新。

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/unified-backtest-ratio-chart.ui.test.tsx test/backtest-trade-markers.test.ts test/strategy-backtest-chart.test.ts test/backtest-instrument-chart.test.ts`：4 文件 30 项通过。覆盖价格序列绑定、价格十字线、原成交精度、开关、主题配色、同日零点价格、缺口、歧义和缺失价格。
- Desktop 构建通过；文件尺寸门禁通过并保留既有 6 项无基线警告；`git diff --check` 通过。
- 同一真实港股样本在 1440、1024、768、390 宽检查紫色走势、买卖点位置、成交读数、买卖点开关及范围重置。四宽均无页面错误或横向溢出，读数同时显示 `3,663.172976 HKD` 标的价格及对应模拟买入。
- 390 宽受控缺失响应中，买卖点开关禁用，61 笔成交保留未映射说明，权益图仍可查看；未向共享业务数据写入样本。
- 通过 infra `./scripts/sync-code.sh thesis-ledger` 同步成功，执行记录 `/tmp/backtest-price-markers-sync.log`，镜像保持不变，代码同步边界同上。

最新截图：[1440 宽](/tmp/backtest-price-markers-1440.png)、[1024 宽](/tmp/backtest-price-markers-1024.png)、[768 宽](/tmp/backtest-price-markers-768.png)、[390 宽](/tmp/backtest-price-markers-390.png)。
