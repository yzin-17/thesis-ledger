# 派生周期公开 bars 与指标消费证据

## 完成范围

T3.3a 已完成本地公开消费。Server 注册独立 `MarketPeriodDisplayService`，bars 与独立指标按显示周期进入实际日历、原生 1d Reader、派生视图与 DSA 消费；来源 identity 和路由枚举保持原生范围。详情和能力声明仍属于 T3.3b，目标新 Server HTTP 属于 T3.3c；完整 T3、T5 与产品门禁保持开放。

公开请求沿用原生标的、口径、日期和条数校验，仅支持 interactive，明确拒绝 asOf。5d 锚点取实际日历最后计划交易日；周/月/年边界复用 Domain 原算法。日历探测最多扩大四次，探测不足不能冒充来源历史不足。完整可见与预热窗口分别遵守 20000 日历日、3650 基础点和 3650 计算点上限；超限为结构化 400，可得性失败为 503，不支持资产/市场为 422。

省略 limit 时年度默认 10 个周期点，其余默认 90；显式开始日约束实际可见范围，但不裁掉预热。指标 refresh 强制重算，显示指纹与 calculationInput 分别绑定。原生请求和未注入派生服务的原拒绝路径回归通过。

## 验证

| 命令和输入 | 最后结果 |
| --- | --- |
| Server `vitest run test/market/market-period-public-http.test.ts test/market/market-period-public-window.test.ts test/market/market-period-http.test.ts` | 32 项通过；新公开 HTTP 15 项、范围规划 9 项、原拒绝/兼容 8 项。 |
| 公开两文件与 `test/backtest/v3-frozen-comparison.test.ts` 定向复验 | 28 项通过，维持原 5 秒测试超时。 |
| Server `vitest run test/market test/integration/dsa-market-calendar.test.ts test/integration/dsa-period-indicators.test.ts test/integration/dsa.client.test.ts test/backtest --maxWorkers=2` | 140 文件、1355 项通过；12 文件、50 项需要独立环境的测试跳过，不能计为通过。 |
| Domain 包级测试 | 43 文件、386 项通过，既有聚合 golden 保持原行为。 |
| Server `tsc --noEmit`、标准 build | 通过；Domain 先构建新增边界导出，再检查 Server，避免旧 dist 缺导出的无效失败。 |
| 新增模块/测试严格 lint | complexity ≤20、函数尺寸 ≤220，通过；共享 Controller 按项目现有门禁通过。额外对整个旧 Controller 强制 complexity 20 时，存量 detail 的 32 触发错误，未提高阈值或加入 ignore。 |
| 边界、`GUARDRAIL_BASE_REF=HEAD` 尺寸门禁 | 通过，9 个未增长的存量尺寸告警。 |
| migration matrix、runtime 打包输入 | 28 项 migration、76 表、60 Prisma model、16 raw-owned 表，head 为 `20261004140000_strategy_authoring_records`，通过。 |

首次行情与 Backtest 混合并行运行出现两项 5 秒超时，并有超时后关闭资源的异步错误。两个失败文件独立复验通过；公开 HTTP 的日历夹具改为实际请求范围投影，减少无关十年 Session 运算。最终限制两个 Worker 的完整组合回归通过，无超时或异步错误；没有扩大超时、修改生产公式或关闭测试。

日志为 `/tmp/market-period-public-*`，最终组合结果为 `/tmp/market-period-public-and-backtest-final.log`。

## 实际来源与 DSA

用户授权自行选择日线来源后，选择目标现有 `tencent/tencent`、ETF `159516.SZ`、前复权 `qfq`。现行 Policy revision 36 已包含该路由，无需修改配置或新增准入。短窗口原生日线返回 200、7 根；实际价格口径为 provider-native/provider-defined，revision 属于本地观测，volumeBasis 为 unknown，未补造单位或 strict PIT。

宿主机当前源码通过目标实际日历与原生日线装配四周期，每周期返回两点；5d/周/月尾桶完整，年度尾桶为 incomplete。四次基础请求、十二次日历请求成功；分别生成独立周期/时刻/日历摘要。这证明当前宿主机装配消费真实事实，不代表目标新 Server 公开入口已部署。

随后实际 DSA 指标链：5d 和周线 MA 各有 61 个计算点、两点显示，计算/显示指纹分别保留，真实均线数值通过合同消费。月线完整预热请求的目标原生日线返回 503，明确降级 source_unavailable；没有重复失败调用或缩短预热。年度 MA 在日历预算前以 calendar_input_limit 拒绝，未请求来源或 DSA。该边界不关闭 T3.2c3 的真实 Redis 故障及目标新公开链门禁。

实际日志：`/tmp/market-period-public-target-source.log`、`/tmp/market-period-public-target-indicators.log`。没有部署新 Server、重建数据库、写真实账户交易或提交代码。
