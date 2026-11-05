# 策略编写身份目标验收

## 范围与结论

2026-10-06 完成[可信身份 Task](../../archive/tasks/2026-10-05-strategy-identity.md) I4。当前开发目标的双用户注册、密码登录、草稿权限及会话撤销已通过实际 HTTP 验收；45 项 HTTP 状态检查、共享响应契约和数据库断言均通过。既有数据见证覆盖 77 张表，验收前后行数与内容摘要全部一致。

本叶只新增目标验收入口与文档检查点。应用源码、Schema、migration 和 Provider 配置未修改；复用已完成的官方更新，没有额外部署或重建。完整自然语言策略、正式保存、客户端和 G1—G3 的验收状态保持开放。

## 目标与部署依据

| 核对项 | 结果 |
| --- | --- |
| API | `http://127.0.0.1:3000/api/v1` |
| Compose project | `thesis-ledger-dev` |
| database / owner | `thesis_ledger / thesis_ledger` |
| SchemaVersion | `20261005143000_authoring_analysis_application` |
| migration / public 表 | 32 / 80 |
| Server / Worker image | `sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4` |
| PostgreSQL image | `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73` |
| 容器健康 | Server、Worker、PostgreSQL 在验收前后均 healthy，镜像保持 |

保数据部署与恢复演练复用[2026-10-05 目标部署证据](2026-10-05-journal-review-completion.md)。其正式入口为 `DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger bash scripts/update.sh thesis-ledger`，退出 0。本次只读复核恢复目录 `thesis-ledger-infra/.database-upgrades/run.tSho8O` 及备份：18,750,758 字节，SHA-256 `6fe09232dc40b7910370b8422d26eef6a375f2b5bd8cd1d540ee013038e97cec`，与原证据一致。

验收入口先确认精确目标、容器 project/健康、结构 head 与表数，并逐一比较宿主编译产物和目标 Server 模块 SHA-256。以下七个编译模块全部一致；源码摘要同时记录用于输入定位，不将其扩展为全应用编译一致证明。

| 模块 | 宿主及目标编译 SHA-256 | 当前源码 SHA-256 |
| --- | --- | --- |
| `identity/identity.controller` | `51abc675fe484b6529bc8430c72098a10d0cfc64493f73e957c2e1b97f6a5a98` | `8e2732b46d430052ed9a6ef3571810d70e14a38ac14d638be15f04421cb70d01` |
| `identity/identity.service` | `69c1ac909293029e902f9097006acbc6494910bd31ddf0a0cf9eb8910812ca28` | `a4c41c0557671cba37e2c80759281dcac57e0144d7b5c0cfc2e5cda80bf727e4` |
| `identity/identity.guard` | `ad54c13cb93f83ff57133cba80a8d51225543da66c72b991460eb15068a832d8` | `9a6d20892d0ca0ad76c525c4ff2b2e391142b70d78dcd964f5296265ebe16869` |
| `identity/identity-credentials` | `70fb17c8759a798b0bcf4bc2dc4f2c8bd62aba67cec1d7a254fe8f8802b9fef0` | `c79c21054e192efc5040fd026aad643199a262e57cf93ee7d868f4bed129b8a2` |
| `strategy-authoring/authoring-draft.controller` | `18af7b7b548e8843977d465e6ad948c602ec26d6a3cd2956a5dc00c81b7b3668` | `2d5612a7d04e1729de915650b216e7f70491a2495c03498caef745d2599ffd07` |
| `strategy-authoring/authoring-draft.repository` | `33a9abf82163903547e39c46ea272da999f7383879499091f82e6325b21926ab` | `7864ca9bac719212cc5ce40bed319a7bdc68ab6cadcd3b124cc6ff951b1e2318` |
| `strategy-authoring/authoring-store` | `88e14f3dbac893331239344620a2b88a6d120077ddb7de5bcb7ff1cea66dd03a` | `e21619c3290e91cc06c673de080e38d359198b015f4e77ccf9d92692fb160c31` |

## 实际命令与局部检查

工作目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。

```sh
rtk proxy node --check scripts/identity-target-acceptance.mjs
rtk proxy pnpm exec prettier --check scripts/identity-target-acceptance.mjs docs/tasks/2026-10-05-strategy-identity.md
rtk proxy node scripts/identity-target-acceptance.mjs --confirm=thesis-ledger-dev/thesis_ledger
```

语法与格式检查退出 0；省略确认参数时在任何目标操作前退出 1。脚本 SHA-256：`c56afacf24a6a9572c482b43c1678ff68d1212c454e81aed27bbd1e4bcd91fd1`。

仓库 ESLint 默认忽略全部 `*.mjs`；强制 `--no-ignore` 会因这些文件不属于类型项目而无法加载 typed rule，未计为通过。另用项目已安装的 `ESLint` 与 `@eslint/js` recommended 配置、明确 Node/Web globals 对单个入口检查，0 errors / 0 warnings。没有修改仓库 ESLint 配置。应用和部署输入未变，沿用 I3 与已有官方更新的类型、构建、结构及隔离验收，不重复执行全量测试或镜像构建。

## 双用户 HTTP 断言

| 场景 | 实际结果 |
| --- | --- |
| 匿名身份、匿名草稿、随机伪造会话、用户 UUID 冒充会话 | 401 |
| 两个用户注册及用户名规范化 | 201；不同用户 UUID，用户名转为小写 |
| 同名规范化注册 | 409 |
| 实际密码登录 | 200；恢复相同 principal，并使用新会话继续分页读取原草稿 |
| 错误密码与不存在用户名 | 401；响应完全一致 |
| 两个用户分别创建未完成草稿 | 201；Alice 两份、Bob 一份，响应符合共享 Schema，validation 为 incomplete |
| 双向读取、更新、丢弃他人草稿 | 全部 404 |
| 所属用户读取、列表与分页 | 200；各自列表只含自己的草稿，分页无遗漏、无重复 |
| 正文及查询 owner 注入 | 400 |
| 同 expectedRevision 的两个并发 PATCH | 恰好一个 200、一个 409 |
| 旧修订及关闭后更新 | 409 |
| 所属用户丢弃与收尾 | 201；三份草稿全部 discarded |
| 三个会话撤销及其后身份/草稿访问 | 撤销 204；后续均 401 |
| 数据库存储形式 | 两个用户均为 scrypt-v1；三条 tokenDigest 与内存中凭据的 SHA-256 一致 |

本入口使用真实不透明会话，不自报 owner。注册响应和草稿读取通过共享严格 Schema。密码、明文会话与网关凭据只在进程内存，不写入报告。过期及禁用用户的拒绝沿用[I3 隔离证据](2026-10-05-strategy-identity-isolated.md)，本次没有对目标库执行人为过期或禁用 SQL。

## 首次失败与复验

首轮标记 `i4_20261005_5e450925`，完成 44 项 HTTP 检查后，在最后一个已撤销会话的草稿读取验证遇到全局限流 429，入口退出 1。草稿已全部丢弃、会话已全部撤销，77 张受保护表摘要保持。原失败保留，未改记成功。

根因是现有全局限流按来源 IP 和请求方法计数，`identity/strategy-authoring` 为重操作，每分钟上限 20；首轮 GET 总数超过此上限。验收入口仅对明确返回 `rate_limited` 且具有 1—60 秒 `Retry-After` 的中间件拒绝作最多两次等待重试；其他状态仍按原断言失败，不修改产品限流。

复验标记 `i4_20261005_40a56083`，UTC `2026-10-05T17:56:04.224Z` 至 `2026-10-05T17:57:08.291Z`，退出 0，45 项 HTTP 检查通过。最后一项按 `Retry-After: 60` 等待一次后取得 401；限流等待独立记录，不算业务断言通过。标记日期按 UTC 生成，执行日期为北京时间 2026-10-06。

| 报告 | 原始记录路径 | SHA-256 |
| --- | --- | --- |
| 首轮失败 | `/private/tmp/tl-identity-target-i4-20261006.json` | `4552e05caafd8d9fee8752f75d10cea804b362eb6d5a2521bcdca68a5acc6f58` |
| 完整复验 | `/private/tmp/tl-identity-target-i4-20261006-r2.json` | `25bce3c3166c5a21be4fad5812b80e705df9887abffeb4138ee47d999193425d` |

## 数据保留与标记记录

每轮只通过 HTTP 创建两个随机标记用户、三份草稿和三个会话。两轮合计保留四个标记用户、六份 discarded 草稿、六个已撤销会话供审计；未删除其他用户或记录。SQL 只在 `BEGIN READ ONLY` 中读取；Docker 仅用于只读 inspect、读取编译文件和只读 SQL。

本次标记记录按精确用户名前缀筛选，排除其用户、关联会话、草稿和修订后比较既有数据。第二轮也保护第一轮已收尾记录。健康与调度日常变动表 `AutomationJob`、`ProviderHealth`、`ProviderHealthCheck` 明确不纳入静态摘要；它们不构成数据保留通过的证据。其余 77 张表（包含既有 Ledger、Journal、AI、Strategy 与回测记录）行数及内容摘要均未变。

完整复验的见证映射按键排序、紧凑 JSON 编码后 SHA-256 为 `c21359797beca7d42750bf6c6a26f06ffa2d96fcf13bc1228766c1b155c41b62`。每张表摘要是按行内容 MD5 排序聚合的 MD5，用于此次前后变更检测；表内业务数据未写入报告。

| 受保护表 | 验收前后行数 | 验收前后内容摘要 |
| --- | --- | --- |
| `Account` | 4 | `ad811bbd797463446e2d316fe7fcdc79` |
| `AccountCostStrategyVersion` | 3 | `0a2018bfe340f724b0bc2824e6620964` |
| `AccountLedgerState` | 3 | `ba8140b7f8bbd9046bafe440b97a0c0d` |
| `AccountValuationPoint` | 6 | `a0e5d29d6013b727bff89bef5306db2e` |
| `AiDecisionLog` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiInvocation` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiInvocationFact` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AiRoutingSettings` | 1 | `804cf30058ee5278ec419d7b3363ff37` |
| `AiRun` | 22 | `fc7bb6f535387bebadf060520925b004` |
| `AiToolCall` | 10 | `08f19b07cb40234e511237fa82b6de1b` |
| `Asset` | 2 | `39dede2e11562e8baa03d14fe2176892` |
| `AuditLog` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `AutomationRun` | 56 | `99088f297855016173cef66ca8e43221` |
| `AutomationRunLease` | 56 | `47ccc2d79d1cf3b50a928f8d885b9a90` |
| `BacktestJob` | 47 | `588ace58b23288ce9ebbb5f47aca14db` |
| `BaselineObservationBatch` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `CashBalance` | 3 | `2617ae182885b52c63651984928a057f` |
| `CashSettlement` | 6 | `a1bf98ac330388487d903bf22909cf07` |
| `CatalogSyncState` | 1 | `1cadd81bec0728021e9a645db6b1e285` |
| `DataQualityIssue` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `DesiredProviderPolicy` | 1 | `cb0923972a7f2c61c1f0387186387567` |
| `DesiredProviderPolicyLegacyArchive` | 1 | `f47e6ef8332e9f3f8ee60a747c4fa280` |
| `DesiredProviderPolicyRevision` | 10 | `16bdf9ab7175935f70b81938ff23e7b3` |
| `DesiredProviderPolicyRevisionLegacyArchive` | 3 | `3eff3c0f0e3829d1a63418eec1185e50` |
| `FundNavPoint` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `IdentitySession` | 3 | `dc736fe7101f598e9adea05e67f879d2` |
| `IdentityUser` | 2 | `72d3260192ab1381fb80e5a1282c4d28` |
| `ImportDraft` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `ImportDraftRevision` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `Instrument` | 36010 | `a9b124e5791379b8d781106cbcc114e2` |
| `InstrumentAssetAssociation` | 2 | `034eab438b31a633540f2236acae6936` |
| `JournalEntry` | 1 | `cb9132b40e318f22e5ad733b14cab020` |
| `JournalReviewSnapshot` | 2 | `620e9b2942aef7aec4e0eded09417bf6` |
| `LedgerEvent` | 21 | `39896d47987b00cada3112c77b94704d` |
| `MarketBarSeriesCoverageArchive` | 6 | `33b59f8f1fed4d8825d1912379505388` |
| `MarketBarSeriesFactArchive` | 1899 | `7d9098ff820520370c06be882ca36065` |
| `MarketBarWindowEvidenceV3` | 24 | `9d0a09f2b00dc38b91200659b26eaf7e` |
| `MarketDerivedSeriesSnapshotV3` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `NavBacktestPreparation` | 6 | `cc9c73f8183a64de47f8d821d1333046` |
| `NotificationDelivery` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `OptimizationAdoption` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `OptimizationAttempt` | 13 | `2d1b5f11efb0e6ea570f7e506d8540db` |
| `OptimizationCandidate` | 3 | `7e7ab88680f61fb65de1daee20846f6b` |
| `OptimizationExperiment` | 13 | `64461a2e6715e728ff9c1c324a64c390` |
| `PortfolioSnapshot` | 3 | `4f1e46722dc9aad8d01e1887e34e7c64` |
| `Position` | 2 | `89dbcbde16c067ab9afd028848d953c3` |
| `ProviderConfig` | 2 | `5437d562c436058755204f4956d99e47` |
| `ProviderTombstone` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RecurringCashDepositOccurrence` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RecurringCashDepositPlan` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RecurringFundInvestmentOccurrence` | 3 | `94b31477505d1fb9aa5e5cfb492bbefb` |
| `RecurringFundInvestmentPlan` | 2 | `f2fb0fa7b100ad0330a17b48a8cfb172` |
| `RiskEvent` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RiskPositionState` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RiskRule` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RiskRuleAudit` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `RiskRuleTriggerState` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `SchemaVersion` | 1 | `175403f5bf7ba66eb8247f8cf58d6ae2` |
| `Strategy` | 16 | `a1eeb94fa7ff5d7c2f5a572606965452` |
| `StrategyAuthoringDraft` | 3 | `3e803de99f396490f08ad168c6a7f620` |
| `StrategyAuthoringOperation` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyAuthoringProposal` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyAuthoringRevision` | 4 | `56a8618fc20101e22822230050d5f98c` |
| `StrategyAuthoringSource` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyRiskApplication` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyRiskApplicationAudit` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `StrategyVersion` | 20 | `510a67251961ef895fded8d98817d4b8` |
| `TargetAllocation` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `Trade` | 3 | `09043a8d72eed46a4b84c8e7b58d8cb9` |
| `TradeBaselineComponent` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `TradeCloseAllocation` | 2 | `9d2ee822f68441fcc1fd33ddf3267a09` |
| `TradeCloseSlice` | 2 | `ce4b61ae8bab47456101d669716e8ddc` |
| `TradeCorporateActionAdjustment` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `TradeDividendAttribution` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `TradeEntryLeg` | 3 | `642355f1b247f1c3e208b0a6d1b7de60` |
| `TradeEvidenceSource` | 5 | `65ec069fcbdbf28099e639944311890c` |
| `TradePlan` | 1 | `b4f8d293d88e22b3389fcc0182cef752` |

## 一次最终一致性检查

I4 的依赖、目标身份、当前结构、编译输入、真实双用户 HTTP、标记记录收尾与既有数据摘要全部有对应证据，I4 可勾选完成。身份到编写的现行单向依赖未修改，仓库其他 dirty 工作保持。本次没有发起编写付费操作、正式策略保存或回测。

原 T01 分组及所有产品 AC、G1—G3 保留开放；T03 的完整分析/生成语义、T04 的正式策略归属与原子保存、T06 的客户端登录/恢复仍由后续叶实施。本叶完成后停止。
