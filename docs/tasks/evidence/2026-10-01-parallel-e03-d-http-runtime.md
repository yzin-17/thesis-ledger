# E03-d 生产 HTTP 与运行时续行证据

日期：2026-10-01。续行请求：“继续”。

## 当前结论

此前 N3 测试类型错误已由其所有者修复。本轮 Server build 与 typecheck 通过，E03 隔离 PostgreSQL 的生产 HTTP 闭环通过。共享目标更新完成镜像构建后，在保留数据升级的隔离演练中被“旧数据保留校验”拒绝；Server/Worker 保持停止，E03 目标命令与浏览器验收因此未执行。本轮没有重复部署或操作共享消费者。

E03-c 的本地实现及夹具浏览器证据见 [E03-c 与部署前置](./2026-10-01-parallel-e03-c-client-and-e03-d-gates.md)。E03-b 的经济 golden、并发与故障注入回滚见 [E03-b](./2026-10-01-parallel-e03-b-ledger-projections.md)。这些记录中的旧阻塞描述保留其当时证据边界，以本续行记录描述后续状态。

## 新增可复用验收输入

- `apps/server/test/ledger/current-envelope-http-probe.ts`：直接请求生产路由，严格解析当前响应；仅允许向调用方提供的空账本账户写入，保留审计事实。
- `apps/server/test/ledger/current-envelope-http.integration.test.ts`：真实 PostgreSQL、普通 app role、生产 LedgerController、命令服务、查询服务、仓储、InstrumentDirectoryService 与 ApiExceptionFilter 的 HTTP 验证。未挂载的导入、重建和对账服务是测试占位，测试不调用这些入口。
- `scripts/ledger-current-acceptance.ts`：复用同一 HTTP 验收逻辑，限制本机 HTTP，要求专用空账户、专用旧记录账户和旧事件身份。先检查旧行拒绝，再写入新事件；不包含建库、结构升级、容器更新或自动清理。

目标脚本调用示例：

```sh
LEDGER_ACCEPTANCE_CONFIRM=e03-d-dedicated-accounts \
LEDGER_ACCEPTANCE_ACCOUNT_ID=<专用空账户 UUID> \
LEDGER_ACCEPTANCE_OLD_ACCOUNT_ID=<专用旧记录账户 UUID> \
LEDGER_ACCEPTANCE_OLD_EVENT_ID=<旧事件 UUID> \
pnpm --filter @thesis-ledger/server exec tsx ../../scripts/ledger-current-acceptance.ts
```

默认输出 `/private/tmp/e03-d-target-http.json`。若目标需鉴权，沿用 `THESIS_LEDGER_API_TOKEN`，不在证据中记录凭证。失败运行不输出成功证据，也不删除已成功写入的事实；重新验收应使用新空账户。

## 隔离 PostgreSQL 与生产 HTTP

独立容器 `e03-d-ledger-http-20261001` 使用 tmpfs 与 `127.0.0.1:49801`，数据库 `ledger_current_fixture`，owner `e03_b_owner`，app role `e03_d_app`。由当前完整 migration、raw-owned inventory 与官方应用角色 SQL 建立结构，结果为 25 个 migration、71 张表，head `20261001100000_nav_backtest_preparation`。app role 的 superuser、createdb、createrole 均为 false。

结构生成复用 `/tmp/e03-b-structure.ts`。首次 psql 装配缺少 bootstrap SQL 所需的角色环境变量，事务退出；补齐环境变量后完整重建成功。首次 HTTP 测试又发现 Vitest 不生成 Nest 构造参数元数据，测试装配补充与生产 build 一致的 `design:paramtypes` 后通过；生产 Controller 未修改。

定向命令：

```sh
LEDGER_CURRENT_TEST_DATABASE_URL=<独立本机 app role URL> \
pnpm --filter @thesis-ledger/server exec vitest run \
  test/ledger/current-envelope-http.integration.test.ts --maxWorkers=1
```

两项测试通过，覆盖：

1. 现金存入、成交创建、幂等重复、数量修订、撤销、恢复、审计与 revision 2 历史重放。最后账本及投影版本均为 5，五条审计事件均为信封 3、经济 payload 1，持仓 10 份、现金 898、待付为 0。过期 revision 返回 `LEDGER_REVISION_CONFLICT`，拒绝前后审计响应相同。
2. 旧空信封版本通过有效事件读取、审计读取、创建、修订、撤销五类生产 HTTP 请求均返回 409 和客户端可解析的 `UNSUPPORTED_CONTRACT_VERSION`。事件原行不变，没有新增账户账本状态、持仓或现金投影。

日志 `/tmp/e03-d-http-isolated.log`；结构日志 `/tmp/e03-d-http-structure.log`。验证后停止本轮 `--rm` 隔离容器，临时数据库已删除。临时文件可能随本机环境清理失效。

## 本轮静态门禁

| 输入与命令 | 最后结果 | 证据 |
| --- | --- | --- |
| 共享源码：`pnpm --filter @thesis-ledger/server build` | 通过 | `/tmp/e03-d-server-build-resume.log` |
| 新增 HTTP 测试与 helper：Server typecheck | 通过 | `/tmp/e03-d-server-typecheck.log` |
| 新增三文件 ESLint | 通过 | `/tmp/e03-d-http-eslint.log` |
| 新增三文件 Prettier、定向 diff 空白检查 | 通过 | 本轮命令输出 |
| `node scripts/check-boundaries.mjs` | 通过 | 本轮命令输出 |

本轮没有修改生产源码。共享 build 与类型检查通过不代表目标已部署。

## 目标运行态前置

只读确认目标数据库名与 owner 均为 `thesis_ledger`，结构仍为 `20260930100000_rebase_legacy_market_policy`；目标应用容器保持旧运行态。现有账户和 Asset 数量均为 0，目录搜索可以解析 `600519.SH`；后续新事件验收还需通过应用正常身份确认流程建立 Asset，不能跳过成交身份门禁。

本轮 Desktop Vite `127.0.0.1:5189` 代理实际目标 `127.0.0.1:3000`；浏览器账户页与实际账户 API 均读取成功。随后通过实际浏览器创建 `E03 验收（固定经济输入）`，账户身份 `0e9677d2-98c6-45b1-8bc3-8d07b9209180`，证券类型、模拟模式、CNY；目标 API 回读一致，创建时间 `2026-10-01T08:19:45.768Z`。还通过成交表单的真实目录搜索与选择完成 `600519.SH` 身份确认，目标 Asset 为 confirmed。没有提交成交，未写入目标 Ledger 事件；账户创建和身份确认不代表 E03-c 账本动作验收通过。

共享更新由另一个会话执行：首次基础镜像网络 EOF、随后 Buildx 沙箱写入失败均未进入数据库升级；该会话获得权限后再次调用官方更新入口，已进入 DSA 依赖及 SDK 构建。E03 本轮只复用其部署结果，不并发发起另一轮更新。

### 共享升级的最终阻塞

官方更新最终完成镜像构建、停止消费者，并在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.database-upgrades/run.BSpyKk` 保留 `backup.dump` 和 `image-input.json`。日志 `/private/tmp/n4-nav-update-all-build.log` 返回：

> 保留数据升级准备失败：隔离演练（隔离演练阶段失败：旧数据保留校验）。

结构 head 未升级，Server/Worker 保持停止，PostgreSQL、Redis、旧 DSA 仍运行。本轮未尝试重启消费者、清库或绕过保留校验；升级所有者已在“N3 NAV 离线执行分支”会话开始调查具体差异，此问题属于共享升级写集。

失败后只读复核：专用模拟账户及 confirmed Asset 保留，目标 LedgerEvent 数量为 0。目标没有新增成交、修订、撤销或旧行夹具；验收脚本尚未对目标执行。已关闭本轮浏览器标签并停止 Vite，专用账户与身份关联保留供后续验收，不做清理。

- [x] 当前普通 app role、完整隔离结构、生产 HTTP 新事件及旧行拒绝。
- [x] 本轮共享 Server build 和新增测试类型门禁。
- [ ] 目标更新完成，结构、应用角色、Server/Worker 与 E03 生产输入一致。
- [ ] 目标专用账户 HTTP 闭环、经济投影与旧行拒绝取证。
- [ ] 实际 Desktop 浏览器的创建、更正、撤销与审计及旧记录错误交互。

下一步先由升级所有者修复隔离演练的保留校验并完成官方更新；再复核 E03 输入同源，创建专用旧行夹具、执行目标 HTTP 脚本及浏览器账本动作验收。E03 整体仍开放；本轮不修改共享主 Spec、Task、handoff，不把隔离验证替代目标验收。
