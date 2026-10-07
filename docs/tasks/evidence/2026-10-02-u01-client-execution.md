# U01 客户端执行包

## 验收范围与顺序

沿用 Canonical Spec 与 Task 的 U01 范围。当前 Run、Ledger 与 NAV 已有完成证据；本组仍须检查客户端实际消费路径并完成真实桌面或浏览器 Network、Console 验收。

- [x] U01-a：目录任务消费边界。Desktop 同步与轮询只接受现行任务响应，绑定查询任务 ID，区分目录状态与任务状态；查询失败停止轮询并显示中文错误。定向合同与状态测试、Desktop 类型及 build 验证。
- [x] U01-b：Market 其余控制响应、Run、Ledger 的实际客户端路径与旧分支审计，按发现补齐必要校验和定向交互测试。
- [x] U01-c：最终构建产物连接目标 API，完成真实浏览器 Network、Console 与正常/拒绝路径验收；U01 父项完成。

## U01-a 写集与约束

写集限于 Desktop 的目录任务响应解析、相关 API、查询终止条件、进度反馈及定向测试。沿用 Server 当前公开 `/api/market-data/catalog/*` 响应，不将 DSA 专属 DTO 提升到共享核心。保持 TanStack Query 管理请求与缓存。页面已有职责提取到目录进度 Hook，避免继续增加页面体积。

成功必须同时满足现行版本、consumer、任务 ID、成功目录 generation/checksum/cursor、投影数量与 acknowledged 一致；旧无版本响应和错位任务不得显示成功。任务查询错误停止自动请求，用户可以重新发起同步。目录来源故障不能视作目录刷新成功。

本阶段不修改目标凭据、Provider Policy、数据库结构或手工制造目录成功任务。U01-a 的本地验证不能替代 U01-c。

## U01-a 实施与验证证据

- 新增 Desktop 所有的 `catalog-job-response.ts`，分别校验任务身份、租约元数据、成功投影；公开响应只提取当前页面消费的字段。同步 POST 与任务 GET 均经解析，GET 额外绑定请求 ID。拒绝 V2、缺版本、错误 consumer、额外旧字段、错位 cursor、旧 checksum、不完整成功投影和矛盾 ACK。
- `CatalogStatus` 去除任务专属字段，避免继续混用本地目录状态与同步任务响应。
- TanStack Query 禁用任务自动重试、窗口重新聚焦与网络恢复重取；错误或终态停止轮询。专用 `useCatalogJobProgress` 在查询失败时先显示中文失败并清空活动任务；只有已确认成功才显示成功和失效目录缓存。页面从 322 行缩为 309 行。
- `pnpm --filter @thesis-ledger/desktop test test/catalog-job-client.test.ts`：17 项合同、当前 URL、ID 绑定、状态及轮询决策测试通过。
- 最终 `pnpm --filter @thesis-ledger/desktop test`：80 个文件、540 项测试通过。
- `pnpm --filter @thesis-ledger/desktop build`：TypeScript 检查与 Vite 构建通过；保留既有大 chunk 提示，未调整阈值。
- 写集 ESLint 与 Prettier 检查通过；新增解析模块、Hook 和测试的复杂度 20 门禁通过。存量页面与路由解析函数仍超出 20 的建议阈值，本轮未增加其条件分支或提高门禁阈值。
- `node scripts/check-boundaries.mjs` 与 `git diff --check` 通过。

以上保存 U01-a 当时的本地证据。本轮 U01-b/c 和 U01 父项已完成，最终542项、build及真实交互见[最终收口证据](2026-10-02-canonical-final-completion.md)。
