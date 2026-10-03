# Market 公开路由与客户端切换证据

> 2026-09-29；对应[单一现行链路替换任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)的 E02、U01。只记录源码和本地验证，目标 Server/Desktop 尚未部署。

## 改动

- Server 当前 Market 读取 Controller 使用 `/api/market/:symbol/*`，Market 设置、Provider、目录与政策 Controller 使用 `/api/market-data/*`。`main.ts` 将两组路径排除在应用默认 `api/v1` 前缀之外；原 `/api/v2/market*` Controller 注册已移除。
- `MarketV2Controller` 改为 `MarketController`；API Client、Desktop Market Data、OAuth、Onboarding 与 Portfolio 的调用路径同步改为现行路由。路由元数据及客户端传输断言同步更新。
- 本叶只处理公开路由名称和调用接线。Controller 内的来源别名、默认口径、缓存和 Market Reader 合同尚需 E02 逐项核对；DSA 上游路径也尚未改动。旧 URL 的目标 HTTP 404 及新 URL 的真实端到端响应未验证。
- 隔离 Nest HTTP 测试实际启动当前 Market Data Controller：`/api/market-data/policy` 返回 200，旧 `/api/v2/market-data/policy` 返回 404。此测试不连接目标数据库、DSA 或正式 Server；目标路由仍须独立验证。

## 本地验证

| 层级 | 结果 |
| --- | --- |
| Server 定向 | 4 文件、42 项通过。 |
| 隔离 HTTP | 2 文件、6 项通过，包含新旧路径实际响应。 |
| API Client | 类型检查、6 文件/36 项测试、build 均通过。 |
| Desktop | 类型检查、定向 3 文件/31 项、包级 76 文件/513 项、build 均通过。 |
| Server 包级 | 226 文件通过、25 文件跳过；1782 项通过、91 项跳过；类型检查和 build 通过。 |
| 边界与引用 | `node scripts/check-boundaries.mjs`、相关 `git diff --check` 通过；运行时 `apps/server/src`、`packages/api-client/src`、`apps/desktop/src` 无 `/api/v2/market` 引用。 |

## 后续门禁

按 E02/U01/D02 在目标环境使用官方 infra 入口同步 Server、Worker、Desktop 后，再验证新路由、旧路由拒绝、鉴权、缓存隔离、真实 Reader 响应、浏览器 Network/Console 及业务数据覆盖。不能以本地路由元数据替代 HTTP 验收。
