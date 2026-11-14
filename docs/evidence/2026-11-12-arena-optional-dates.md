# 自主比赛可选日期验收

对应[自主竞技场规格](../specs/2026-11-12-autonomous-model-arena.md) AC13。基线为当前未提交工作区，旧日频协议与历史数据不修改。

## 实现与边界

自主协议分别允许 `startsOn`、`endsOn` 缺省或为 `null`；客户端将空白日期归一为 `null`。开始日期为空时从手动启动起参与有效交易会话，结束日期为空时不触发赛期自动结束。填写日期时保留原范围门禁与自动封存，双边存在才校验顺序。无限赛期不代表无限额度，也不改变模型预约、委托有效期或日历未知门禁。

没有完整日期范围时不调用旧范围日历预检，`calendarVersion` 允许为空；实际运行与估值仍读取 Market 的正式会话，委托到期仍须真实日历。没有新增数据库列、迁移、远期占位或无限委托时间。

Domain 统一日期判断，Server 的运行、预约、投递、领取、恢复、估值及委托截止消费同一空边界语义。Desktop／Mobile 的创建、列表与详情展示手动启动／结束，运行中可直接结束；结束沿用原事务取消预约、委托和周期并保留持仓的逻辑。

## 自动化检查

| 层级 | 命令及结果 |
| --- | --- |
| schemas | `pnpm --filter @thesis-ledger/schemas test test/arena-live.test.ts test/model-arena.test.ts test/arena-catalog.test.ts`：15 项通过，含旧协议。 |
| domain | `pnpm --filter @thesis-ledger/domain test test/arena-live-season.test.ts test/arena-live-orders.test.ts`：9 项通过，覆盖跨年持续、单边／双边边界及原委托语义。 |
| api-client | `pnpm --filter @thesis-ledger/api-client test test/arena-live-optional-dates.test.ts test/arena-setup.test.ts`：7 项通过，四种日期组合和旧建赛均保留。 |
| Server 执行面 | `pnpm --filter @thesis-ledger/server test test/model-arena/live-optional-dates.test.ts`：6 项通过，含跨年继续撮合／投递、领取、截止自动结束、未来开始、闭市／未知、委托日历及估值。 |
| Desktop 回归 | `pnpm --filter @thesis-ledger/desktop test test/arena-detail-refresh.ui.test.tsx test/arena-catalog-navigation.test.ts test/arena-daily-navigation.test.ts`：17 项通过。 |

schemas、domain、api-client 构建通过；Server、Desktop、Mobile 类型检查通过。Desktop 生产构建通过，Vite 用时 3.28 秒；Server 及依赖通过正式快更入口构建。`node scripts/check-boundaries.mjs`、定向 ESLint 和 `git diff --check` 通过。保留已有 React `act`、大包及工具解析 React Native 源码提示，不将通过解释为零警告。

## 隔离 PostgreSQL 与实际 HTTP

使用正式隔离入口：

`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-http-postgres.integration.test.ts test/model-arena/live-storage-postgres.integration.test.ts test/model-arena/live-catalog-postgres.integration.test.ts test/model-arena/live-appointments-postgres.integration.test.ts test/model-arena/live-valuations-postgres.integration.test.ts test/model-arena/live-orders-postgres.integration.test.ts`

专属临时库 `ai_provider_concurrency_fixture`，51 个实际迁移，25 项通过。实际 Nest HTTP 经共享客户端创建空日期草稿、读取并列入目录，校验空日期与日历版本原样保存；启动、暂停、恢复后直接从运行中结束成功。账户、持仓保留、原子撤单、预约、估值及 owner 隔离均回归。模型与行情服务为受控依赖，临时容器由脚本清理。

## 两端浏览器

- `arena-optional-dates-browser.mjs`：1440／1024／768／390 通过。每宽空双边、仅开始、仅结束三种创建组合，无范围日历请求；运行中直接结束、列表与详情回显通过。每宽 5 次状态／保存写入全部由受控响应接管，真实业务请求为零。截图 `/tmp/arena-optional-dates-qa/`。
- `ARENA_MOBILE_OPEN_SEASON=1 arena-live-mobile-browser.mjs`：四宽度通过实际 Mobile 组件、触摸图表、图例、净值、成交来源、无日期展示与运行中手动结束。截图 `/tmp/arena-open-mobile-qa/`。这是 React Native Web 与实际图表文档的受控验收，不是原生宿主验收；临时 Vite 已关闭。

## 本地运行态

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，兼容性预检、Server/workspace 构建、传输及 Server／Worker 重启成功，退出码 0。镜像保持 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`，两服务独立读取均为 healthy。快更位于容器可写层，重建后不会保留，不作为镜像发布证据。

容器中只读验证日期与日历版本缺省均为 `null`。以下编译产物与宿主 SHA-256 完全一致：

| 产物 | SHA-256 |
| --- | --- |
| schemas `arena-live-protocol.js` | `89bbabe0e95169c074435cc64f46d28ec503248dd8476c814cdb9939aebc3586` |
| domain `arena-live-season.js` | `0004f78e0e59573030f8b14cbc2aae5b852bb5aa6a8daf6e12ea3cea1cbbcbb8` |
| Server `live-runtime.js` | `6d481e41372a030fbce6717d38d5ca4cb93da79ed59c3ae3884fbee524247fec` |
| Server `live-matches.repository.js` | `e8157e96343a1575a0022f1859e3bcca6069c2e896fc43fdf8d8d3088435c819` |
| Market `market-arena-valuation-reader.js` | `bbc069d83d7a677e0b1829f4806c06bab9a140a2b7006f5303b8b17ccc1b304e` |

目标目录 API 一次只读 GET 返回 200，现有 5 场通过现行契约解析。未在真实目标创建或改变比赛，也未发起真实模型或行情来源验收。

## 失败修正与最终审查

首次 Server 类型检查发现 Market 估值入口仍直接比较必填日期，同步空边界后通过，并补充估值与委托有效期测试。第一次容器编译产物探测使用宿主目录布局而失败，按部署脚本的 workspace 包实际解析路径重查后，五个产物校验一致。

D01–D04 均有适用证据，空赛期、手动生命周期、预算、日历、原始数据与新旧协议的边界一致。父级跨市场来源、原生宿主及完整部署恢复门禁保持原状态；本次不替代这些验收。工作区未提交，保留其他任务的修改。
