# AKShare 股票东财报价旧 source 健康熔断兼容

## 精确来源

DSA Runtime 对 `akshare × REALTIME_QUOTE × STOCK` 的旧 V2 `akshare` RouteTarget 调用 `get_realtime_quote(symbol)`，当前 AkshareFetcher 默认参数 `source="em"`；新 V2 `eastmoney` RouteTarget 显式传 `source="em"`，两者进入同一 `stock_zh_a_spot_em` 读取与内部 `akshare_em` 熔断。V1 无 source 的 Runtime 分支却传 `source="sina"`，因此历史无 source 健康行不能纳入东财双 alias。该结论是当前代码与受控 adapter 的本地事实，不是上游真实性、单位或权限验收。

## 实施与验证

- 纯 source 身份函数只对上述股票报价组合返回规范 `eastmoney` 与旧 `akshare` 两键，不含 V1 无 source。既有 Control 健康读取对最近 60 秒的任一 open 保守优先，写入与 Runtime 进程内熔断使用规范键；过期旧 open 可沿原半开路径探测。旧行、RouteTarget、执行 provenance、Policy、准入、冻结均不改；ETF 预算仍只对原 Efinance 三键合并。
- 隔离 SQLite 中直接播种旧格式健康行并重投 V2 Policy，专属红例 **5 failed、2 passed**：旧→新、新→旧、过期后规范读回、旧 open/新 closed 并存、跨 alias 连续失败。V1 新浪与其他能力独立先行通过。
- 修后专属 **7 passed**，连同 Efinance ETF alias、预算、V2 路由、Provider Runtime、Control/V3、依赖与 tradability 合计 **119 passed、5 条既有第三方/收集 warning**。`./scripts/ci_gate.sh syntax`、配置本地 `.venv/bin` 的官方 `flake8` critical 0、新 helper/测试完整 flake8 均通过；本叶不增加存量大 Control/Runtime 文件规模。

## 边界

未发真实 AKShare/EastMoney 或账号请求，未更新目标源码/数据库，也未重跑此前失败且已重试的 DSA 官方 `offline-tests`。股票报价的旧策略、V1 新浪身份、跨 Provider 东财同源、AKShare 净值与其他能力、旧冻结/审计和 G0-M 均须在完整版本化迁移及目标验收中处理。本地健康兼容不使 R03 alias 父项或 Spec AC01–AC20 通过。
