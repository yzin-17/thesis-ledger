# Efinance 净值来源健康作用域续接

日期：2026-09-28。任务：`CONT-R03-efinance-nav-alias-health-resume`。结论：改变测试前提后的限定本地实现通过；原失败与真实来源门禁保持独立记录。

## 续接前提与范围

[上一叶](2026-09-28-cont-r03-efinance-nav-alias-health.md)在一次修正重试后停止并撤回实现：健康读取已得到 open，Runtime 未调用操作，但测试仍要求公开错误为内部 `circuit_open`。本轮先核对当前 DSA 源码确认撤回仍在，再复用已通过的 [AKShare 净值公开请求断言](2026-09-28-cont-r03-akshare-nav-alias-health.md)：旧 open 时只断言公开请求失败且 adapter 零调用，不把 `effective_policy().routeStatus` 展示层或内部错误码当执行合同。这是新的可执行验证前提；未重试上一叶的真实来源请求或官方完整离线门禁。

DSA Runtime 对正式/历史净值均调用 `_fund_nav_from_provider`，在两种能力中忽略 source，并用同一 Efinance `get_fund_nav_history` Reader。修改仅在每个能力内合并旧 `efinance`、新 `eastmoney` 与 V1 无 source 的持久健康读取、规范新写入和进程内熔断身份；两种能力之间、股票/ETF 报价和其他 Provider 保持隔离。旧健康行、路由、执行来源、准入及冻结原文不改。DSA 能力目录四条净值行同步说明当前安全边界。

## 验证

- 新专属测试在旧实现下 12/12 failed：双向与 V1 旧 open 查不到、公开 Runtime 实际调用了读取器、过期旧行后的规范健康未合并、进程内 alias 切换多调用了一次。失败对应生产行为，未出现上一叶的展示层或错误码断言问题。
- 修复后新专属测试 12/12 passed；与 AKShare 净值和旧来源健康合并 31/31 passed。扩大到两家净值/股票 alias、V2 路由、Control V1/V3 和 Runtime 的 9 文件 110/110 passed。
- 改动三个 Python 文件的完整 `flake8` 和 `py_compile` 退出 0。未执行此前已失败的 DSA 官方完整离线门禁、真实 Provider、隔离数据库、目标 Docker 或浏览器。

本叶只关闭 Efinance 两种净值能力的本地别名健康绕行。Efinance/AKShare 完整 source alias 版本化迁移、来源正式性/披露与历史修订、G0-M、AC20、目标首条回测和主 Task §13 仍开放。
