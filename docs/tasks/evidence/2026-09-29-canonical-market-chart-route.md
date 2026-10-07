# Market 图表读取入口收敛

> 2026-09-29。本叶证据来自本地源码、包级测试和构建；目标运行态尚未更新。

## 实施范围

- `MarketController` 的详情日线、独立 `/bars` 与 `/indicators/:name` 均调用 `MarketBarReader.readChartV3()`。详情请求省略 `chartContractVersion` 时直接使用当前 Reader，日线显示上限为 3000 根，指标预热使用 3650 根输入上限。独立图表端点的 `complete` 和 `asOf` 参数在读取前拒绝，避免把交互图表结果当作历史可见性证据。
- API Client 固定发送 `chartContractVersion=3`；Desktop 图表请求、口径选择和 Dialog 不再保存可切回旧 Reader 的版本状态。图表“加载更早数据”仅扩大当前窗口，旧的按结束日翻页、历史页缓存和逐页重算指标状态已删除。基金净值仍走独立的非日线能力。
- 基金持仓净值估算中的成份股交互日线改用当前图表 Reader。正式绩效股票与 ETF 日线的精确 V3 窗口迁移见[前一叶](2026-09-29-canonical-market-reader-consumer-leaf.md)。

## 验证

| 检查 | 结果 |
| --- | --- |
| Server 图表详情、独立端点、指标预热、绩效估算定向测试 | 43 项通过；对应四个测试文件 |
| Server 全包 `pnpm exec vitest run --reporter=dot` | 1764 项通过、91 项跳过，2026-09-29 10:44 本地执行 |
| Server `tsc --noEmit` 与 `pnpm build` | 通过 |
| Desktop 全包、类型与构建 | 508 项通过；`tsc --noEmit`、`pnpm build` 通过 |
| API Client 全包 | 36 项通过 |
| 变更文件 `git diff --check` | 通过 |

## 未完成边界

`MarketDetailResponseV2` 仍是当前图表响应投影，属于 C03/U01 后续清理；不得仅凭 Reader 切换宣称合同收敛。`StrategyRiskContextService`、`AutomationWorkflowRunner` 仍调用旧 Reader，且当前 V3 窗口仅支持日线，分钟线能力未建立。DSA 旧生效策略读取及旧数据接口、真实 Server/DSA 同源部署、浏览器交互和历史 PIT 验收均未执行。E02/U01/U02/D02 继续未勾选。

源码核对：DSA `api/thesis_ledger.py` 的旧 `/market/bars` 在 `timeframe != "1d"` 时返回 422；`MarketBarWindowReaderV3.read()` 与 DSA `execute_market_bars_v3()` 也只接受 `DAILY_BAR`/`1d`。因此 Risk/Automation 的 `1m` 不能靠切换版本或读取旧缓存完成，须单列分钟线精确来源与时序验收；当前测试夹具不能作为真实分钟线可用证据。
