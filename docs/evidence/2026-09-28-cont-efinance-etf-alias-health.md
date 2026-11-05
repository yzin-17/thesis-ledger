# Efinance ETF 报价旧 source 健康熔断兼容

## 边界与修复

DSA `efinance × REALTIME_QUOTE × ETF` 的旧 `efinance` 与新 `eastmoney` RouteTarget 实际调用同一单标 adapter。此前 Control 的持久健康行和 Runtime 的进程内熔断均以 source alias 分键，切换路由可跳过仍在 60 秒窗口内的 open。新身份函数只对该精确组合返回规范 `eastmoney`、旧 `efinance` 与 V1 无 source 三个健康读取键；预算键复用同一 alias 判定。Control 对任一未过期旧 open 保守优先，并将新健康状态只写规范键；Runtime 熔断键同样规范化。旧行、RouteTarget、执行 provenance、Policy、V3 准入和冻结身份不重写。其他能力、Provider 和不在此 alias 集合内的 source 保持原作用域。

## 验证

- 新专属测试在修前 **4 failed、2 passed**：旧 open→新 alias、新 open→旧 alias、V1 open→V2 alias 的 Effective 状态与 Runtime 均可绕过，进程内连续失败可因 alias 切换多发一次请求。过期半开及无关范围的原行为已通过。
- 修后专属 **7 passed**；新增规范 closed 与旧 alias 未过期 open 并存反例。真实隔离 SQLite 中直接植入旧格式行，重开 store、重投 V2 策略后验证 Effective 和 Runtime 一致；过期旧 open 允许单次探测并保留旧行，成功后规范行关闭。进程内三次失败跨 alias 共用计数，调用参数仍保留所选 source。
- 相邻 `source_alias_budget`、Provider Runtime、Control、Control V3、V2 dependencies/tradability 与本叶合并 **97 passed、5 条既有第三方/收集 warning**。`./scripts/ci_gate.sh syntax`、补齐 `.venv/bin` PATH 的官方 `flake8` critical 0、改动 Python 文件编译、新 helper/测试完整 flake8 与跟踪文件 `git diff --check` 均退出 0；Control 原 `_health` 读取逻辑移至有归属的精确健康模块，大文件未因该职责增加规模。

## 未完成

本地合同回归不证明目标 DSA 容器已加载代码、真实 EastMoney 请求或独立备用资格。DSA 官方 `offline-tests` 此前失败且已重试，本轮不第三次运行，也不越过该低层失败调用 `update.sh all`。STOCK/NAV、AKShare、历史冻结/审计与跨 Provider 实际同源身份仍需完整版本化迁移合同，G0-M、目标运行态、M2/M3 和 Spec AC01–AC20 保持开放。
