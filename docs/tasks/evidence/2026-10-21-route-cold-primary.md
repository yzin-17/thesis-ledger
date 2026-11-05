# RouteTarget 主源新进程冷态回执

按[精确预案](2026-10-21-route-cold-primary-plan.md)补齐原 RouteTarget G1 的单一主源冷态差集。主线程执行，原十三账户和全部业务保留，真实模型零调用、DG3 TODO、故障切源暂停均保持。

## 实际一次冷态

现有 DSA 容器内新建一次性 Python 进程，首次 Runtime 及适配器构造，通过正式鉴权 ASGI `POST /api/v3/thesis-ledger/market/chart-bars` 读取 `510300.SH`、CN/ETF/qfq/1d、2024-07-15～19，pin 为 HiThink / `fund-market-historical` / routeIndex 0。没有预热或失败重试，也没有重启正常服务、启停来源、改路由或清缓存。

HTTP 200，五个准确交易日、complete 状态和正数收盘价全部通过；真实来源、routeIndex 0、effectivePolicyRevision 164 与计划一致。宿主测量整个新进程为 **1537.267ms**，小于主源 5000ms 门槛；Python 启动至响应 1353.124ms，正式路由请求 303.489ms。阈值按整个进程判断，没有只用路由耗时冒充冷态。

Runtime 开始为空，首次请求后产生；未加载模型模块。正式 ASGI 应用、鉴权、当前选路及响应投影均使用目标产物；进程内传输没有独立 TCP 监听。没有进入额外 data_lifespan，避免第二套 index/公告/catalog 工作者领取旧任务。该证据覆盖新进程首次路由与 Provider 的冷态，不能宣称正常服务完整停启性能，也不代替已暂停的主源失败/备用成功场景。

五份关键实际 Python 产物与宿主逐字节一致，摘要原样保存在回执：`api/data_app.py`、`api/thesis_ledger_chart_v3.py`、`src/services/thesis_ledger_provider_runtime.py`、`src/services/thesis_ledger_bar_route_execution.py`、`data_provider/thesis_ledger_sources/hithink.py`。

## 保护和证据

执行前后完整目标保护 JSON 逐字节相同，SHA-256（含换行）仍为 `20ac5252350b379035ec4c22e0791f29c1997502decda8753a3e1a14e69ccfbb`。来源启停、配置/凭据版本、原十六条路由及政策 164 保持；没有业务写入或模型调用。标准数据读取允许现行 SDK 自身的正常数据处理，脚本不保存日志或凭据。

`scripts/market-route-cold-acceptance.test.mjs` 的 10 项保护测试通过，Python AST 解析通过；覆盖启动慢、预热 Runtime、后台生命周期、模型导入、旧产物、替换来源/政策、缺交易日和失败响应。正式执行只运行一次，没有热态重试。

原始文件位于 `.recovery-artifacts/remaining-p1-2026-10-20/route-cold-*`。计划指纹 `9de1f3fe29b3e597ae177ad2fe1b8485d97eeccea422d23aa8b6824120b16f51`，requestId `2ec73f8d-ac21-4c6c-a53b-785cf3d7853b`；结果 SHA-256 为 `e38fd323ef49585ba4ce559b2e5f410c639af80633c52652ffe10794cd95cdae`，包含原响应、全过程耗时、源代码摘要和独立保护；实际输入指纹为 `235fc4f39e60153f42833bef6bd4ee627198fab30d9383f94733d2fe30b6365c`。

本精确已选窗口的必要冷态叶通过。原 G1 继续保留“主源失败后备用成功 ≤10s”的用户暂停条件，其他来源/窗口不由本次批量通过；不因此恢复切源。
