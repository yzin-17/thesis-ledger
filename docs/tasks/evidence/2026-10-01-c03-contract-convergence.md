# C03 合同收敛执行与验收记录

所属：[Canonical Task](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md) C03；依据：[Canonical Spec](../../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md) §3。用户于本轮要求完成整个 C03，执行范围扩展至全部合同收敛叶及主 Task 状态同步。

## 执行边界

保留当前策略 AST 的 `schemaVersion=2`、Ledger `version=3` 与独立 `payloadVersion`、当前冻结证据标识。清理以实际生产消费者和合同所有权为依据。现行费用、现金、份额、公司行动、基准及 NAV 语义保持。数据库范围仅为 C03-b.1 的显式合同版本默认值治理及对应官方保数据更新；不实施其他 Canonical 父组，不提交。

开始时主仓存在 850 项未提交改动；按文件保存当前内容基线，所有替换基于当前内容，不回退其他工作。

| 叶 | 结果与写集 | 依赖 | 验证 | 状态 |
| --- | --- | --- | --- | --- |
| C03-a.1 | 无消费者旧 Ledger 纯导出删除 | 已完成 | 复用[原证据](2026-10-01-c03-a1-unused-ledger-domain.md) | 完成 |
| C03-a.2 | 移除旧 RunConfig decoder/别名；当前校验和执行消费使用现行配置；迁移经济测试输入 | 当前配置、来源协议 | Schemas/Server 定向、全包和下游类型 | 完成 |
| C03-a.3 | 删除旧 runBacktest、旧专属类型/helper/test；保留现行 Exchange 编排 | 生产引用核对 | Domain 现行经济与基准 golden、包级 | 完成 |
| C03-b | 策略、运行合同与经济结果按领域归属导出，消除旧命名别名与双基准算法入口 | a.2/a.3 | Schema/Domain、当前 Server 消费、快照身份 | 完成 |
| C03-b.1 数据库默认值 | 删除 Strategy/StrategyVersion 的旧版本默认值，显式声明版本；新增 migration，不修改历史 migration/数据 | 创建路径均显式写入 2 | Schema diff/validate、matrix/打包门禁、隔离 PostgreSQL、官方目标更新 | 完成 |
| C03-c | 当前 Ledger 公共类型/Schema 归属与命名收口；消费者同步；旧信封仍拒绝 | E03 已完成 | Ledger 命令/投影/经济回归及下游类型 | 完成 |
| C03 验收 | 最终生产引用反查、公共导出、包级与边界门禁；更新 Task | 全部叶 | 当前工作区验证，区分已有目标证据 | 完成 |

每叶先完成定向验证；共享包构建按依赖顺序执行。主 Task、公共入口与边界脚本由当前执行者独占更新。只修改本叶涉及的源码、消费者和测试，不做全仓格式化。发现新的独立结果时先补叶再实施；检查失败保留事实并修复关联问题，不降低验收标准。

## 结果与验证

### 源码结果

- a.2：删除 runConfigSchemaV2、无版本 alias/type 和 Domain 中无消费者的 RunConfig；当前执行与跨合同校验使用 RunConfigV3。直接调用 Exchange 时也先解析现行配置，旧配置在读取事实之前拒绝；移除旧配置分派、截掉期末决策及旧公司行动记账分支。
- a.3：删除旧 number runBacktest、simulateAStockExecution、旧专属类型/算法测试；保留旧测试文件中仍独立消费的通用分析断言。生产引用核对还确认 runCnNavVertical 仅由旧测试调用，已删除旧 NAV 编排及专属用例；当前 N3/N4 的 NAV 冻结、Worker 和 Domain 执行保留。
- b：Schemas 按值、策略、运行和结果拆分；Domain 按策略词汇与模拟结果词汇拆分，分析层收敛为 backtest-result-analytics。删除旧 strategySchemaV1 与专属测试、number compareBenchmark 和 legacyZeroCostBenchmarkAssumption。当前基准缺费用事实明确不可用，显式冻结费用、身份比较、同执行序列基准及经济 golden 保留。
- c：Ledger、Trade、Baseline/Import 公共类型和 Schema 使用领域名称，所有生产具名消费者同步；金额原语从 Ledger 命令模块独立，回测及其他金额消费者直接依赖 monetary-values。当前信封 version=3、经济 payloadVersion、修订/撤销及旧行拒绝未改变。
- b.1：Strategy/StrategyVersion 移除两个 @default(1)；新增 20261001120000_require_explicit_strategy_contract，既有 SQL 不改。发现三个集成夹具依赖旧默认，均改为显式声明 2。Schema diff 中的其他在途修改保持原状。
- 门禁：check-boundaries 固化领域内核与 JSON 合同方向、策略不得依赖运行/结果、金额原语不得反向依赖 Ledger/Backtest，以及旧模块导入拒绝；原隔离审计补充 ledger-contract 名称。公共导出测试核对旧能力不可消费、当前经济能力继续存在。

### 测试输入迁移

旧经济用例改为显式当前配置及价格/历史协议，未建立自动补齐 decoder。当前 raw-events 的公司行动 fixture 显式提供 effectiveDate：晚于生效开盘才可见的事实拒绝，已知事实按生效日记账；100 份 × 1 元现金分红进入收益。期末无下一根 Bar 的 DAY 订单显式 DAY_EXPIRED，不伪造成交。现行独立参考、公司行动、T+1/费用、冻结身份、基准及 NAV 回归保留。

消费者门禁发现两处既有 lint 问题：Desktop 策略编辑的数组元素加 unknown 标注，schemaAsOf 保持原函数签名与“未知”返回；旧实验拒绝用例改为显式删除字段，避免未用的解构变量。只调整相应类型与夹具表达，没有改变产品操作。

### 本地验证

| 检查 | 结果与范围 |
| --- | --- |
| Schemas 定向 | 最初配置/冻结 42 项通过；当前 Ledger/公共导出/合同 77 项通过；最终优化/公共导出 18 项通过 |
| Schemas 全包 | 50 文件 585 项通过；新增公共导出用例，移除旧策略 decoder 专属 4 项 |
| Domain 全包 | 38 文件 295 项通过；相对 a.1 的 317 项减少旧入口 21 项及旧 number 基准 1 项，现行独立参考与经济用例保留 |
| Server 定向 | 当前 Exchange、公司行动、研究执行与基准 22 项通过；Run 经济关联 5 项及 NAV 离线 15 项通过 |
| Server 全包 | 246 文件通过、30 文件跳过；1994 项通过、109 项跳过。命令为 pnpm --filter @thesis-ledger/server exec vitest run --no-file-parallelism；跳过项不作为集成通过 |
| API Client 全包 | 8 文件 46 项通过 |
| Desktop 全包 | 79 文件 523 项通过；最后类型标注调整后另跑策略消费 4 文件 10 项通过 |
| 类型/构建 | Domain、Schemas、Server、API Client、Desktop 类型与构建通过；生成当前 Prisma Client。最后仅删除未用声明或调整类型标注的输入复用相关行为回归，重跑相应类型与构建 |
| 限定 lint | C03 源码/消费者的 ESLint 通过；未全仓格式化。脚本由其独立 Node 门禁验证 |
| 结构静态 | Prisma validate 使用一次性占位 DATABASE_URL；matrix 为 26 份 SQL、71 张 SQL 表、60 个 Prisma model、11 张 raw-owned 表；runtime 打包 26 份 SQL 通过 |
| 隔离 PostgreSQL | strategy-contract-postgres.integration.test.ts 3 项通过；独立 postgres:17-alpine 容器按实际 migration 建库，在增量迁移前插入旧行，验证旧行/JSON 保留、缺版本拒绝、显式 AST2 创建。测试容器已停止并自动移除 |
| 依赖/边界 | 工作区 8 包依赖图、check-boundaries、backtest-v2-isolation-audit 通过，后者扫描 158 文件 |

### 目标更新与最终复核

已核对目标 Compose 项目 thesis-ledger-dev、数据库 thesis_ledger、owner thesis_ledger；源 head 为 20261001100000_nav_backtest_preparation，两处旧默认均为 1。按项目入口执行 DEV_DATABASE_MODE=upgrade、DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger 的 ./scripts/update.sh thesis-ledger。

首次构建被沙箱的 ~/.docker/buildx/activity 写权限拒绝，脚本自行重试一次后退出；随后申请必要权限重跑同一官方入口，最终退出码 0。备份与演练位于相邻 infra 的 `.database-upgrades/run.lHqhdR`，rehearsal.json 确认旧 head 恢复、新 head 升级、结构完整、app role 权限和旧数据保留全部通过。没有重建 public、删除目标卷、绕过官方入口或手工复制运行代码。

目标只读核对确认数据库与 owner 仍为 thesis_ledger，head 已到 20261001120000_require_explicit_strategy_contract，两处 column_default 均为空；Strategy/StrategyVersion 为 16/20 行，数据保留由演练的完整 witness 核验。Server/Worker 同镜像 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，均 healthy，Worker 报告 backtest.worker.ready，没有本轮缺表/启动失败日志。

在目标真实运行包导入 Schemas/Domain，当前解析器和 Exchange/NAV/SimulationLedger 能力存在，旧公共导出不存在，完整旧配置拒绝；进一步确认 8 个旧包模块文件在镜像中不存在。核对当前 9 个核心编译模块：8 个字节摘要与宿主构建一致；结果解析器唯一差异是格式化后 import 列表的尾随逗号，TypeScript 解析的完整 AST 逐节点相同，不是不同合同实现。源数据格式、参数、结果身份与经济行为未因格式调整变化。

新模块、结果解析器、执行包与 Spec 的 Prettier 检查通过；文件尺寸脚本通过但报告 10 个存量文件 warning，因没有提供 Git baseline，不能据此宣称全仓 ratchet 已被强制验证。本轮这些存量大文件仅同步既有类型名称，没有新增业务职责；当前合同模块和专属测试按职责拆分或缩减。

最终一致性复核通过，C03-a/b/c 及数据库默认值叶均完成，主 Task 可勾选 C03。本轮没有新增 Provider 资格、真实业务 Run、浏览器或 Electron 验收；已有 E03/N3/N4 证据仍按其原始范围引用。

以开始时 1604 个源码/测试/配置输入的摘要为基线，最终 198 个既有输入变化、14 个新增输入；10 个旧文件删除。差异均属于上列各叶和消费者映射，没有观测到本范围外输入变化。额外 SQL/Prisma/文档按显式写集治理；未暂存、提交或回退其他 WIP。C03 的合同收口不替代 C02/C04/E02/E04/U01/U02/D02 的产品门禁，也不重新声明已完成 E03/N3/N4 的真实来源、浏览器或 Electron 验收。
