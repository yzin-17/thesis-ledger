# RouteTarget 主源冷态预案

对应[实施 Task](../2026-10-21-route-cold-primary.md)。用户已授权后续验收，当前原十三账户/全部既有事实保护基线为 `20ac5252350b379035ec4c22e0791f29c1997502decda8753a3e1a14e69ccfbb`。不改来源、凭据、路由、默认或业务记录。

## 请求与冷态范围

现有 DSA 容器内运行一个专用新 Python 进程；包括导入、创建正式数据 ASGI 应用、首次 Runtime/适配器构造及响应投影，宿主脚本测量整个子进程窗口。调用一次正式 `POST /api/v3/thesis-ledger/market/chart-bars`，沿用容器内现有 Token 完成鉴权，不输出或复制凭据。

精确输入固定为 `510300.SH`，CN/ETF/DAILY_BAR/1d/qfq，2024-07-15 至 19；pin 为 HiThink / `fund-market-historical` / routeIndex 0。必须与当前已选目标一致。使用新进程内 ASGI 传输，Runtime 与适配器开始时为空，不读取主 Server 的 BarSeries 缓存；直接进入正式当前路由执行。只发本次一个业务请求，不进行预热、探针、强制切源或失败重试。

不进入额外 data_lifespan，避免 index/公告/catalog 后台资源处理旧任务；不把此结果宣称为正常服务完整冷启动或 TCP 监听启动性能。原要求是主源路由调用冷态 ≤5 秒；本次单独记录进程总耗时和路由耗时，不用路由耗时替代总窗口。

## 验证与停止

HTTP 200、五个正确日期、真实 HiThink 来源、routeIndex 0、政策版本不变、源口径与指纹完整，且整个进程 ≤5000ms 方可通过该精确叶。HTTP 失败、超时或超过阈值均保留实际失败，不热态重跑以制造通过。运行时关键 Python 源码须与宿主当前输入摘要一致；不得注入假价格或就绪证明。

脚本限时终止仅本次专用进程，正常服务/Worker 不重启。原十三账户、成功回测、AI 事实/默认/密文与完整目标保护 JSON 必须逐字节保持；来源配置版本及原十六条路由保持。正常 Provider SDK 的本地会话/元数据读取按现行实现执行，不放宽鉴权、admission 或选路。真实模型暂停及 DG3 TODO 不变。
