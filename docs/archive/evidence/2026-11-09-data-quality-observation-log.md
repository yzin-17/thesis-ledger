# 数据质量问题自动记录验收

对应 [Spec](../../specs/2026-11-09-data-quality-observation-log.md) 与 [Task](../tasks/2026-11-09-data-quality-observation-log.md)。日期：2026-11-09。

## 已接入的业务边界

原代码的来源响应校验会拒绝不合格数据，但没有调用 `DataQualityService.record`。本次在原校验位置增加旁路观察，不重放旧调用，不增加来源请求，也不改变原缓存或回退策略。

| 入口 | 观察内容 | 来源标识 |
| --- | --- | --- |
| `MarketQuoteReader` 当前报价 | Schema、响应标的不匹配 | 原请求只暴露 DSA 网关，记录 `dsa`，不猜上游来源 |
| `MarketFundReader` 当前净值、净值历史、基金持仓 | Schema、响应标的不匹配 | 同上 |
| `MarketBarWindowReaderV3` 日线窗口 | DSA 明确返回合同无效 | 固定请求的 `providerId`，范围含上游、周期和复权 |
| `MarketChartReaderV3` 交互 K 线 | DSA 明确返回合同无效 | 同上 |
| `MarketPeriodCalendarReader` 实际日历 | Schema、合同无效、实际范围的日历无效或覆盖不足 | DSA 网关及市场 |

基金历史净值的非数组响应也进入已有 Schema 校验，避免只抛出无法分类的 `map` 类型错误。身份不匹配使用明确错误类型，保持原错误文案。正常延迟净值、正常休市、网络超时、未配置、控制关闭、权限不足、路由修订变化及取消都不记录为数据质量问题。研究冻结、缓存旧事实、价格精度和账本不修改；本次没有新增覆盖率或估值完整性检测器。

## 存储、生命周期与隐私

复用原 `DataQualityIssue` 表，无 migration。观察入口只接受能力、来源、标的、稳定范围和已登记的问题码，中文说明由固定映射生成，不接收来源正文或异常文本。详情只有指纹、说明、稳定范围、首次与最近发生时间、次数；不存响应正文、URL、请求头、凭证或金额。

问题指纹用于事务级 PostgreSQL advisory lock。锁内查找相同指纹的 `open` / `acknowledged` 问题并增加次数，保留 `detectedAt` 和人工确认状态。更新附带未关闭条件；若人工关闭先完成，则新建一条问题，避免覆盖关闭状态。记录事务有 `maxWait=1000ms`、`timeout=2000ms` 边界。写入失败只发出不带底层原文的 `data_quality.persist_failed` 告警，原校验异常及降级行为继续。

未关闭查询使用 `status=unresolved`，同时包含待处理与已确认记录；原明确查询 `open`、`acknowledged`、`resolved` 行为保持。页面名称改为“未关闭的数据质量问题”，增加最近发生时间、次数及中文问题码。读取错误、刷新错误、旧记录兼容和空白语义保留。

## 本地与隔离验证

| 验证 | 最后结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/market test/quality` | 102 文件、1113 用例通过；9 文件、38 用例因各自环境条件跳过，不能扩大为全部隔离验收 |
| 修改基金非数组校验后的 `test/quality/market-quality-producers.test.ts test/market/current-cache-control.test.ts test/market/current-data-boundary.test.ts` | 29 项通过 |
| Quality 观察记录单测 | 5 项通过，覆盖首次、重复、已确认、并发关闭分支、指纹隔离及持久化失败的安全告警 |
| `pnpm --filter @thesis-ledger/api-client test` | 当前工作区 42 文件、219 用例通过，包含未关闭筛选和发现时间传输 |
| Desktop 诊断定向回归 | 3 文件、25 用例通过，包括最近发生优先、次数及旧记录兼容 |
| Server 类型检查、共享 Schema / API client 构建、Desktop 构建 | 通过；Server 最终构建另由正式同步入口完成 |
| `pnpm exec node scripts/check-boundaries.mjs` | 通过，新增 Quality 不得反向依赖 Market / integration / providers 的门禁 |
| `GUARDRAIL_BASE_REF=HEAD pnpm exec node scripts/check-file-size-guardrails.mjs` | 通过，保留 6 个既有尺寸告警 |
| 观察存储、Quality 服务、Market 观察边界、日历及显示投影的定向复杂度 / 行数 / 嵌套三元门禁 | 通过，无新增告警 |
| `git diff --check` | 通过 |

隔离入口：主仓 `pnpm exec node scripts/test-data-quality-postgres.mjs`。脚本使用本机已有 `postgres:17-alpine`，不拉取镜像；创建带专用标签、随机名称、tmpfs 数据目录和随机本地端口的单个容器。固定数据库 `data_quality_fixture`、owner `fixture_owner`，验证身份后依序执行当前 49 个 migration SQL。测试结束或失败只清理本次容器，不操作共享数据库、其他项目或 volumes。

`DATA_QUALITY_TEST_DATABASE_URL` 控制的 3 项集成用例最终全部通过：8 个并发观察生成一条问题且次数为 8；已确认记录继续出现在未关闭查询中，关闭后再发生创建新记录；实际 `MarketService` 的受控来源响应校验失败后成功降级到缓存，真实记录落入隔离 PostgreSQL，并经实际 Nest Controller 的 HTTP 查询和共享 Schema 读取。没有请求真实 Provider。

保留的失败：首次测试用例的 mock 参数签名不完整导致类型检查失败，补全后通过；隔离 HTTP fixture 最初引用项目未安装的 `@nestjs/testing`，改为已有 `NestFactory`，未修改依赖；随后 Controller 在 fixture 的元数据环境中注入缺失，显式 `@Inject(DataQualityService)` 后隔离 HTTP 通过。未通过改变验收或跳过测试掩盖失败。

## 浏览器验证

受控脚本 `apps/desktop/scripts/check-provider-diagnostics.cjs` 在实际 `5173/providers` 页面拦截全部业务请求，增加质量记录样本、最近发生时间与次数断言。1440、1024、768、390 四宽度均通过，每宽度 83 个受控请求、0 个写请求、无浏览器错误或页面级横向溢出。已有失败、空态、刷新、来源分页与列宽检查继续通过。已查看桌面与窄屏截图，质量长表在容器内滚动；产物为 `/tmp/provider-diagnostics-qa/*-quality.png`。

真实只读脚本 `apps/desktop/scripts/check-provider-diagnostics-live.cjs` 在同一页面连接实际 Docker Server，不拦截 GET，只拒绝测试写请求。四宽度均通过；当时来源异常 40 条、自动化异常 2 条，质量接口为 0 条。并行自动化工作新增 `partial` / `interrupted` 异常状态使旧脚本断言首次失败，核对现行客户端合同后对齐脚本，保留该工作，未改写其业务状态。该失败属于测试对并行合同的旧假设，不是质量记录链路失败。产物为 `/tmp/provider-diagnostics-live-qa/`。

## 目标运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无非默认行为参数，退出 0。正式兼容性预检通过，宿主机构建 Server、shared、domain、schemas 后同步 Server / Worker 并重启；两者独立健康检查通过。镜像 ID 保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`，无数据库结构、volume 或 DSA 更新。

真实 `/api/v1/data-quality/issues?status=unresolved` 与原 `status=open` 均返回 HTTP 200、0 条。只读检查运行容器的编译元数据，确认 `MarketService`、`MarketPeriodCalendarReader`、`MarketBarWindowReaderV3`、`MarketChartReaderV3` 都装配 `DataQualityService`。近五分钟日志无 `UnknownDependenciesException` 或 `data_quality.persist_failed`。没有在共享库制造失败样本；真实持久化闭环证据来自隔离数据库，不能称为真实 Provider 故障验收。

## 结论

AC1–AC5 通过：首批已有校验自动记录、并发合并、生命周期、页面消费与运行态装配均已验证。后续新异常会自动进入日志；此前失败不回填，当前空表仍是如实状态。代码快更位于容器可写层，不代表镜像发布。既有未提交工作保持原样，未提交代码，没有新增 TODO。
