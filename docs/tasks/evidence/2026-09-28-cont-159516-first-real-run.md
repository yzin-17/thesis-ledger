# 159516.SZ 首条真实普通回测与界面验收

## 策略与失败收敛

用户选定的普通 `draft` 策略 `6abc8dda-17c2-45fb-a8d2-d18f430a6e32` 的 v1 规则为 `close > 0`。真实 V3 创建请求 `45e74adf-219f-4ca3-bf01-88c9cb1ea844` 被规则兼容性检查收敛为 `failed/DATA_UNAVAILABLE`，诊断为归一化价格上的绝对阈值缺少原始价转换证据，未生成 Snapshot。保留失败行。该检查不应因目标价格为正而放松。

在同一普通策略下新增 v2 `08ac7d30-d1a0-4ba2-8d7e-338cebe4c9e4`，将进场改为同一来源的 `close > open`，SignalSource 声明 `open/close`；离场、次日开盘执行、权益 50% 定仓及零策略成本保持。真实准备 HTTP 201、状态 `prepared`、执行预检 `ready`，来源为 `hithink/fund-market-historical`，Server Desired/Effective revision 29，Catalog revision `936288043164777`。

## 正式执行与冻结重放

配置为 `159516.SZ`、`2026-05-16..2026-08-09`、前复权、`normalized-series`、`fixed-provider-snapshot`、`after-acquisition`、CNY 100000。显式执行模型采用零手续费与滑点、连续归一化数量、无真实整手/tick/涨跌停限制、T+1 可卖。该模型只用于可复核研究验收，不是历史实际交易成本或份额。保守预热从 `2026-04-30` 读取；68 条来源 Bar，正式区间 59 个交易日。

| 路径 | Run ID | Snapshot ID | Worker 终态 | 结果校验值 |
| --- | --- | --- | --- | --- |
| 正式 API 创建 | `ab6a74ad-3883-4fcb-8756-b173e6e615d4` | `a6ea5ed9f415a294595198df226c08aa04696739e86b5b6cfd533f27a4d2fb24` | `succeeded`，attempt 1 | `f53cd041d5488faf` |
| 目标 Web 界面创建 | `72c72b2f-d53d-4a2a-ab0e-a5527538c04c` | `a535dd40f99d4ea49399ff218554d3067ad03f7428fc3e59f07723dfe95fdeaa` | `succeeded`，attempt 1 | `b3de2de34a049911` |

两条 Run 各有 11 笔已平仓交易、22 次成交、59 个权益时点、0 笔拒绝。目标 Server 读取的 execution、signal、benchmark 来源均为 `hithink/fund-market-historical`；两次独立采集的真实输入指纹分别为 `4358f8c7b0cd8cf883a94b118fa073c13c77ddccb1d07fd4525a95901b1c3f6e` 和 `7d3f7f4ecb45d9f8f9a6985050df35c93fe9216031a8c0aaa12c0f7eced31eeb`。价格协议为前复权、供应商定义分红、`fund-unit/CNY`、归一化数量、固定供应商快照。两条 finalized Snapshot 的质量均为 `complete`，各有 8 个 Artifact。独立在目标 Worker 容器只读重放冻结 Artifact，两条结果校验值分别与数据库 Run 结果一致，交易与成交数量相同。

归一化执行依赖未请求独立公司行动表；Snapshot 的 `corporateActions` 为空，七月拆分也未重复注入数量或现金事件。`2026-07-09` 已离场，`07-09` 与 `07-10` 权益均为 CNY `106510.7917724646556813039139173248933249998169925`，该两日没有由拆分造成的模拟持仓跳变。来源价格坐标仍是供应商定义的固定快照，不授予严格历史时点资格。

这两条旧 Runner 结果的业务 `completeness=partial`，直接诊断为 `BENCHMARK_ALIGNMENT_INCOMPLETE`：真实日线 Bar 使用 UTC 午夜时间戳，而权益估值在上海 16:00，旧基准要求两个时间戳完全相等，导致基准收益无法计算，成本假设身份随后也不可用，`benchmarkCompatibility=unverified`。旧结果保持原样并可由旧 Runner 重放；后续[版本化基准修复](2026-09-28-cont-159516-versioned-benchmark.md)让新 Run 完整，不改写这两条历史结果。执行 Snapshot 自身完整，累计收益约 4.74%、期末权益 CNY 104739.03。不能把该收益当成真实收费、真实份额或严格 PIT 绩效。

## 目标界面与拒绝路径

目标 Vite Web 连到同一 Server。策略库显示普通 draft v2，任务列表分别显示两条成功 v2 与保留的失败 v1。界面“再次运行”保留 59 日区间、CNY 100000、前复权归一化和执行模型；确认假设后“准备并核对配置”显示预检通过、实际 HiThink 主源及冻结时间，随后“创建新任务”进入上述第二条 Run。详情页显示成功终态、交易/成交明细、真实来源、固定快照研究性质、供应商定义分红、零费用模型及重放版本。取消再次运行的对话框后，目标策略下仍为 3 条任务（2 成功、1 失败）。

同环境直接提交篡改初始资金但沿用旧准备戳的 V3 创建请求，HTTP 409“准备结果已失效”，数据库未创建该幂等键任务。界面原将基准未核实引起的 `partial` 误写为“未完成结果”并推断图表缺口；现改为“结果部分可用”和仅展示返回时点的覆盖说明。Desktop 相邻 23 项测试、typecheck 通过，浏览器刷新后文案生效。目标界面截图：[首条界面创建的回测](2026-09-28-cont-159516-ui-run.png)。

目标 68 日范围按 DSA 五年分窗规则恰为单窗口，持久化的真实响应没有 `windowObservations`；同版本 D01 多窗口协议、冻结及重放的受控 HTTP/隔离数据库证据另见任务既有证据。不能将本次真实单窗口 Run 称为真实多窗口验收。完整 G0-H、G-Deploy、G-UI、严格 PIT、其他标的/口径和 AI 验收继续开放。
