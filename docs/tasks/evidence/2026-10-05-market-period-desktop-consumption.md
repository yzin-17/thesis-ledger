# Desktop 周期消费与阶段验收

承接行情 T5.1/T5.2 与 T6 局部检查。基线 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，当前未提交工作区；完整 T5/G1/P1/R1 不自动关闭。

## 实现和本地验证

展示详情、序列和分段采用展示联合合同，旧来源协议不扩大。派生请求直接携带 `timeframe`，不进行客户端聚合。请求、最新检查与重试键含周期；切周期重挂载页集合与视口，旧响应不能跨周期拼接，派生根序列不复用旧指纹拼接点。

周期和区间偏好分别保存，能力查询跟随当前复权口径。复用 ToggleGroup/Alert，只呈现可用周期；失效偏好立即回退日线并提示。基金关闭周期查询。年线默认两点，其余默认 90 点。标题、来源与完成状态随当前周期显示，预热不足保留空值。

- `pnpm exec vitest run src/features/market-detail --maxWorkers=2`：22 文件、102 项通过。
- Desktop typecheck/build、定向 ESLint、import boundaries、workspace dependencies、`git diff --check` 通过。
- `GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs`：通过，9 项原有超限告警，未增长。构建保留原有大 chunk 告警，未放宽阈值。

日志：`/private/tmp/tl-all-market-desktop-full.log`、`tl-all-market-desktop-typecheck.log`、`tl-all-market-desktop-build.log`、`tl-all-market-desktop-lint.log`、`tl-all-market-size.log`。

## 浏览器阶段证据

本机 `localhost:5173` 当前 Vite 页面消费真实目标 Server/DSA。从标的目录打开 `159516.SZ`，四种派生周期均成功；Network 捕获四种 `timeframe`，年线 `barsLimit=2`，其余 `barsLimit=90`。没有客户端全量日线聚合请求。基础来源为腾讯，实时概览继续显示路由不可用，未用图表结果替代。

月线显示真实均线与 MACD，MA60 为未知；年线指标为空并有不可得说明，当前年度“本周期尚未结束”。关闭再打开恢复 5 日线偏好。`159516.OF` 基金仅有净值能力，没有周期选项。已修正实际页面暴露的分段“最近日线/来源未知”文案；开发页面不是部署资源或生产性能证据。

浏览器随后拒绝 `127.0.0.1:4174` 的性能页和 `localhost:5173` 截图，策略理由均为用户拒绝。已请求重新授权，未绕过。截图、实际拖动/分页完整矩阵、500 点性能门禁保持开放。

## 性能准备

`apps/desktop/test/market-period-benchmark.html` 复用正式图表和周期组件，500 点仅为受控展示负载，不写业务 API、数据库或缓存。观察器报告长任务。`apps/desktop/scripts/build-market-period-benchmark.mjs` 已生成独立生产构建至 `/private/tmp/thesis-ledger-market-period-benchmark`；构建成功不表示 P1 通过。
