# 自主比赛可选单次上限与配置审查验收

日期：2026-11-12。合同：[自主竞技场规格](../specs/2026-11-12-autonomous-model-arena.md) AC15 及配置可选性表。

## 配置与实现

- 单次输入、输出令牌上限独立可空，默认空白；共享协议归一为 `null`，账户显示“不限额”。正整数继续生效，零及非法值拒绝，旧日频不变。
- 名称可省略并采用“自主模型比赛”；本金、仓位、交易费率及研究观察参数可省略并使用共享默认值。表单清空采用默认值，输入提示与最终冻结值对应；显式非零和原始小数不变。
- 服务端请求规划由 `live-call-limits.ts` 承载。全部相关额度无限时不传 SDK 输出上限；有限总令牌或费用时，从两级剩余额度推导输出边界。预留仍在原事务中复核，未知结果不补发，实际用量与有效限制进入审计。输入预留沿用原 UTF-8 字节加 256 的保守估算。
- 路由使用上游托管输出而本次需要有效输出边界时，出站前拒绝并显示中文原因，不修改路由。上游上下文／输出能力仍生效；研究步骤、时限、行情及资金门禁保留。
- 已逐项检查名称、日期、市场、范围、固定池、模型绑定、搜索、本金／交易规则、六项总额度、单次输入输出、五项研究观察参数及自动派生字段。分类、默认值与条件必填见规格表。

## 共享与本地检查

| 范围 | 实际结果 |
| --- | --- |
| schemas | 包内 145 文件、1582 项通过，含省略字段、部分默认、零值拒绝及旧合同回归。命令 `pnpm --filter @thesis-ledger/schemas test -- test/arena-live.test.ts` 的参数形式执行了全包，未重复运行。 |
| api-client | 包内 47 文件、253 项通过，含全部默认型输入清空、单次有限／无限组合、高精度数值和非法输入。命令 `pnpm --filter @thesis-ledger/api-client test -- test/arena-live-optional-budgets.test.ts test/arena-live-optional-dates.test.ts` 同样执行全包。 |
| 请求规划 | `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-call-limits.test.ts`：9 项通过，覆盖两级有限预算、精确费用、零价格、托管路由及不可表达边界。 |
| Desktop | `pnpm --filter @thesis-ledger/desktop exec vitest run test/arena-detail-refresh.ui.test.tsx test/arena-daily-navigation.test.ts test/arena-catalog-navigation.test.ts`：17 项通过。 |
| 类型与构建 | schemas／domain／api-client 构建、Server／Desktop／Mobile 类型检查及 Desktop 生产构建通过。 |
| 静态门禁 | 定向 ESLint、`node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs`、`git diff --check` 通过。尺寸门禁有 5 项既有文件警告，本任务未修改这些文件。 |

## 隔离数据库与受控模型

执行正式隔离入口：

`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-unlimited-budget-postgres.integration.test.ts test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`

临时数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`，应用实际 51 个迁移；3 文件、13 项通过，临时容器已清理。覆盖 SDK 不传输出上限、有限总令牌推导边界及实际退款、多步研究、并发有限预算、重复结算、未知结果不补发、归属隔离及暂停／恢复／结束。模型为受控函数，无真实模型或行情出站。

## 实际浏览器

两个维护脚本均使用真实业务组件、受控 API，覆盖 1440、1024、768、390。Desktop 12 组创建组合、默认型配置清空、明确零拒绝且不发保存请求、草稿／账户展示、启动和直接结束通过。Mobile 覆盖同样的清空／保存／拒绝行为及真实图表文档、触摸读数、图例、指标切换和详情；零运行错误，无页面横向溢出。

- Desktop：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_OPTIONAL_BUDGETS=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_QA_OUTPUT=/tmp/arena-optional-requests-desktop node scripts/local-runtime/arena-optional-dates-browser.mjs`。
- Mobile：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_MOBILE_OPEN_SEASON=1 ARENA_MOBILE_UNLIMITED_BUDGET=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_QA_OUTPUT=/tmp/arena-optional-requests-mobile node scripts/local-runtime/arena-live-mobile-browser.mjs`。
- Mobile 由现有 RN Web 夹具承载，不代表原生宿主编译或设备验收。截图位于上述临时目录。

## 失败与修正

Mobile 首次类型检查发现新增可选 `placeholder` 与严格可选属性类型不匹配，补齐可显式传 `undefined` 后通过。首次 Context Mode 子进程缺少 Docker PATH，尚未创建隔离环境；改在正常 Shell 使用同一正式入口后通过。首次 Desktop 回归命令误用不存在的文件名，没有执行测试；改用实际三个文件后 17 项通过。Mobile 浏览器首次错误提示断言预期了英文校验文本，实际共享组件已转换为中文；按实际中文提示修正验收脚本后四宽度通过。Node localStorage、既有 React `act` 及 Vite 大包提示保留。

## 目标运行态

从 infra 仓库执行 `./scripts/sync-code.sh thesis-ledger`，兼容预检、Server／workspace 构建、传输、重启及健康检查成功，退出码 0。Server 与 Worker 均为 healthy，镜像保持 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`。快更是容器可写层更新，不代表镜像发布。

容器内只读调用共享协议及请求规划：省略单次上限得到两个 `null`，省略默认型字段得到已确认默认值；全部不限额时有效输出为 `null`，总令牌 10000／输入估算 100 时有效输出为 9900，预留 10000。三个关键产物的宿主与容器 SHA-256 一致：

| 产物 | SHA-256 |
| --- | --- |
| `schemas/dist/arena-live-protocol.js` | `0079a06578c5cce45d25db3a416e59cb38a0792c94c5a786378e5b61c1bb1679` |
| `server/dist/src/model-arena/live/live-call-limits.js` | `0e6eb4865bd02258f64327fc61173030ec767276e61901018d69fceac638d07a` |
| `server/dist/src/model-arena/live/live-research-call.js` | `4ce283656ab6d45a1abf3e721362479d934c8a9b8729cde6db5f82ac0b9c7caf` |

目标 `http://127.0.0.1:3000/api/v1/arena-matches/catalog` 一次只读 GET 为 200，现有 5 场记录通过现行目录契约。真实业务比赛没有写入，未调用真实模型或来源。R01–R04 均完成；父任务 G02 原生／完整应用、G03 真实来源和 G04 完整恢复仍独立保留。
