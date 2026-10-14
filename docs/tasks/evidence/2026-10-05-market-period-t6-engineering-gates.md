# T6 行情周期包级检查与工程门禁证据

日期：2026-10-05。用户本轮授权继续 T6。权威范围为[原 Task 的 T6](../2026-09-16-market-chart-period-aggregation.md)与[完整 Spec 的 AC10](../../specs/2026-09-16-market-chart-period-aggregation.md)。T1～T5 的启动前置已完成；本轮完成本地工程门禁后停止，不自动推进 G1/P1/R1。

## 结果与代码修复

T6 的必要本地检查通过，原 Task 已勾选。主仓 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，仍包含全部未提交修改；测试输入不能仅以 HEAD 表示。

本轮唯一源码修改是 `packages/schemas/src/strategy-authoring.ts` 的第 4 行：从本地 import 中移除未使用的 `type AuthoringContent`，保留下一行的公开类型 re-export。该未使用导入阻断了全工作区 lint；没有修改策略编写行为、Schema 字段、公共导出或其他并发改动。

修复后 Schema 全包、类型/build 和所属 lint 组重新通过。修复前后 Schema dist 的 212 个 `.js` 与 `.d.ts` 文件聚合摘要均为 `52fa0e80077b3245f7d97cf00c7b7a1a14876e94b8a4d8ee40d49c2dc51dc42d`。此对比不包含 source map，因此可以证明运行 JS 和公开类型声明未变化；消费端构建/类型及其他已通过 lint 组继续有效，未重复无变化的高成本检查。

## 定向验证

测试、类型、构建和 lint 经 `rtk proxy` 后台执行，成功日志只保留统计；低层级通过后才推进下一层。以下命令按各包工作目录执行。

| 执行面 | 定向命令或输入 | 结果 |
| --- | --- | --- |
| Schema | `pnpm exec vitest run test/market-period.test.ts test/market-period-http.test.ts test/market-period-indicator.test.ts test/market-display-detail.test.ts --maxWorkers=2` | 4 文件、48 项通过 |
| Domain | `pnpm exec vitest run test/market-period-aggregation.test.ts --maxWorkers=2` | 1 文件、35 项通过 |
| SDK | `pnpm exec vitest run test/market-period-transport.test.ts test/market-period-detail.test.ts --maxWorkers=2` | 2 文件、12 项通过 |
| Server | 下列周期服务/HTTP/DSA 合同文件，`pnpm exec vitest run ... --maxWorkers=2` | 12 文件、165 项通过 |
| DSA | `.venv/bin/python -m pytest tests/test_thesis_ledger_period_indicators.py tests/test_thesis_ledger_market_calendar.py tests/test_tencent_native_daily.py -q` | 62 项通过，4 项告警 |

Server 定向文件：`test/market/market-period-calendar.test.ts`、`market-period-window.test.ts`、`market-period-reader.test.ts`、`market-period-view.test.ts`、`market-period-view-cache.test.ts`、`market-period-indicator-reader.test.ts`、`market-period-public-http.test.ts`、`market-period-public-window.test.ts`、`market-period-detail-http.test.ts`、`market-period-http.test.ts`，以及 `test/integration/dsa-market-calendar.test.ts`、`dsa-period-indicators.test.ts`。

上述定向统计已包含在后续包级或受影响回归中，不再相加作为新增覆盖数量。

## 包级回归、类型和构建

| 范围 | 命令 | 最后结果 |
| --- | --- | --- |
| Schema 全包 | Schema 目录 `pnpm exec vitest run --maxWorkers=2` | 57 文件、676 项通过；lint 修复后复验仍为 676 项 |
| Domain 全包 | Domain 目录 `pnpm exec vitest run --maxWorkers=2` | 43 文件、386 项通过 |
| SDK 全包 | API Client 目录 `pnpm exec vitest run --maxWorkers=2` | 12 文件、72 项通过 |
| Server 受影响范围 | Server 目录 `pnpm exec vitest run test/market test/integration/dsa-market-calendar.test.ts test/integration/dsa-period-indicators.test.ts test/integration/dsa.client.test.ts --maxWorkers=2` | 63 文件、784 项通过；5 个文件全跳过，合计 27 项跳过 |
| Desktop 行情消费 | Desktop 目录 `pnpm exec vitest run src/features/market-detail --maxWorkers=2` | 23 文件、108 项通过；不是 Desktop 全仓测试 |
| 构建闭包 | 根目录 `pnpm -r --filter @thesis-ledger/server... --filter @thesis-ledger/desktop... build` | shared、Domain、Schema、SDK、Server、Desktop 共 6 个项目通过 |
| 类型闭包 | 根目录 `pnpm -r --filter @thesis-ledger/server... --filter @thesis-ledger/desktop... typecheck` | 同一 6 个项目通过 |
| Schema 修复后验证 | 根目录 `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/schemas typecheck` | 均退出 0；JS/类型声明摘要不变 |
| Python 编译与关键 lint | DSA 四个实际周期/日历/腾讯模块，见下列命令 | 均退出 0 |

DSA 命令：

```sh
rtk proxy .venv/bin/python -m py_compile src/services/thesis_ledger_period_indicator_contract.py src/services/thesis_ledger_calendar_contract.py src/core/trading_calendar.py data_provider/tencent_native_daily.py
rtk proxy .venv/bin/python -m flake8 src/services/thesis_ledger_period_indicator_contract.py src/services/thesis_ledger_calendar_contract.py src/core/trading_calendar.py data_provider/tencent_native_daily.py --select=E9,F63,F7,F82 --show-source --statistics
```

本轮未修改原生客户端依赖/配置，不执行 Android/iOS Native compile；此记录不提供原生编译通过结论。未跑 DSA 全后端套件或收费/在线来源观测。

## 全工作区 lint 与仓库门禁

先执行仓库正式 `node scripts/lint-workspace.mjs`，各组使用项目配置及 `--max-warnings=0`。首次在 Schema 组因未使用类型导入退出 1；此前通过的五组输入未变化。修复后仅复验 Schema，补完当时尚未执行的 shared、scripts、dsa-adapter 三组，保留原始失败及修复记录，不把首次命令写成退出 0。

| lint 组 | 输入数量 | 最终证明 |
| --- | --- | --- |
| `apps/desktop` | 457 | 正式分组入口通过 |
| `apps/mobile` | 15 | 正式分组入口通过；依赖解析诊断另见告警说明 |
| `apps/server` | 874 | 正式分组入口通过 |
| `packages/api-client` | 19 | 正式分组入口通过 |
| `packages/domain` | 111 | 正式分组入口通过 |
| `packages/schemas` | 159 | 修复后 `pnpm exec eslint packages/schemas --max-warnings=0` 退出 0 |
| `packages/shared` | 1 | `pnpm exec eslint packages/shared services/dsa-adapter --max-warnings=0` 退出 0 |
| `scripts` | 3 | `pnpm exec eslint scripts --max-warnings=0` 退出 0 |
| `services/dsa-adapter` | 4 | 与 shared 的同一次命令通过 |

合计 9 组、1643 个正式 lint 清单输入已覆盖；通过 `node scripts/lint-workspace.mjs --list` 核对组与输入数量。没有关闭规则、增加 ignore、提高复杂度或文件尺寸阈值。

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 模块边界 | `node scripts/check-boundaries.mjs` | 通过 |
| workspace 依赖 | `node scripts/check-workspace-dependencies.mjs` | 通过，8 个包 |
| 文件尺寸 | `GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs` | ratchet 通过，9 项存量超限未增长 |
| migration matrix | `node scripts/check-migration-matrix.mjs` | 32 项 migration、80 张 SQL 表、64 个 Prisma model、16 张 raw-owned 表；head 为 `20261005143000_authoring_analysis_application` |
| runtime 结构输入 | `node scripts/check-runtime-database-input.mjs` | 32 个 SQL 及打包执行器检查通过 |
| 差异卫生 | `git diff --check` | 通过 |

结构检查仅分析当前源码/打包输入。没有连接目标数据库、执行迁移或更新容器，不能据此声称目标结构已达到 32 项 head。

## 跨仓合同与生成结果

Schema 与实际 DSA 仓库的两份共享夹具逐字节一致：

| 主仓 / DSA 夹具 | SHA-256 |
| --- | --- |
| `market-period-indicator-v1.shared.json` / `thesis_ledger_period_indicator_v1.shared.json` | `1e695091d17f4a8d50913572b8979eb63a391dd820f4e43e828f04138fee4cda` |
| `market-period-indicator-capabilities-v1.shared.json` / `thesis_ledger_period_indicator_capabilities_v1.shared.json` | `babaf6ad844242144e50ac9120defc4ac88d34228decbb7dbf52230be155bf06` |

当前构建后执行 `pnpm exec tsx scripts/print-market-period-indicator-fixture.mjs`，stdout 与主仓输入夹具逐字节相等，JSON 内容也相等。该证明使用受控日历与价格，不扩大为真实 Provider 或交易所历史覆盖证明。

## 条件跳过和告警

Server 的 27 项跳过逐项保留，不计为通过，也不以本叶替代原主题的隔离或真实输入验收：

| 测试文件 | 跳过数量 | 未具备条件 |
| --- | --- | --- |
| `market-window-jsonb-roundtrip-diagnostic.test.ts` | 2 | 专属 `DIAG_DATABASE_URL` 及要求的数据库命名 |
| `market-pit-calendar-package-v1.test.ts` | 1 | `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY` 实际公开输入 |
| `catalog-parent-postgres.integration.test.ts` | 6 | `E04_CATALOG_POSTGRES=1` 的隔离环境 |
| `market-cache-redis.integration.test.ts` | 3 | `E04_CACHE_REDIS=1` 的隔离环境 |
| `market-derived-series-postgres.integration.test.ts` | 3 | `DERIVED_SNAPSHOT_TEST_DATABASE_URL` |
| `market-pit-calendar-schema-interoperability.test.ts` | 6 | 实际公开日历输入目录 |
| `market-policy-postgres.integration.test.ts` | 6 | `E04_POLICY_POSTGRES=1` 的隔离环境 |

派生周期 Spec 不新增事实表/migration，不要求本轮启动上述其他主题的数据库或严格 PIT 输入验收。行情真实来源/缓存目标证明仍由已完成 T3 证据拥有；本轮没有重跑或改写这些运行态结果。

已解释的告警与诊断：

- DSA 4 项：Starlette 对 httpx 的弃用提示、AnyIO BlockingPortal 别名弃用提示，以及两个文件对 `_ThreadlessTestClient` 的 pytest 收集提示。此次相关 62 项均执行通过；没有升级依赖或改变 conftest。
- Desktop 构建保留大于 500 kB 的 chunk 提示，没有提高限制。
- 尺寸门禁保留 9 项存量 ratchet 告警，均未增长。
- Mobile lint 解析第三方 `react-native/index.js` 的 Flow 语法时打印 `Expression expected` / `parseForESLint` 兼容性诊断。该组进程退出 0、正式 lint 随后继续至 Server；没有改动 Mobile 或依赖文件。此为本轮观测到的非阻断依赖解析诊断，不宣称原生编译通过，也未通过规则忽略将其静默。

## 输入适用性和验证复用

按排序后的相对文件名 UTF-8 字节与文件内容顺序计算 SHA-256。范围为各包 `src/test/tests`、实际存在的 package/TypeScript/Vite/Python 测试配置；DSA 另外覆盖仓库 Python 源码，排除 `.venv`、`.git`、`__pycache__` 和 `.pyc`。这些是检查输入摘要，不包含构建产物、完整仓库文档、业务数据库或机密环境变量。

| 输入范围 | 文件数 | 本轮最终摘要 | 相对本轮初始状态 |
| --- | --- | --- | --- |
| Schema | 161 | `d8eecd223b0d838cfe6cabea9380c1f866606f307b69c5614ca55b1fd1332127` | 仅未使用类型导入修复，已重验 |
| Domain | 113 | `a8cc062e9bfea0f51c2e92b07af1cdf1bc176539486d5fc31bd162dbc313cb24` | 未变 |
| SDK | 21 | `15ad512e9913593fea029504683aefc788bec723cac30ef53dc5f1d7a3e82f16` | 未变 |
| Server | 891 | `327f9b8c66c2c4265eef7f59fcadff60b674742447dcdd984629e4dae7a3258f` | 未变 |
| Desktop | 471 | `fbfceac6ed5cebc83d6db935579b3b2ac704d6364e9575fe6d8d5a688a18e8e2` | 未变 |
| DSA | 889 | `e5f1e968279413e1bc17d71141325bd1eb603795db1c07beb437aa86d874b6b4` | 未变 |

Schema 初始摘要为 `51aef4e18d2e239b0b505d4e922c0e11c96cb358f30061b013a25df78a3b226f`。T5.2 证据中五个代码/测试输入的独立 SHA-256 仍相等；本轮也重新执行当前 Desktop 行情回归，不重复其浏览器/性能准备构建。

根 manifest、锁文件、ESLint 配置与正式 lint 脚本均未变化：

- `package.json`：`bd573e741740bf0dd66f3fe980d644345ef618311795d924d259c29034d0eef5`
- `pnpm-lock.yaml`：`0637d9a9d27e8ccdc94b767ae57213c8abb2d9c5db6c271a0731763bf29d7dcd`
- `eslint.config.mjs`：`00bbf5bedc2fca7cdb3b373a969e825425d8c8bfa89431f423736d778d7fc1d1`
- `scripts/lint-workspace.mjs`：`bdf8a58e52d07c22439aebee41019ef63ce73c7646bf61ae8471d94d79dd111e`

## 局部 Review 和停止边界

T6 局部 Review 通过：原完成条件所需本地行为、受影响包及消费闭包、lint 与仓库门禁均具备当前证据；唯一修复未改变运行 JS/公开类型，无新增未解释的本叶告警。没有把 27 项跳过、静态结构、受控输入、healthy 或构建产物等同于真实环境成功。

G1 仍需稳定目标版本上的完整真实浏览器/Network/读数/分页/回退与截图；P1 仍需 500 点性能采样及正式请求形态；R1 仍需全部 AC 最终一致性。目标结构/代码实际版本、正式镜像持久化以及真实 Provider 的当前可用性均未在本轮核验。

原始日志统一位于 `/private/tmp/tl-t6-*.log`：定向五份、包级四份、Desktop、构建/类型闭包、正式 lint 首次结果、Schema 修复及剩余 lint、Schema 最终 build/typecheck、尺寸门禁。临时日志可能被清理，本证据保留实际统计、跳过原因、诊断、命令和输入摘要。

本轮未部署、操作 Docker、修改数据库/Provider 配置、启动浏览器或并行 Agent，也没有提交、推送、reset、清理或整仓格式化；保留全部既有 dirty 修改。完成 T6 后停止，等待下一项选择。
