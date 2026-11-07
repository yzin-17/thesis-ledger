# 行情详情比例与百分数值验证

## 结论和变更

[规格](../../specs/2026-11-07-market-percent-units.md)的 AC1—AC5 在下述源码与受控运行边界内通过，对应[任务](../tasks/2026-11-07-market-percent-units.md)。现有 Domain 模块明确两个单位入口：formatRatioPercent 接收比例，formatPercentValue 直接接收百分数值；均支持默认、始终正号、非零正号。文本模式保持二/三/六位旧合同，原始有效数字及独立指数不经过浮点换算。

Desktop 报价、筹码两项、股票区间、历史净值区间、盘中估值与盘中图表七条路径已接入。报价保留原 quoteChangePercent 数值接口，展示从原比例生成。符号、未知标记、颜色、查询、日期、质量及图表计算/数据保持。共享模块依赖方向不变，现有边界脚本检查通过，无新增非法依赖模式。

## 最终验证

实际组件先建立 37 项回归，旧实现 22 项通过、15 项失败；修复后全部通过。另有 7 项报价边界及 25 项 Domain 单位/符号回归。覆盖最小非零、最大有限、极小正负、普通四舍五入、零/负零、无效与空值，比较原对象和查询缓存。

| 检查 | 命令、输入和结果 |
| --- | --- |
| Domain 完整包 | `pnpm --filter @thesis-ledger/domain exec vitest run`，64 文件、678 项通过 |
| Desktop 完整包 | `pnpm --filter @thesis-ledger/desktop exec vitest run --passWithNoTests`，251 文件、1559 项通过 |
| Mobile 完整包 | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test --passWithNoTests`，50 文件、210 项通过 |
| Node 24 定向 | Node v24.22.1 直接运行 Vitest，Domain 6 文件 114 项、Desktop 8 文件 68 项通过 |
| 构建 | Domain、Desktop、Mobile、Server 的 `pnpm --filter <包> build` 通过；Domain 结果复用当轮稳定源码 |
| 静态 | 13 个 TypeScript 文件 ESLint、9 个格式检查、CJS 语法与实际执行通过 |
| 仓库门禁 | Node 24 的边界、工作区依赖、`GUARDRAIL_BASE_REF=HEAD` 尺寸通过；6 个既有告警未增长 |
| 实际浏览器 | 1440、1024、768、390 下各 6 场景，24 组通过；零页面错误、零 API/外部请求、零真实写入 |

Mobile 行情详情未发现对应独立字段消费者，完整包及构建验证兼容性。本轮没有 Server 或 Schema 业务修改，未重跑它们的完整套件，其既有结果继续保留原输入边界。

## 浏览器、样本与输入

浏览器运行真实 QuoteSection、ChipSection、FundCurrentValuation、MarketPriceChart、FundNavHistoryChart、FundIntradayChart 与 Readout，图表使用实际 Lightweight Charts。样本经实际行情、筹码、净值与基金估值 Schema 验证。最大百分数值用于展示字段边界，曲线使用普通有限净值；最大比例通过真实 Readout 的 props 隔离输入。这些组合用于展示验收，不作为估值算法结果或真实行情证据。

检查普通、极小正负、零、巨大百分数值及不可用；股票全屏打开/Escape/焦点恢复，历史净值与今日估值往返，有值时图表点击锁定及 Escape 解锁；四宽横向溢出、状态和正负颜色。浏览器前后实时读取样本及实际 TanStack 缓存，确认保持一致。已查看窄屏极小值和巨大百分数值的实际页面及图表截图。

回执前缀 `/tmp/goal-market-percent-`：

- `{domain,desktop,mobile}-full.json`、`{domain,desktop}-node24.json`：最终测试统计。
- `*-build.log`、`eslint.log`、`format.json`、`{boundaries,dependencies,sizes}.log`：构建与静态门禁。
- `browser/results.json`、同目录两阶段截图：24 组浏览器结果。
- `{desktop,mobile,shared}-inputs-{before,after-browser}.json`、`input-stability.json`：1976、277、2553 文件稳定，无验收期间变化。
- `extra-inputs.json`：独立 CJS runner 的 SHA256。

维护入口：`apps/desktop/scripts/check-market-percent-units.cjs`、`apps/desktop/test/browser-market-percent-units.html`，复用既有 5173 服务并新建隔离浏览器 context。所有浏览器已关闭，未重启服务。

## 保留边界

真实业务数据只读；主工作区已有其他未提交工作，稳定输入通过不等于整个主工作区清理或外部门禁完成。目标 Docker、真实来源、交易时段、原生宿主和发布验收仍由原活动任务持有；本轮没有相应动作、提交或推送。全线程 Goal 继续。
