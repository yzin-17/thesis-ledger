# E03 客户端与目标运行态最终验收

日期：2026-10-01。续行依据：用户告知 N4 已完成，继续完成 E03 不依赖 N2 的任务。

## 完成结论

E03-b 命令及投影已有本地、经济 golden、并发及隔离 PostgreSQL 故障回滚证据；本轮补齐 E03-c 的实际浏览器动作和旧行错误界面，以及 E03-d 的目标结构、应用角色、Server/Worker 同源、新事件 HTTP 闭环、经济投影及旧行拒绝。该范围达到 `worker_done`，供主任务整合。

共享主 Spec、Task、handoff 保持只读；没有提交、发布或修改 N2/N3 写集。任务主表未由本工作包勾选。实际客户端使用当前 Desktop 源码的浏览器运行面，连接真实目标 API；未执行 Electron，不将浏览器证据写成 Electron 验收。

2026-10-01 前置状态补核时：用户确认 N2、N3 也已完成，主任务的 E01-N2、E01-N3、E01-N4 均已勾选。共享构建及部署前置已解除，不再列为 E03 阻塞；当时“关联 Run”断言尚未覆盖，父项继续开放。后续按用户“继续 E03”的要求核对现行与基线入口，明确该断言为 Backtest 独立 SimulationLedger 经济结果的 Run 关联，而非既有账户事件绑定接口；定向及目标只读验证已补齐，E03 父项和全部子项已整合勾选，见[最终收口](2026-10-01-e03-backtest-association-closeout.md)。此前共享主文件只读的执行记录保留其当时范围。

前置证据：

- [E03-b 命令、投影与隔离数据库](./2026-10-01-parallel-e03-b-ledger-projections.md)。
- [E03-c 本地实现、客户端契约与夹具浏览器](./2026-10-01-parallel-e03-c-client-and-e03-d-gates.md)。
- [E03-d 当前完整隔离结构与生产 HTTP](./2026-10-01-parallel-e03-d-http-runtime.md)。
- [N4 官方更新、保数据升级与目标验收](./2026-10-01-n4-nav-target.md)。此前保留校验阻塞已由该任务修复并完成官方更新，旧记录中的失败描述保留其当时状态。

## 目标结构与运行面

目标为 `thesis-ledger-dev`，数据库与 owner 均为 `thesis_ledger`。本轮复核实际 head 为 `20261001100000_nav_backtest_preparation`，public 表 71 张。Server、Backtest Worker、DSA、PostgreSQL、Redis 五个容器均 healthy。

Server 与 Worker 的实际连接角色均为 `thesis_ledger_app`，数据库均为 `thesis_ledger`。该角色不是 superuser，不能 createdb 或 createrole；`LedgerEvent` 的 SELECT、INSERT 为 true，UPDATE、DELETE 为 false，`SchemaVersion` UPDATE 为 false。

Server 与 Worker 的容器 image ID 均为 `sha256:ca749e4f5a2874aa5af3f8d2b66d208e6629ca70ea02f9472e124494c06ae9ae`。进一步比较实际文件，而不只比较镜像标签：以下 SHA-256 在宿主构建、Server、Worker 三处一致。

| 输入 | SHA-256 |
| --- | --- |
| `prisma/schema.prisma` | `e8aeb15ccc385bb6dfdf12e449ef44b8db22e3841d902848216d25872938487f` |
| `dist/src/ledger/cash-projection.js` | `c0fd40aacae7fa6b33ff5c25fc87a4d5fe4e6b489346ad12755c67ad60deb16f` |
| `dist/src/ledger/ledger-stored-envelope-version.js` | `2d7d1f6432daf95467b87c2ee3f499c21b2ae70e88700c0af1f7fda777ef0dce` |
| `dist/src/ledger/ledger.controller.js` | `72456e672461f7c5541144119c1103734b697b396fe252f52f2385c156ff4860` |

本轮新的生产改动只涉及 Desktop，未改变 Server、依赖或结构，因而没有重复运行 infra 更新或重启目标容器。客户端在本机完成类型/build，并通过 `127.0.0.1:5189` 连接目标 `127.0.0.1:3000`。目标可写层继承 N4 的官方快更结果；文件同源证据不代表这些快更已进入不可变镜像。

## 专用目标输入与失败边界

所有输入都明确标注为验收用途，不代表真实交易或行情。未修改其他账户、策略或 Run。

| 用途 | 身份与最终配置 |
| --- | --- |
| 新事件账户 | `0e9677d2-98c6-45b1-8bc3-8d07b9209180`，`E03 专用验收（固定经济输入，非实际交易）`，securities、actual、CNY |
| 旧行账户 | `6fb65bf1-b0fc-4893-be4c-e6b964c6267a`，`E03 旧记录拒绝验收（固定输入）`，securities、shadow、CNY |
| 旧行事件 | `e03d0000-0000-4000-8000-000000000001`，CASH_FLOW、空 envelopeVersion、payloadVersion 1、原 payload `{"amount":"100"}` |
| 成交标的 | `600519.SH`，通过实际客户端目录搜索与正常身份确认流程建立 confirmed Asset |

旧行由显式事务注入到独立空账户。事务先核对精确 UUID、账户名和模拟模式，再锁定该账户，并确认没有事件或账本状态；未改写既有行。SQL 为 `/tmp/e03-d-target-old-fixture.sql`。

首次目标 HTTP 运行使用此前建立的模拟账户，现金存入返回 409 `LEDGER_VALIDATION_FAILED`（现金流只支持实际账户），未写入事件。空的新事件账户通过正常账户 API 改为 actual 并补充明确验收名称；旧行账户已经有事件，模式修改被 400 拒绝并保持 shadow。随后正式 HTTP 运行通过；这些失败不被计为成功或版本兼容。

## 目标 HTTP 与经济投影

执行复用隔离 HTTP 验证的 `scripts/ledger-current-acceptance.ts`：

```sh
LEDGER_ACCEPTANCE_CONFIRM=e03-d-dedicated-accounts \
LEDGER_ACCEPTANCE_ACCOUNT_ID=0e9677d2-98c6-45b1-8bc3-8d07b9209180 \
LEDGER_ACCEPTANCE_OLD_ACCOUNT_ID=6fb65bf1-b0fc-4893-be4c-e6b964c6267a \
LEDGER_ACCEPTANCE_OLD_EVENT_ID=e03d0000-0000-4000-8000-000000000001 \
pnpm --filter @thesis-ledger/server exec tsx ../../scripts/ledger-current-acceptance.ts
```

当前响应使用公开 Schema 严格解析。成功结果 `/private/tmp/e03-d-target-http.json`，日志 `/tmp/e03-d-target-http.log`。

- 现金存入 1000、买入 10 份、价格 10、佣金 2；重复创建只重放同一身份。
- 修订为 20 份，再撤销并恢复为 10 份；五条事件均为 envelopeVersion 3、payloadVersion 1，账本和投影版本均为 5。
- 过期 revision 返回 409 `LEDGER_REVISION_CONFLICT`，拒绝前后审计响应一致；revision 2 历史重放包含原创建身份。
- 目标 SQL 复核持仓 10、成本价 10、现金 898，待付与待收均为 0。
- 旧账户的有效读取、审计读取、创建、修订、撤销五类请求均为 409，并保留客户端可解析的 `UNSUPPORTED_CONTRACT_VERSION`。
- 旧行不变，旧账户没有新增 AccountLedgerState、Position 或 CashBalance。这也是目标拒绝事务没有遗留中间状态的证据。

完整投影写入故障、Import 回滚、经济税费及 T+1 的演练复用 E03-b 隔离 PostgreSQL 证据，未在共享目标安装故障触发器；本轮目标验证独立记录真实 HTTP、角色、投影和拒绝事务，不能替代全部故障场景。

## 实际浏览器闭环与修复

实际 Desktop 浏览器完成：创建账户及身份确认、读取当前恢复事件、将数量 10 更正为 12、作废、创建新的 3 份固定输入成交、从审计链恢复，以及取消作废后版本不变。

验收发现原成交作废后，记录消失于有效列表，审计面板同时关闭，恢复入口不可达。本轮小范围修复：

- `AccountDataAuditSheets.tsx` 的原因 Sheet 在成功提交后，将已保存的事实传给可选 `onSaved`，然后关闭当前 Sheet；取消或失败不调用它。
- `AccountDataPage.tsx` 的作废入口用该事实打开既有 AuditSheet，沿用现有恢复动作。
- 审计链中已存在后继版本的成交不再展示更正、作废按钮，避免针对被替代版本继续发起写入。

最初的回调复验未出现新面板，临时诊断回调也未出现在预览日志；重启本轮 Vite 后，新组件行为出现。临时诊断代码已移除。此后的实际复验确认：作废成功自动打开审计，最新 VOID 显示“恢复”；浏览器提交恢复成功，重开审计时旧版本没有更正、作废按钮，当前版本保留正常动作。取消作废不打开审计、不写事件，目标版本仍为 16。

调试过程中的成功 HTTP 恢复准备和各次浏览器写入均保留在审计中，不清理或将中间尝试当成最终通过。最终目标快照：账本与投影版本 16，共 16 条当前信封事件；原 12 份事实仍为 VOID，新 3 份事实已恢复。实际持仓 3、成本价 10、现金 970、待收与待付均为 0。前后快照分别为 `/tmp/e03-d-target-snapshot-before-browser.log`、`/tmp/e03-d-target-snapshot-final.log`。

旧行实际客户端验证：成交页与现金页都显示“账本记录格式不受支持”和中文说明，隐藏记录及写入入口；点击重新加载继续拒绝。没有展示旧记录补齐结果。旧账户原行、空状态与空投影在最终 SQL 中再次确认。

截图：

- [实际当前事实审计与恢复结果](/private/tmp/e03-final-browser-current-audit.png)。
- [实际旧账本记录拒绝](/private/tmp/e03-final-browser-old-row.png)。

最终浏览器 error、warn 日志为空。测试标签与本轮 Vite 已关闭。截图、JSON 和 `/tmp` 日志是本机临时证据，可能随环境清理失效；两类专用账户、Asset 关联及全部事实保留以供复核。

## 最终本地门禁与范围

| 检查 | 最后结果 | 证据 |
| --- | --- | --- |
| Desktop 定向 | 3 文件、33 项通过 | `/tmp/e03-final-desktop-targeted.log` |
| Desktop 全包 | 79 文件、523 项通过 | `/tmp/e03-final-desktop-full.log` |
| Desktop 最终类型与 build | 通过；保留既有大 bundle 提示 | `/tmp/e03-final-desktop-typecheck.log`、`/tmp/e03-final-desktop-build.log` |
| 两个本轮生产文件 ESLint、Prettier、定向 diff 检查 | 通过 | `/tmp/e03-final-desktop-eslint.log`及本轮输出 |
| 跨层边界 | 通过 | `node scripts/check-boundaries.mjs` |
| 文件尺寸门禁 | 通过，10 项既有警告；未提供可比较 baseline，不能据此宣称全部存量 ratchet 已验证 | `/tmp/e03-final-size-guard.log` |
| 目标新旧 HTTP、SQL 和角色 | 通过 | 上文身份、命令、JSON 与快照 |
| 当前源码 Desktop 浏览器连接真实目标 API | 通过 | 上文动作、旧行拒绝与截图 |

- [x] E03-b 当前命令、经济投影及隔离回滚证据。
- [x] E03-c 当前客户端与实际浏览器新旧记录验收。
- [x] E03-d 目标结构、角色、Server/Worker 同源、HTTP 与经济投影闭环。

本轮完成 E03 不依赖 N2 的实施与验收范围。其他主任务的旧命名清理、发布或整体业务验收不由本证据代为勾选。
