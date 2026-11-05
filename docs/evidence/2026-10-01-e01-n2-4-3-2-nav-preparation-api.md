# E01-N2.4.3.2 策略版本服务与准备 API

日期：2026-10-01。所属任务：E01-N2.4.3.2。

## 实现与证据保管边界

新增端点 `POST /api/v1/backtests/run-config/nav/prepare`，使用 N2.4.3.1 独立研究意图合同。服务读取 schemaVersion=2 的存储策略，调用当前纯准备函数和 Market NAV Reader，再读取同一策略版本核对当前内容；采集期间策略变化、删除或变为无效格式时阻断。

公开结果保留 scope=`nav-input-plan`，返回最终 RunConfig、完整计划摘要、精确来源/准入和内容绑定；不返回原文、逐条事实、内部上下文或持久创建引用。内部 `prepareEvidence` 返回全部原文、事实、完整计划及精确选源，供后续编排调用方保管。服务本身不跨请求持久保管证据，N2.5 仍须建立持久证据引用和创建守卫；不得把公开摘要视为已保存原文，或重新采集后继续使用旧冻结时点。

独立超时注入项 `NAV_PREPARATION_TIMEOUT_MS` 从当前 `loadConfig().dsaTimeoutMs` 获取整次采集期限，与实际 DSA 客户端配置一致。本叶未修改默认预算或目标运行态。

## 文件归属

| 文件 | 责任 |
| --- | --- |
| `packages/schemas/src/backtest-nav-preparation-result-v3.ts`、`index.ts` | 公开成功/阻断结果、内容绑定和稳定诊断 Schema |
| `apps/server/src/backtest/backtest-nav-preparation.service.ts` | 前后策略版本读取、内部完整证据和公开准备入口 |
| `apps/server/src/backtest/backtest-nav-preparation.controller.ts` | 专属端点及读库前请求核验 |
| `apps/server/src/backtest/backtest-nav-preparation-result.ts` | 公开投影与来源/完整性诊断映射 |
| `apps/server/src/backtest/backtest.module.ts` | controller/service、预算 provider 注册及服务导出 |
| `apps/server/test/backtest/backtest-nav-preparation-http.test.ts` | 实际 Nest HTTP 与全局错误过滤器验收 |
| `apps/server/test/backtest/nav-preparation.fixtures.ts`、既有准备测试 | 复用受控样本，保留 N2.4.3.1 原有断言 |

源码及文档保持在现有未提交工作区；未提交、暂存或清理其他 WIP。未新增数据库结构或依赖。

## 诊断合同

| 场景 | HTTP/结果 |
| --- | --- |
| 请求格式错误、伪造绑定字段、调用方指定最终时点、错误基金模型、非研究模式 | 400，读库前拒绝 |
| 策略版本不存在 | 404 |
| 存储策略 schemaVersion 或内容无效 | 422，`STRATEGY_INVALID` |
| 完整输入/日期覆盖不足 | 200，`blocked/DATA_UNAVAILABLE` |
| 策略或路由变化 | 200，`blocked/PREPARATION_STALE` |
| 来源超时、不可用、鉴权、证据无效、未适配、准入失效 | 200，对应稳定 `SOURCE_*` 诊断 |
| 未知数据库或程序错误 | 500，保留内部错误边界 |

已知来源异常使用固定中文诊断，不回显上游错误内容。阻断结果不携带成功配置。准备 HTTP 成功/阻断均使用显式 200，不默认返回表示新资源创建的 201。

## 本地验证

| 检查 | 输入范围及结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-preparation-http.test.ts test/backtest/backtest-nav-preparation.test.ts` | 2 文件，55 项通过；HTTP 新增 27 项 |
| 上述两文件加 NAV 计划、冻结 Store、可见性、Market Reader、DSA 客户端与既有场内准备测试 | 8 文件，184 项通过 |
| `pnpm --filter @thesis-ledger/schemas build` / `typecheck` | 通过 |
| `pnpm --filter @thesis-ledger/server typecheck` / `build` | 通过 |
| 限定 ESLint、Prettier、复杂度 20、函数尺寸 220 | 通过 |
| `node scripts/check-boundaries.mjs` | 通过；NAV 来源读取仍由 Market 所属模块负责 |
| 构建后的 BacktestModule provider/controller/export 元数据核验 | 通过 |

HTTP 验收启动真实 Nest 应用并使用现行 ApiExceptionFilter，注入真实准备 service 和 controller，策略查询和 Market Reader 使用受控桩。覆盖成功结果 Schema、内部原文保留、一次来源读取、两次策略查询、所有请求/版本/来源/未知错误边界；每项均断言不创建业务 Run/Job。覆盖采集期间版本内容变化、删除、无效、Control 现行 DsaError 与独立 NAV 协议异常，以及原文完整性失败。场内准备 15 项回归通过。

## 实时完整 API 与真实来源

验收约在 2026-10-01 03:50–03:51（Asia/Shanghai），入口 `/private/tmp/e01-n2-4-3-2-nav-api-probe.mjs`，复用 `/private/tmp/e01-n2-4-2-nav-api.py` 的隔离 DSA 服务。

执行面包括真实 Nest HTTP/controller/service、纯准备函数、Market Reader、DsaClient/DsaNavClient、实际 DSA Control/NAV router 与生产原文 Reader。隔离 SQLite 提供本次准入和策略；Server Desired 与 Prisma 策略查询使用受控桩，无目标数据库操作。每基金使用 MA3/MA4、完整申赎模型、四个预热期及四个确认/结算尾部交易日，重新读取当前上游身份/净值/规则文件，没有使用旧来源缓存。

| 基金 | 研究规则 | 事实数 | 完整 API 加冻结读回耗时 | 真实来源采集时刻 | 最终冻结时点 |
| --- | --- | --- | --- | --- | --- |
| `161725.OF` | 普通 T+1 | 10 | 14270 ms | `2026-09-30T19:50:28.326940+00:00` | `2026-09-30T19:50:28.711Z` |
| `110011.OF` | 已审核 QDII T+1 | 10 | 24034 ms | `2026-09-30T19:50:52.223415+00:00` | `2026-09-30T19:50:52.661Z` |
| `118001.OF` | 已审核 QDII T+2 | 10 | 18376 ms | `2026-09-30T19:51:10.630495+00:00` | `2026-09-30T19:51:11.115Z` |

三份结果均通过公开 Schema、完整策略/计划/配置摘要、读取前后精确路由状态及策略内容核对。最终冻结时点晚于实际采集时刻，并早于来源采集期限；三份期限分别为 `19:52:14.788Z`、`19:52:29.047Z`、`19:52:53.086Z`，日期均为 2026-09-30 UTC。

同一次 API 调用取得的内部证据在隔离 LocalNavSnapshotStore 中完成实际 Parquet 冻结与离线读回，Manifest、全部上下文一致；未再调用来源。总计三次来源读取、六次策略版本查询。每基金追加的伪造 binding 请求均实际返回 400，没有追加来源或数据库查询。验收结束关闭 Nest/DSA HTTP 进程并移除临时 Parquet、SQLite。

预算为隔离 `DSA_TIMEOUT_MS=120000`，真实耗时显著超过目标默认 5 秒。本结果不证明默认预算可用，N4 必须调整目标配置后验收。

## 完成与后续

N2.4.3.2、N2.4.3、N2.4 组内义务完成；N2 整体、业务 Run、持久准备证据、目标数据库/Worker/客户端及部署仍未完成。

后续依赖顺序：N2.5 先建立证据持久化、创建守卫与冻结关联合同；N2.6 验证隔离数据库；N3 离线执行及 Worker 闭环消费前述合同；N4 验证目标运行态与客户端。N3 离线分支可从已就绪 N1 提前启动，公开 NAV 投递必须等待最小 NAV 执行分支，不能交给仅支持场内的 Worker。
