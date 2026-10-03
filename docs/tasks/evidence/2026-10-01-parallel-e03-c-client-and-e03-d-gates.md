# E03-c 客户端实现与 E03-d 部署门禁证据

日期：2026-10-01。

## 结论与范围

依据“完成 E03 所有不依赖 n2 的任务”的续行要求，完成 E03-c 本地实现、契约验证及浏览器夹具验证。E03-d 已核对目标运行态与部署前置，但共享 Server 构建未通过，且目标数据库结构落后于当前源码，因此目标部署与验收仍未完成。E03 整体保持开放。

本轮保留既有脏工作区及 N2、N3、C01 并行修改；共享主 Spec、Task、handoff 未修改。未提交代码，未修改 Backtest、Market、DSA、NAV Schema、Worker、Prisma migration 或 infra。前序 E03-b 的命令、投影及隔离数据库验证见 [E03-b 证据](./2026-10-01-parallel-e03-b-ledger-projections.md)。前序通过结果不代表本轮共享源码或目标运行态已通过。

## E03-c 实现

服务端账本版本拒绝异常补充 `error: UNSUPPORTED_CONTRACT_VERSION`，保留原 `code` 和中文消息，使生产异常过滤器返回的 409 响应符合 API 错误契约。客户端继续使用既有严格版本解析，无版本降级或重试绕过。

新增共用账本契约错误识别与中文提示。账户交易、现金和审计入口遇到旧记录拒绝或账本响应契约失败时，隐藏缓存记录和新增、更正、作废等操作入口，并提供重新加载。现金存入、划转失败反馈复用该中文错误消息。继续使用既有 TanStack Query、Alert、Button、Sheet 和原子样式。

本轮写集：

- `apps/server/src/ledger/ledger-stored-envelope-version.ts`
- `apps/server/test/ledger/current-envelope-http-error.test.ts`
- `packages/api-client/test/ledger-current-transport.test.ts`
- `apps/desktop/src/features/account-data/account-data.ledger-contract.tsx`
- `apps/desktop/src/features/account-data/AccountDataSections.tsx`
- `apps/desktop/src/features/account-data/AccountDataCashSections.tsx`
- `apps/desktop/src/features/account-data/AccountDataAuditSheets.tsx`
- `apps/desktop/src/features/account-data/AccountDataCashDepositSheet.tsx`
- `apps/desktop/src/features/account-data/AccountDataCashTransferSheet.tsx`
- `apps/desktop/test/account-data.ledger-contract.test.tsx`
- `apps/desktop/test/fixtures/ledger-current.html`
- `apps/desktop/test/fixtures/ledger-current.tsx`
- 本证据文件。

## 本地验证

| 验证范围 | 结果 | 日志 |
| --- | --- | --- |
| API Client 新增传输测试 | 3 通过；当前版本接受、旧版本拒绝、409 稳定错误保留 | `/tmp/e03-c-api-targeted.log` |
| Desktop 定向测试 | 4 文件、37 测试通过 | `/tmp/e03-c-desktop-targeted.log` |
| Ledger 消费与仓储定向测试 | 2 文件、15 测试通过 | `/tmp/e03-c-server-targeted.log` |
| 生产异常过滤器与 HTTP 错误契约 | 1 测试通过 | `/tmp/e03-c-http-error.log` |
| API Client 包级测试 | 7 文件、39 测试通过 | `/tmp/e03-c-api-suite.log` |
| Desktop 包级测试 | 77 文件、512 测试通过 | `/tmp/e03-c-desktop-suite.log` |
| API Client build、typecheck | 通过 | `/tmp/e03-c-api-build.log`、`/tmp/e03-c-api-typecheck.log` |
| Desktop build、typecheck | 通过；构建保留既有大 chunk 提示 | `/tmp/e03-c-desktop-build.log`、`/tmp/e03-c-desktop-typecheck.log` |
| 本轮写集 ESLint、Prettier、定向 diff 空白检查 | 通过 | `/tmp/e03-c-eslint.log` |
| `node scripts/check-boundaries.mjs` | 通过 | 本轮命令输出 |
| Server build 最后一次复验 | 失败：N3 测试类型错误 | `/tmp/e03-c-server-build-final.log` |

测试通过不替代目标数据库、HTTP、Worker、Electron 或真实浏览器业务验收。未在本轮重跑全量 Server 测试；其共享 build 仍有未解决错误。

首次 Server build 出现 7 个并行 Backtest 文件错误。发现相关输入随后变化后复验一次，这 7 个错误已消失；最终剩余 `apps/server/test/backtest/backtest-nav-v3-runner.test.ts:80` 的 `bytes[0] ^= 1`，报 TS2532（可能为 undefined）。本轮未修改该 N3 写集，也未在输入不变时重复构建。

## 浏览器夹具验证

使用本轮测试夹具、真实 API Client 与生产 AuditSheet，在本地 Vite `127.0.0.1:5188/test/fixtures/ledger-current.html` 验证以下顺序：

1. 当前 envelopeVersion 3 显示买入记录、“当前有效”和更正、作废操作。
2. 同一 Query key 已有缓存时切换为服务端旧记录 409，打开审计后显示中文契约拒绝提示，缓存买入记录与更正、作废操作消失。
3. 切换为旧 envelopeVersion 2 响应，显示相同拒绝界面。
4. 恢复当前版本后，正常记录与操作重新显示。

浏览器 error、warn 日志为空。截图：[旧记录拒绝界面](/tmp/e03-c-browser-old-row.png)。截图及 `/tmp` 日志为本机临时证据，可能随环境清理失效。验证结束后关闭测试标签及本轮 Vite 进程。

夹具使用固定输入，操作回调为测试占位；未连接目标业务数据库，未实际创建、更正、作废账本命令，也未验证 Electron。浏览器证据仅证明生产审计组件对成功、缓存拒绝及恢复状态的表现。

## E03-d 目标门禁与阻塞

只读检查发现目标 Server、Backtest Worker、DSA、PostgreSQL、Redis 容器运行且健康。目标数据库 `SchemaVersion` 为 `20260930100000_rebase_legacy_market_policy`；当前源码最新 migration 为 `20261001100000_nav_backtest_preparation`。

目标 `/app/prisma/schema.prisma` SHA-256：`f99adc4a701b0d6cbe696fb0a6c2898956c27d71a4135781dd334ee4f0d0f70d`。

宿主源码 `apps/server/prisma/schema.prisma` SHA-256：`e8aeb15ccc385bb6dfdf12e449ef44b8db22e3841d902848216d25872938487f`。

infra `sync-code.sh` 的兼容性预检比较运行时 manifests 和完整 Prisma 目录；当前结构差异要求使用正式 `./scripts/update.sh thesis-ledger` 更新入口。Server build 尚未通过，且更新将带入并行 N2/N3 结构与源码，部署验收因此受到共享工作区前置约束。E03 领域逻辑本身不新增 N2 依赖。

本轮未执行 sync-code 或 update，未绕过门禁手工替换容器或构建应用镜像，未修改目标数据。健康状态不能作为当前源码已部署的证据。

- [x] E03-c 本地实现、客户端契约及夹具浏览器验证。
- [ ] E03-c 目标浏览器或 Electron 验收。
- [ ] E03-d 目标结构及 Server、Worker、客户端源码一致性。
- [ ] E03-d 目标 app role 与账本 HTTP 创建、更正、作废闭环。
- [ ] E03-d 目标旧记录拒绝、原子回滚与真实运行时验收。

后续执行顺序：由 N3 所有者解决测试第 80 行类型错误，待 N2/N3 共享输入稳定并通过构建和结构门禁后，使用 infra 正式更新入口；再执行 E03-d 的独立目标验收并追加证据。当前不能将 E03 或 E03-d 标记为完成。
