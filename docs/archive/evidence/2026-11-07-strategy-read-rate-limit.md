# 策略读取限流修复验证

日期：2026-11-07。对应[Spec](../../specs/2026-11-07-strategy-read-rate-limit.md)与[Task](../tasks/2026-11-07-strategy-read-rate-limit.md)。

## 原因与修复范围

原中间件仅按路径识别重任务，使 `/identity/context`、`/backtests/strategies`、`/backtests/runs` 等同来源 GET 共用每分钟 20 次窗口。状态轮询或页面切换可耗尽该额度。既有 transport 冷却只延迟后续请求，而上下文 Query 关闭重试，首次被拒绝便持续显示工作区读取失败。

Server 将 GET/HEAD 归入已有每分钟 120 次普通额度；原路径下写操作仍使用每分钟 20 次重任务额度，窗口和 Retry-After 未变。Desktop 上下文 Query 仅对 429 按 Retry-After 最多重试一次，缺省等待 60 秒，消费 AbortSignal 以支持取消；同会话缓存、会话隔离和其它错误不重试保持。持续失败提供手动重读，错误说明复用中文业务投影。

排查覆盖原重任务路径的读取控制器、身份上下文、策略列表、回测轮询与 SSE 及共享 transport。没有自动重放模型、身份写入或回测提交，也没有调整 Provider 限流和权限。

## 定向、包级与静态检查

| 输入与命令 | 结果 |
| --- | --- |
| 新增 `test/platform/api-rate-limit.test.ts` 在旧中间件执行 | 4 项均失败，均复现读取被误判 429；日志 `/tmp/strategy-read-limit-before.log`。 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/platform/api-rate-limit.test.ts test/platform/services.test.ts` | 修复后 25 项通过；包含读取分类、120 次普通保护、重任务写保护、方法隔离和既有窗口测试。 |
| `pnpm --filter @thesis-ledger/desktop exec vitest run test/authoring-context-rate-limit.test.ts test/authoring-local-workspace.test.tsx test/backtest-live-consumption.test.ts test/authoring-run-intents.test.tsx` | 19 项通过；新增 8 项覆盖限流等待、请求去重、有界重试、401/403/500、缺省冷却、取消及会话缓存。 |
| `pnpm --filter @thesis-ledger/desktop exec vitest run --maxWorkers=2` | 259 文件通过、1 文件失败，1659 项通过、1 项失败。唯一失败是旧测试仅允许一个请求参数；新增取消信号后更新断言，随后所在文件及关联测试共 19 项通过。未将该定向复核表述为修正后全包重跑。 |
| `pnpm --filter @thesis-ledger/server typecheck`、Desktop `build` | 通过；同步维护入口另完成 Server 与 workspace 依赖构建。 |
| 本次源码与测试文件 ESLint、`scripts/check-boundaries.mjs` | 通过。 |

本次未重跑既有并发行情失败的 Server 全包及全仓复杂度检查；此前共享工作区失败归属保留在[通知提供方验证](2026-11-07-risk-notification-providers.md#共享工作区结果归属)，不声明全工作区全绿。相关日志为 `/tmp/strategy-read-limit-server.log`、`/tmp/strategy-read-limit-desktop-final.log`、`/tmp/strategy-read-limit-desktop-suite.log`、`/tmp/strategy-read-limit-server-types.log`、`/tmp/strategy-read-limit-desktop-build.log`、`/tmp/strategy-read-limit-lint.log` 与 `/tmp/strategy-read-limit-boundaries.log`。

## 实际浏览器与受控恢复

Vite 实际策略库页面 `/strategy/library` 与 Edge Chromium，宽度 1440、1024、768、390。真实上下文、策略提交列表、策略列表、回测记录及账户 GET 返回 200；四宽复用本次实际 GET 结果，避免验收重复消耗真实额度。未发现页面横向溢出、工作区错误或页面脚本异常。截图及响应状态见 `/tmp/strategy-read-limit-real-qa`，日志 `/tmp/strategy-read-limit-real.log`。

另外对上下文 GET 注入 429 或 403，每宽三组共 12 个状态：首次 429 按一秒 Retry-After 等待后恢复；持续 429 只重试一次，等待后没有第三次自动请求，再手动重读取得 200；403 仅请求一次且显示业务错误。开发模式初次挂载取消的请求单独识别，手动重读等待响应完成后才进入下一场景，避免测试竞态。截图及统计见 `/tmp/strategy-read-limit-qa`，日志 `/tmp/strategy-read-limit-browser-final.log`。

上述页面验证的业务写请求和页面脚本异常均为 0；没有在真实服务故意耗尽额度，没有创建回测、调用模型或发送通知。额度耗尽由独立中间件探针验证。

## 目标运行态

依赖、数据库结构和运行时 manifest 未改变；维护入口 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger` 兼容性预检通过并退出 0，日志 `/tmp/strategy-read-limit-sync.log`。Server 与 Backtest Worker 均 healthy。

宿主及两个目标容器的 `apps/server/dist/src/platform/api-rate-limit.js` SHA-256 均为 `d49c1be6f2674cb5f20fc3485446c70dddd40503ee99bfb2d94ebb23b4c1ff78`。镜像 ID 保持 `sha256:57ad8f5474076315284ab521a025dfdc9e523f154218de5a74d426f64891d007`，没有数据库或卷变更。此次为容器可写层同步，未构建新镜像，容器重建后需要重新同步或经完整更新入口构建。
