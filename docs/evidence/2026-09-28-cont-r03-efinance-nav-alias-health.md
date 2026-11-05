# Efinance 净值来源健康兼容卡点

日期：2026-09-28。状态：`skipped_after_retry`；本叶生产与测试改动已撤回，Spec 需求保留。

## 已确认的边界

DSA Runtime 的 `FUND_NAV` 与 `FUND_NAV_HISTORY` 都调用 `_fund_nav_from_provider`，该入口使用相同的 `adapter.get_fund_nav_history`，不读取所选 `upstreamSource`。两种能力的健康状态仍须彼此隔离。当前精确 source alias helper 尚未合并这两种能力的旧 `efinance`、新 `eastmoney` 和 V1 无 source 健康身份，Spec §3.3 已记录待实现合同。没有读取真实净值、账号或目标容器。

## 尝试与停止原因

- 新合成测试在旧实现下 11 项中 10 failed、1 passed：旧健康 open 可被另一 alias 绕开，跨能力独立对照通过。
- 首次本地源码尝试扩展了精确 alias helper；定向组合 18 项中 6 failed、12 passed。失败集中于测试要求 `effective_policy().routeStatus` 展示 `circuit_open`，但该净值路由展示层并不承担此判断。
- 唯一一次定向修正将断言移到实际健康读取和 Runtime 领取前的断路器，18 项仍为 6 failed、12 passed。健康读取已返回 open，Runtime 未调用操作，但对无可执行目标返回公开错误码 `NO_ELIGIBLE_PROVIDER`，不是测试断言的内部 `circuit_open`。

按本轮一次重试预算停止，未继续改断言或第三次运行。已精确撤回本叶在 alias helper 与既有 ETF 健康测试中的改动，删除本叶未通过的新增测试；前一条 Efinance 股票报价健康修复及其证据原样保留。没有运行 DSA 官方离线全包或目标同步。本叶不能标记实现完成；后续需在失败前提改变后重新固定净值消费面的公开错误合同与可执行验证边界，再独立实施。R03.3/R03.4、G0-M、AC20 和主 Task §13 保持开放。
