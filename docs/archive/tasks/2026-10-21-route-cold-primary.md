# RouteTarget 主源新进程冷态验收

接续[RouteTarget G1](../../tasks/2026-10-09-unified-data-capability-adapter.md#route-target-acceptance)，沿用[原 Spec](../../specs/2026-09-16-market-data-route-target-v2.md)。本精确 HiThink 冷态叶已完成，父 G1 的故障备用仍暂停。

- [x] C1 当前单一已选目标、政策 164、源代码/来源配置、冷态前置及五秒全过程上限通过。
- [x] C2 新 Python 进程首次正式鉴权 ASGI 路由真实读取五日；全过程 1537.267ms，通过，未预热或重试。
- [x] C3 真实来源/日期/口径、关键产物和完整保护通过；原数据、来源、路由与模型暂停保持，更新父叶后继续原清单。

[回执](../../tasks/evidence/2026-10-21-route-cold-primary.md)及[预案](../../tasks/evidence/2026-10-21-route-cold-primary-plan.md)保留冷态层级限制。没有正常服务完整停启、额外后台生命周期或故障切源。
