# Efinance ETF 报价旧 source 冷却兼容

## 精确边界

DSA Runtime 对 `efinance × REALTIME_QUOTE × ETF` 的旧 `efinance` 与新 `eastmoney` RouteTarget 都调用同一个 `get_realtime_quote_single_symbol`，但 Control 原持久预算键含 `upstreamSource`。在已应用 V2 Policy 下切换 alias，原 600 秒冷却可被绕开。此修复只合并这一已证明同请求的预算身份；旧 Desired/Effective、执行 provenance、准入、健康/熔断及 Server 冻结指纹均不修改。

## 实施与红绿证据

- 新纯函数 `request_budget_keys` 仅对上述 Provider/能力/资产/两个 source 返回规范 `eastmoney` 写入键、旧 `efinance` 键与无 source 的 V1 键；其他组合保持原键。Control 在原 `BEGIN IMMEDIATE` 事务内按最晚到期时间检查三个键，任一未到期即拒绝；允许时只对规范键原子预留。旧 alias/V1 行不删除或延长，历史 RouteTarget 原文不变。
- 新测试修前 **4 failed、1 passed**：旧→新、新→旧、V1→V2 均绕过冷却，实际 Runtime 在换 source 后第二次调用同一 ETF adapter；无关能力/Provider 的独立性对照已通过。
- 修后加入旧格式 SQLite 行的直接播种与到期保真检查。首次合并测试 **80 passed、1 failed**，失败是测试用新入口生成旧行，而新入口已经写规范键；改用隔离库旧格式行后，唯一一次定向重试六文件 **81 passed**、4 条现存第三方/收集 warning。新叶 6 项覆盖双向切换、V1 键、旧 alias 行保留、到期和无关来源，并通过实际 V2 Runtime 单标调用次数验证。
- 新模块/测试完整 flake8，Control 限定 critical flake8、三个改动 Python 文件编译及 Control/变更记录改动空白检查通过。官方 `./scripts/ci_gate.sh syntax` 通过；`flake8` 阶段首次因 shell 未配置 `.venv/bin` 而在检查前退出 127，补齐 `PATH` 的唯一重试为 **critical 0、退出 0**。未重跑此前失败且已重试的 DSA 官方完整离线门禁，未请求真实 Provider、账号、目标数据库或目标容器。

## 剩余义务

预算安全前置不是完整 source alias 迁移。旧 Desired/Effective 实际库存、准入与健康/熔断键、跨 Provider 的同上游独立性、冻结与审计引用仍须按版本化合同盘点和验证；STOCK/NAV 与 AKShare 也不从此 ETF 预算用例外推。G0-M、目标应用更新和完整 Spec AC01–AC20 保持开放。
