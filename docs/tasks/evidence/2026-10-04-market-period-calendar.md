# 周期日历读取与 Session 投影证据

## 实现范围

2026-10-04 完成 T3.1 本地服务及实际 DSA 读取核验。`MarketPeriodCalendarReader` 在 Market 内单向消费 `DsaClient.backtestCalendar`，投影复用 Domain 的冻结事实日历适配；未依赖 Server Backtest 编排。Module 已注册，边界脚本新增周期展示不得 import Backtest 编排的检查。

读取只接受显式范围与评估时刻。必须有唯一、supported、覆盖完整且 Provider/revision 一致的 CN/Asia/Shanghai 日历事实；拒绝未来可用时刻、错市场/时区、重复或越界假日/覆盖、非法或重叠 Session。保留半日市与无 Session 的覆盖日。请求跨度上限 20000 天，开始日期和未来 104 日预算与 DSA 协议一致。完整事实内容进入日历 revision，未用内置节假日表或最新交易日代替覆盖证明。

该服务只产生聚合日历输入，不声明标的派生周期可用。当前 DSA 实现使用 XSHG 包；标的实际交易场所与该日历的适用性仍需 T3.2/T3.3 装配明确，不得将此核验扩展为所有市场或严格 PIT 准入。

## 本地验证

- 新增日历投影/读取测试 32 项通过，覆盖纯聚合器实际消费、固定时刻回放、半日/闭市覆盖、完整 revision 变化、错误降级、未来微秒边界和请求预算。
- Server 行情特性 52 文件、646 项通过；5 文件、27 项为原有条件性跳过，没有将其记录为通过。
- Server 类型检查与 build、新增/受影响代码 lint、边界检查、文件尺寸 ratchet、`git diff --check` 通过。尺寸门禁保留 9 个未增长的既有告警。
- 临时日志为 `/tmp/market-period-calendar-market-regression.log`、`/tmp/market-period-calendar-types.log`、`/tmp/market-period-calendar-build.log`、`/tmp/market-period-calendar-lint-final.log`、`/tmp/market-period-calendar-boundaries.log`。

## 实际 DSA 读取

复用已运行的目标 DSA 容器，通过其真实 HTTP 日历接口读取；认证密钥仅在容器进程内部使用。请求范围 `2026-09-01`～`2026-10-31`，固定评估时刻 `2026-10-04T12:57:28.107Z`。响应 supported，Provider revision 为 `exchange-calendars-4.13.2-release-evidence-v1`，事实可用时刻为 `2026-03-10T03:24:37.055242+00:00`。

宿主机当前投影代码成功生成 38 个交易日、76 个 Session，revision 为 `market-period-calendar-v1:d7be78daa96d676883e357885764aa1a784240b76cac031792746ad9ca983f48`。日历包读取没有行情 Provider 网络请求或业务数据写入。临时日志为 `/tmp/market-period-calendar-target-readonly.log`。

这层证据是“实际目标 DSA 读取 + 宿主机新投影代码”，目标 Server 尚未同步新的日历读取服务，不作为目标 Server 完整派生路径通过。T1.3/T4 之前的官方快更及计算证据仍仅覆盖当时输入；本次不重复构建镜像。

## 保留任务

T3.2 的基础日线窗口、实际预热、双层上限、完整口径、缓存与桶边界分页尚未完成；T3.3 的公开成功响应及能力声明继续开放。T5/T6/G1/P1/R1 和完整 AC 未关闭。详见[原任务清单](../../archive/tasks/2026-09-16-market-chart-period-aggregation.md)。

## 年度计划前置修正（T3.1b）

窗口装配预检确认上述初始读取沿用了回测结算的 104 日预算，不能承担年初完整年度计划。已建立独立 DSA `/market/calendar`，复用相同实际来源与事实信封；Server 读取服务改用该路径。展示允许未来最多 366 日、总跨度最多 20000 日，原 `/backtest/calendar` 的 104 日预算保持原行为。所有计划仍必须位于包实际覆盖内且满足已登记可用时刻。

双方定向验证通过：Server 33 项投影/读取、2 项新客户端传输、13 项旧客户端回归，共 48 项；DSA 新入口及原依赖事实、发布时刻、已安装日历、周期指标五文件共 56 项通过、5 个既有警告。Server 类型/lint/边界、Python 编译/关键 lint 通过。初次 pytest 发现新测试导入了错误的错误处理中间件位置，修正测试导入后完成回归，产品逻辑没有因此改变。

日历事实读取与信封装配提取到 `src/services/thesis_ledger_calendar_contract.py`，保持其领域所有权；DSA 大文件 `api/thesis_ledger.py` 从本轮开始时的 1939 行降到 1933 行，没有为新增入口扩大存量文件。中文端点说明与 CHANGELOG 已维护。

稳定源码经官方 `sync-code.sh all` 同步成功，DSA/Server/Worker healthy，镜像 ID 保持原值，未改变数据库、依赖或外部卷。实际目标新入口读取 `2026-01-01`～`2026-12-31`，固定评估时刻为 `2026-03-11T00:00:00Z`；包的已登记可用时刻仍为 `2026-03-10T03:24:37.055242+00:00`。宿主机当前投影生成 242 个交易日、484 个 Session，revision 为 `market-period-calendar-v1:da98dec414dcb8544dc78dc105b6e3386bdf38fe7c6402b95cbfedba5ac8d4aa`。

目标 HTTP 四项检查通过：新入口完整年度 supported、旧回测入口相同请求仍 422、无认证 401、超过展示未来预算 422。指标合同 10 项与 Journal 保护检查再次通过，旧快照、统计和受保护 Ledger 哈希保持一致。没有行情 Provider 请求或业务数据写入。日志为 `/tmp/market-display-calendar-target-readonly.log`、`/tmp/market-display-calendar-indicator-protection.log`、`/tmp/market-display-calendar-journal-protection.log`。目标 Server 已同步并健康，但完整公开派生装配仍未完成；上述逐日投影仍是在宿主机新代码执行，不冒充公开 HTTP 成功路径。
